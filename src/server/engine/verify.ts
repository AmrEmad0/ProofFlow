import type { ApprovedPlan, ProofStep } from "../../shared/proof-plan";
import { findingSchema, type Finding } from "../../shared/receipt";
import { ANALYSIS_FPS, type ConceptTrack, type TrackBox } from "../../shared/verification";
import type { Observation } from "../../shared/observation";
import { verificationDiagnosticsSchema, type StepCheck, type TrackWindow } from "../../shared/diagnostics";

export const VERIFICATION_RULE_VERSION = "2026-10-28.1";
type Candidate = Observation["candidates"][number];
type Anchor = { objectId: string; firstFrame: number };
const canonical = (concept: string) => concept.trim().toLowerCase();

function continuousTrack(track: ConceptTrack | undefined, first: number, last: number, objectId?: string): TrackBox[] | null {
  if (!track || track.outcome !== "completed" || last - first < 1) return null;
  const boxes: TrackBox[] = [];
  for (let frame = first; frame <= last; frame++) {
    const matches = track.boxes.filter((box) => box.frameIndex === frame && (objectId === undefined || box.objectId === objectId));
    if (matches.length !== 1) return null;
    boxes.push(matches[0]!);
  }
  return new Set(boxes.map((box) => box.objectId)).size === 1 ? boxes : null;
}

function describeTrack(concept: string, track: ConceptTrack | undefined, first: number, last: number): TrackWindow {
  const boxes = track?.boxes.filter((box) => box.frameIndex >= first && box.frameIndex <= last) ?? [];
  const frames = Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => index + first);
  const at = (frame: number) => boxes.filter((box) => box.frameIndex === frame);
  return {
    concept, outcome: track?.outcome ?? "missing", selectedObjectId: null,
    missingFrames: frames.filter((frame) => at(frame).length === 0),
    multipleFrames: frames.filter((frame) => at(frame).length > 1),
    objects: [...new Set(boxes.map((box) => box.objectId))].map((objectId) => {
      const object = boxes.filter((box) => box.objectId === objectId);
      return { objectId, frames: new Set(object.map((box) => box.frameIndex)).size,
        firstFrame: Math.min(...object.map((box) => box.frameIndex)), lastFrame: Math.max(...object.map((box) => box.frameIndex)),
        missingFrames: frames.filter((frame) => !object.some((box) => box.frameIndex === frame)),
        duplicateFrames: frames.filter((frame) => object.filter((box) => box.frameIndex === frame).length > 1) };
    }),
  };
}

function overlap(subject: TrackBox, region: TrackBox): number {
  const width = Math.max(0, Math.min(subject.right, region.right) - Math.max(subject.left, region.left));
  const height = Math.max(0, Math.min(subject.bottom, region.bottom) - Math.max(subject.top, region.top));
  return Math.min(1, width * height / ((subject.right - subject.left) * (subject.bottom - subject.top)));
}

function refs(boxes: TrackBox[], concept: string) {
  return [boxes[0]!, boxes.at(-1)!].map((box) => ({ concept, objectId: box.objectId, frameIndex: box.frameIndex }));
}

function evaluateEntry(step: ProofStep, candidate: Candidate, check: StepCheck, subjectTrack: ConceptTrack | undefined,
  regionTrack: ConceptTrack | undefined, subjectAnchor: Anchor | undefined, targetAnchor: Anchor | undefined): StepCheck {
  const first = check.firstFrame!;
  const last = check.lastFrame!;
  const base = check.finding;
  const events: { subject: TrackBox[]; region: TrackBox[]; diagnostic: StepCheck["regionCandidates"][number] }[] = [];
  const targetIds = targetAnchor ? [targetAnchor.objectId] : [...new Set(regionTrack?.boxes.map(box => box.objectId))];
  if (subjectTrack?.outcome === "completed" && regionTrack?.outcome === "completed") {
    for (const targetId of targetIds) {
      let subject: TrackBox[] = [];
      let region: TrackBox[] = [];
      function saveSegment() {
        if (subject.length < 2) return;
        const containment = subject.map((box, index) => ({ frameIndex: box.frameIndex, ratio: overlap(box, region[index]!) }));
        let outsideIndex = -1;
        let insideCount = 0;
        let endIndex = -1;
        for (let index = 0; index < containment.length; index++) {
          const ratio = containment[index]!.ratio;
          if (ratio <= 0.05) outsideIndex = index;
          insideCount = ratio >= 0.95 && outsideIndex >= 0 ? insideCount + 1 : 0;
          if (insideCount >= 3) { endIndex = index; break; }
        }
        const diagnostic: StepCheck["regionCandidates"][number] = {
          objectId: targetId, subjectObjectId: subject[0]!.objectId,
          outsideFrame: outsideIndex < 0 ? null : subject[outsideIndex]!.frameIndex,
          endFrame: endIndex < 0 ? null : subject[endIndex]!.frameIndex,
          qualifies: endIndex >= 0, containment,
        };
        check.regionCandidates.push(diagnostic);
        if (endIndex < 0) return;
        const eventSubject = subject.slice(outsideIndex, endIndex + 1);
        const eventRegion = region.slice(outsideIndex, endIndex + 1);
        const end = eventSubject.at(-1)!.frameIndex;
        if (subjectAnchor && !continuousTrack(subjectTrack, Math.min(subjectAnchor.firstFrame, eventSubject[0]!.frameIndex), end, subjectAnchor.objectId)) return;
        if (targetAnchor && !continuousTrack(regionTrack, Math.min(targetAnchor.firstFrame, eventRegion[0]!.frameIndex), end, targetAnchor.objectId)) return;
        events.push({ subject: eventSubject, region: eventRegion, diagnostic });
      }
      // Only use actual consecutive samples. A gap or identity change ends a segment;
      // no interpolation may supply the missing part of an action.
      for (let frame = first; frame <= last; frame++) {
        const subjects = subjectTrack.boxes.filter(box => box.frameIndex === frame && (!subjectAnchor || box.objectId === subjectAnchor.objectId));
        const regions = regionTrack.boxes.filter(box => box.frameIndex === frame && box.objectId === targetId);
        if (subjects.length !== 1 || regions.length !== 1) {
          saveSegment(); subject = []; region = []; continue;
        }
        if (subject.length && subject[0]!.objectId !== subjects[0]!.objectId) {
          saveSegment(); subject = []; region = [];
        }
        subject.push(subjects[0]!); region.push(regions[0]!);
      }
      saveSegment();
    }
  }
  const pairs = new Set(events.map(event => JSON.stringify([event.subject[0]!.objectId, event.region[0]!.objectId])));
  if (candidate.actionVisible && candidate.beforeMatches && candidate.afterMatches && pairs.size === 1) {
    const event = events.sort((a, b) => a.subject.at(-1)!.frameIndex - b.subject.at(-1)!.frameIndex)[0]!;
    check.subject!.selectedObjectId = event.subject[0]!.objectId;
    check.target!.selectedObjectId = event.region[0]!.objectId;
    return { ...check, decision: "entry_geometry", finding: { ...base, status: "observed",
      startMs: Math.round(event.subject[0]!.frameIndex * 1000 / ANALYSIS_FPS),
      endMs: Math.round(event.subject.at(-1)!.frameIndex * 1000 / ANALYSIS_FPS),
      evidence: [...refs(event.subject, step.subjectConcept), ...refs(event.region, step.targetConcept!)],
      explanation: "Muse's visible entry proposal is grounded by one unique subject/target pairing, continuously tracked from outside to three consecutive inside samples. Inspect the clip; 2D geometry does not certify hidden contents." } };
  }
  if (pairs.size > 1) return { ...check, decision: "entry_geometry", finding: { ...base,
    explanation: "More than one subject/target pairing supports entry. The intended objects remain ambiguous; review the video." } };
  return { ...check, decision: "entry_geometry", finding: { ...base,
    explanation: "No unique, continuously tracked outside-to-inside transition supports the proposal. Missing detections, overlap, or disappearance cannot establish entry." } };
}

function evaluate(step: ProofStep, candidate: Candidate | undefined, tracks: ConceptTrack[], frameCount: number, anchors: Anchor[], targetAnchors: Anchor[]): StepCheck {
  const base: Finding = { stepId: step.id, status: "uncertain", startMs: candidate?.startMs ?? null, endMs: candidate?.endMs ?? null,
    explanation: "Muse did not locate a usable event window. This does not establish that the action never happened.", evidence: [] };
  const check: StepCheck = { stepId: step.id, firstFrame: null, lastFrame: null, subject: null, target: null,
    regionCandidates: [], decision: "no_window", finding: base };
  function finish(decision: StepCheck["decision"], finding: Finding): StepCheck { return { ...check, decision, finding }; }
  if (!candidate || candidate.startMs === null || candidate.endMs === null) return check;
  // Muse's millisecond windows are approximate; map to the nearest sample so
  // 1167ms does not accidentally exclude frame 7 (1166.67ms).
  const first = Math.max(0, Math.round(candidate.startMs * ANALYSIS_FPS / 1000));
  const last = Math.min(frameCount - 1, Math.round(candidate.endMs * ANALYSIS_FPS / 1000));
  if (first >= last || candidate.startMs > candidate.endMs) return check;
  check.firstFrame = first; check.lastFrame = last;
  const subjectTrack = tracks.find((track) => canonical(track.concept) === canonical(step.subjectConcept));
  const regionTrack = tracks.find((track) => canonical(track.concept) === canonical(step.targetConcept ?? ""));
  check.subject = describeTrack(step.subjectConcept, subjectTrack, first, last);
  if (step.targetConcept) check.target = describeTrack(step.targetConcept, regionTrack, first, last);
  if (candidate.actionVisible && candidate.nonOccurrenceVisible) return finish("contradictory_proposal", { ...base, explanation: "The visual proposal contains contradictory action evidence. Human review is needed." });
  if (candidate.visibility !== "clear" || candidate.ambiguities.length > 0) {
    return finish("ambiguous_proposal", { ...base, explanation: "The proposed evidence is occluded or ambiguous. Review the recording; a missed or hidden action cannot be ruled out." });
  }
  if (new Set(anchors.map(item => item.objectId)).size > 1 || new Set(targetAnchors.map(item => item.objectId)).size > 1) {
    return finish("subject_track", { ...base, explanation: "Earlier evidence established conflicting object identities. Human review is needed before linking this step." });
  }
  // Reuse an identity established by an earlier observed step, with uninterrupted
  // geometry between the steps. Never choose a box just because it is largest.
  const anchor = new Set(anchors.map((item) => item.objectId)).size === 1 ? anchors[0] : undefined;
  const targetAnchor = targetAnchors[0];
  if (step.checkType === "object_enters_region") {
    const entry = evaluateEntry(step, candidate, check, subjectTrack, regionTrack, anchor, targetAnchor);
    if (entry.finding.status === "observed" || entry.regionCandidates.some(region => region.qualifies)) return entry;
    const allSubjects = continuousTrack(subjectTrack, 0, frameCount - 1, anchor?.objectId);
    const allRegions = continuousTrack(regionTrack, 0, frameCount - 1, targetAnchor?.objectId);
    if (!candidate.actionVisible && candidate.nonOccurrenceVisible && candidate.searchComplete && allSubjects && allRegions
      && allSubjects.every((box, index) => overlap(box, allRegions[index]!) <= 0.05)) {
      check.subject!.selectedObjectId = allSubjects[0]!.objectId;
      check.target!.selectedObjectId = allRegions[0]!.objectId;
      return finish("entry_geometry", { ...base, status: "not_observed", startMs: 0, endMs: Math.round((frameCount - 1) * 1000 / ANALYSIS_FPS),
        evidence: [...refs(allSubjects, step.subjectConcept), ...refs(allRegions, step.targetConcept!)],
        explanation: "Entry was not observed in the sampled clip: the continuously tracked subject stays outside the continuously tracked region. This does not rule out actions between sampled frames or outside the recording." });
    }
    return entry;
  }
  const subjectFirst = step.checkType === "object_present_at_end" ? Math.max(0, frameCount - 3) : first;
  const subjectLast = step.checkType === "object_present_at_end" ? frameCount - 1 : last;
  if (step.checkType === "object_present_at_end") {
    check.firstFrame = subjectFirst; check.lastFrame = subjectLast;
    check.subject = describeTrack(step.subjectConcept, subjectTrack, subjectFirst, subjectLast);
    if (last < subjectFirst) return finish("final_presence", { ...base, explanation: "The visual proposal does not cover the end of the recording. Final presence remains uncertain." });
  }
  const linked = anchor ? continuousTrack(subjectTrack, Math.min(subjectFirst, anchor.firstFrame), subjectLast, anchor.objectId) : null;
  const subject = anchor ? linked?.filter((box) => box.frameIndex >= subjectFirst) ?? null : continuousTrack(subjectTrack, subjectFirst, subjectLast);
  if (!subject) return finish("subject_track", { ...base, explanation: "A single continuous subject track could not be grounded across the event. Missing tracks are not evidence that the action never happened." });
  check.subject.selectedObjectId = subject[0]!.objectId;
  base.startMs = Math.round(subjectFirst * 1000 / ANALYSIS_FPS);
  base.endMs = Math.round(subjectLast * 1000 / ANALYSIS_FPS);
  base.evidence = refs(subject, step.subjectConcept);
  const supported = candidate.actionVisible && candidate.beforeMatches && candidate.afterMatches;

  if (step.checkType === "object_present_at_end") {
    const ending = continuousTrack(subjectTrack, Math.max(0, frameCount - 3), frameCount - 1, anchor?.objectId);
    if (candidate.afterMatches && ending && ending[0]!.objectId === subject[0]!.objectId) {
      return finish("final_presence", { ...base, status: "observed", startMs: Math.round(ending[0]!.frameIndex * 1000 / ANALYSIS_FPS),
        endMs: Math.round((frameCount - 1) * 1000 / ANALYSIS_FPS), evidence: refs(ending, step.subjectConcept),
        explanation: "Muse's final-state proposal is grounded by the same visible object across the final sampled frames." });
    }
    return finish("final_presence", { ...base, explanation: "Presence at the end could not be grounded. Disappearance or a missing final track remains uncertain." });
  }

  if (step.checkType === "visible_state_change") {
    if (supported) return finish("state_change", { ...base, status: "observed", explanation: "Muse proposes the required visible before/after change, grounded by one continuous SAM subject track. Inspect the clip to review those states." });
    // Negative findings require continuous positive scene coverage, never a missing detection.
    if (!candidate.actionVisible && candidate.beforeMatches && !candidate.afterMatches && candidate.nonOccurrenceVisible && candidate.searchComplete
      && continuousTrack(subjectTrack, 0, frameCount - 1)) {
      return finish("state_change", { ...base, status: "not_observed", startMs: 0, endMs: Math.round((frameCount - 1) * 1000 / ANALYSIS_FPS),
        evidence: refs(continuousTrack(subjectTrack, 0, frameCount - 1)!, step.subjectConcept),
        explanation: "The requested state change was not observed in the sampled clip. The subject remains continuously grounded and Muse reports the before-state persists; this does not certify events outside the recording." });
    }
    return finish("state_change", { ...base, explanation: "The tracked object is visible, but the required before/after change is not sufficiently supported." });
  }

  return check;
}

export function evaluateEvidence(plan: ApprovedPlan, observation: Observation, tracks: ConceptTrack[], frameCount: number) {
  const grounded = new Map<string, Anchor[]>();
  const checks: StepCheck[] = [];
  let latestEnd = -1;
  for (const step of plan.steps) {
    const check = evaluate(step, observation.candidates.find((candidate) => candidate.stepId === step.id), tracks, frameCount,
      grounded.get(canonical(step.subjectConcept)) ?? [], grounded.get(canonical(step.targetConcept ?? "")) ?? []);
    const finding = check.finding;
    if (finding.status === "observed" && finding.startMs !== null) {
      if (finding.startMs < latestEnd) {
        finding.status = "uncertain"; check.decision = "step_order";
        finding.explanation = "The proposed event conflicts with the approved step order. Review the recording to resolve the sequence.";
      } else {
        latestEnd = finding.endMs ?? finding.startMs;
        for (const ref of finding.evidence) {
          const key = canonical(ref.concept);
          grounded.set(key, [...grounded.get(key) ?? [], { objectId: ref.objectId, firstFrame: ref.frameIndex }]);
        }
      }
    }
    check.finding = findingSchema.parse(finding);
    checks.push(check);
  }
  const diagnostics = verificationDiagnosticsSchema.parse({ ruleVersion: VERIFICATION_RULE_VERSION, checks });
  return { findings: diagnostics.checks.map((check) => check.finding), diagnostics };
}

export function verifyEvidence(plan: ApprovedPlan, observation: Observation, tracks: ConceptTrack[], frameCount: number): Finding[] {
  return evaluateEvidence(plan, observation, tracks, frameCount).findings;
}

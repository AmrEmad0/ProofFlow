import type { ApprovedPlan, ProofStep } from "../../shared/proof-plan";
import { findingSchema, type Finding } from "../../shared/receipt";
import { ANALYSIS_FPS, type ConceptTrack, type TrackBox } from "../../shared/verification";
import type { Observation } from "../../shared/observation";
import { verificationDiagnosticsSchema, type StepCheck, type TrackWindow } from "../../shared/diagnostics";

export const VERIFICATION_RULE_VERSION = "2026-10-27.2";
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

function evaluate(step: ProofStep, candidate: Candidate | undefined, tracks: ConceptTrack[], frameCount: number, anchors: Anchor[]): StepCheck {
  const base: Finding = { stepId: step.id, status: "uncertain", startMs: candidate?.startMs ?? null, endMs: candidate?.endMs ?? null,
    explanation: "Muse did not locate a usable event window. This does not establish that the action never happened.", evidence: [] };
  const check: StepCheck = { stepId: step.id, firstFrame: null, lastFrame: null, subject: null, target: null,
    regionCandidates: [], decision: "no_window", finding: base };
  function finish(decision: StepCheck["decision"], finding: Finding): StepCheck { return { ...check, decision, finding }; }
  if (!candidate || candidate.startMs === null || candidate.endMs === null) return check;
  const first = Math.max(0, Math.ceil(candidate.startMs * ANALYSIS_FPS / 1000));
  const last = Math.min(frameCount - 1, Math.floor(candidate.endMs * ANALYSIS_FPS / 1000));
  check.firstFrame = first; check.lastFrame = last;
  const subjectTrack = tracks.find((track) => canonical(track.concept) === canonical(step.subjectConcept));
  const regionTrack = tracks.find((track) => canonical(track.concept) === canonical(step.targetConcept ?? ""));
  check.subject = describeTrack(step.subjectConcept, subjectTrack, first, last);
  if (step.targetConcept) check.target = describeTrack(step.targetConcept, regionTrack, first, last);
  if (candidate.actionVisible && candidate.nonOccurrenceVisible) return finish("contradictory_proposal", { ...base, explanation: "The visual proposal contains contradictory action evidence. Human review is needed." });
  if (candidate.visibility !== "clear" || candidate.ambiguities.length > 0) {
    return finish("ambiguous_proposal", { ...base, explanation: "The proposed evidence is occluded or ambiguous. Review the recording; a missed or hidden action cannot be ruled out." });
  }
  // Reuse an identity established by an earlier observed step, with uninterrupted
  // geometry between the steps. Never choose a box just because it is largest.
  const anchor = new Set(anchors.map((item) => item.objectId)).size === 1 ? anchors[0] : undefined;
  const linked = anchor ? continuousTrack(subjectTrack, Math.min(first, anchor.firstFrame), last, anchor.objectId) : null;
  const subject = anchor ? linked?.filter((box) => box.frameIndex >= first) ?? null : continuousTrack(subjectTrack, first, last);
  if (!subject) return finish("subject_track", { ...base, explanation: "A single continuous subject track could not be grounded across the event. Missing tracks are not evidence that the action never happened." });
  check.subject.selectedObjectId = subject[0]!.objectId;
  base.startMs = Math.round(first * 1000 / ANALYSIS_FPS);
  base.endMs = Math.round(last * 1000 / ANALYSIS_FPS);
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
        explanation: "The requested state change was not observed in the sampled clip. The subject remains continuously grounded and Muse reports the before-state persists; this does not certify events outside the recording." });
    }
    return finish("state_change", { ...base, explanation: "The tracked object is visible, but the required before/after change is not sufficiently supported." });
  }

  const regions = check.target!.objects.map((object) => continuousTrack(regionTrack, first, last, object.objectId)).filter((boxes): boxes is TrackBox[] => boxes !== null);
  check.regionCandidates = regions.map((region) => {
    const containment = subject.map((box, index) => ({ frameIndex: box.frameIndex, ratio: overlap(box, region[index]!) }));
    // Muse windows are approximate. Find an actual sampled outside state within
    // the window, then require three final inside frames; never bridge a gap.
    const outside = containment.slice(0, -3).find((sample) => sample.ratio <= 0.05);
    return { objectId: region[0]!.objectId, outsideFrame: outside?.frameIndex ?? null, containment,
      qualifies: Boolean(outside && containment.length >= 4 && containment.slice(-3).every((sample) => sample.ratio >= 0.95)) };
  });
  if (regions.length === 0) return finish("target_track", { ...base, explanation: "The target region could not be tracked continuously. Overlap or disappearance cannot establish entry." });
  const matches = check.regionCandidates.filter((region) => region.qualifies);
  if (supported && matches.length === 1) {
    const match = matches[0]!;
    const region = regions.find((boxes) => boxes[0]!.objectId === match.objectId)!;
    const entrySubject = subject.filter((box) => box.frameIndex >= match.outsideFrame!);
    const entryRegion = region.filter((box) => box.frameIndex >= match.outsideFrame!);
    check.target!.selectedObjectId = match.objectId;
    return finish("entry_geometry", { ...base, status: "observed", startMs: Math.round(match.outsideFrame! * 1000 / ANALYSIS_FPS),
      evidence: [...refs(entrySubject, step.subjectConcept), ...refs(entryRegion, step.targetConcept!)],
      explanation: "Muse's visible entry proposal is grounded by one unique continuous subject/target pairing, moving from outside to inside for three final sampled frames. Inspect the clip; 2D geometry does not certify hidden contents." });
  }
  if (matches.length > 1) return finish("entry_geometry", { ...base, explanation: "More than one tracked target supports the proposed entry. The intended region remains ambiguous; review the object IDs and video." });
  const allSubjects = continuousTrack(subjectTrack, 0, frameCount - 1);
  const allRegions = continuousTrack(regionTrack, 0, frameCount - 1);
  if (!candidate.actionVisible && candidate.nonOccurrenceVisible && candidate.searchComplete && allSubjects && allRegions
    && allSubjects.every((box, index) => overlap(box, allRegions[index]!) <= 0.05)) {
    check.target!.selectedObjectId = allRegions[0]!.objectId;
    return finish("entry_geometry", { ...base, status: "not_observed", startMs: 0, endMs: Math.round((frameCount - 1) * 1000 / ANALYSIS_FPS),
      explanation: "Entry was not observed in this sampled clip: the continuously tracked subject stays outside the continuously tracked region. This does not rule out actions between sampled frames or outside the recording." });
  }
  return finish("entry_geometry", { ...base, explanation: "The geometry does not show a sustained, continuously visible outside-to-inside transition. Simple overlap or disappearance is insufficient." });
}

export function evaluateEvidence(plan: ApprovedPlan, observation: Observation, tracks: ConceptTrack[], frameCount: number) {
  const grounded = new Map<string, Anchor[]>();
  const checks: StepCheck[] = [];
  let latestEnd = -1;
  for (const step of plan.steps) {
    const check = evaluate(step, observation.candidates.find((candidate) => candidate.stepId === step.id), tracks, frameCount, grounded.get(canonical(step.subjectConcept)) ?? []);
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

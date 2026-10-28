import { canonicalConcept as canonical, type ApprovedPlan, type ProofStep } from "../../shared/proof-plan";
import { findingSchema, type Finding } from "../../shared/receipt";
import { ANALYSIS_FPS, type ConceptTrack, type TrackBox } from "../../shared/verification";
import { structuredConflicts, type Observation } from "../../shared/observation";
import { verificationDiagnosticsSchema, type StepCheck, type TrackWindow } from "../../shared/diagnostics";

export const VERIFICATION_RULE_VERSION = "2026-10-28.8";
type Candidate = Observation["candidates"][number];
type Anchor = { objectId: string; firstFrame: number };
type EvaluatedStep = StepCheck & { actionEndMs?: number };
const fullyFramed = (box: TrackBox) => box.left > 0 && box.top > 0 && box.right < 1 && box.bottom < 1;

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

function visibleStateInstances(track: ConceptTrack | undefined, first: number, last: number): string[] {
  return [...new Set(track?.boxes.map(box => box.objectId))].filter(id => {
    const boxes = continuousTrack(track, first, last, id);
    // A frame-edge fragment cannot establish an object's visible before/after
    // states. Keep all fully framed continuous alternatives, regardless of size.
    return boxes && [boxes[0]!, boxes.at(-1)!].every(fullyFramed);
  });
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
  regionTrack: ConceptTrack | undefined, subjectAnchor: Anchor | undefined, targetAnchor: Anchor | undefined): EvaluatedStep {
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
        const transitions: { outsideIndex: number; endIndex: number }[] = [];
        for (let index = 0; index < containment.length; index++) {
          const ratio = containment[index]!.ratio;
          if (ratio <= 0.05) outsideIndex = index;
          insideCount = ratio >= 0.95 && outsideIndex >= 0 ? insideCount + 1 : 0;
          if (insideCount >= 3) {
            transitions.push({ outsideIndex, endIndex: index });
            outsideIndex = -1; insideCount = 0;
          }
        }
        if (!transitions.length) transitions.push({ outsideIndex, endIndex: -1 });
        for (const { outsideIndex, endIndex } of transitions) {
          const diagnostic: StepCheck["regionCandidates"][number] = {
            objectId: targetId, subjectObjectId: subject[0]!.objectId,
            outsideFrame: outsideIndex < 0 ? null : subject[outsideIndex]!.frameIndex,
            endFrame: endIndex < 0 ? null : subject[endIndex]!.frameIndex,
            qualifies: endIndex >= 0, containment,
          };
          check.regionCandidates.push(diagnostic);
          if (endIndex < 0) continue;
          const eventSubject = subject.slice(outsideIndex, endIndex + 1);
          const eventRegion = region.slice(outsideIndex, endIndex + 1);
          const end = eventSubject.at(-1)!.frameIndex;
          if (subjectAnchor && !continuousTrack(subjectTrack, Math.min(subjectAnchor.firstFrame, eventSubject[0]!.frameIndex), end, subjectAnchor.objectId)) continue;
          if (targetAnchor && !continuousTrack(regionTrack, Math.min(targetAnchor.firstFrame, eventRegion[0]!.frameIndex), end, targetAnchor.objectId)) continue;
          events.push({ subject: eventSubject, region: eventRegion, diagnostic });
        }
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
  // The explicit action must share a sampled frame with the tracked transition;
  // a broad search window cannot attach it to an unrelated earlier entry.
  const actionFrame = candidate.action ? Math.round(candidate.action.timestampMs * ANALYSIS_FPS / 1000) : null;
  const aligned = candidate.subject ? events.filter(event => actionFrame !== null
    && actionFrame >= event.subject[0]!.frameIndex && actionFrame <= event.subject.at(-1)!.frameIndex) : events;
  if (candidate.actionVisible && candidate.beforeMatches && candidate.afterMatches && pairs.size === 1 && aligned.length) {
    const event = aligned.sort((a, b) => a.subject.at(-1)!.frameIndex - b.subject.at(-1)!.frameIndex)[0]!;
    check.subject!.selectedObjectId = event.subject[0]!.objectId;
    check.target!.selectedObjectId = event.region[0]!.objectId;
    // The final two inside samples confirm persistence, not additional motion.
    return { ...check, actionEndMs: Math.round(Math.max(event.subject.at(-3)!.frameIndex, actionFrame ?? 0) * 1000 / ANALYSIS_FPS),
      decision: "entry_geometry", finding: { ...base, status: "observed",
      startMs: Math.round(event.subject[0]!.frameIndex * 1000 / ANALYSIS_FPS),
      endMs: Math.round(event.subject.at(-1)!.frameIndex * 1000 / ANALYSIS_FPS),
      evidence: [...refs(event.subject, step.subjectConcept), ...refs(event.region, step.targetConcept!)],
      explanation: "Muse's visible entry proposal is grounded by one unique subject/target pairing, continuously tracked from outside to three consecutive inside samples. Inspect the clip; 2D geometry does not certify hidden contents." } };
  }
  if (pairs.size > 1) return { ...check, decision: "entry_geometry", finding: { ...base,
    explanation: "More than one subject/target pairing supports entry. The intended objects remain ambiguous; review the video." } };
  if (events.length && !aligned.length) return { ...check, decision: "entry_geometry", finding: { ...base,
    explanation: "The proposed action timestamp is not grounded within a continuously tracked outside-to-inside transition. Review the video to resolve the timing." } };
  return { ...check, decision: "entry_geometry", finding: { ...base,
    explanation: "No unique, continuously tracked outside-to-inside transition supports the proposal. Missing detections, overlap, or disappearance cannot establish entry." } };
}

function evaluate(step: ProofStep, candidate: Candidate | undefined, tracks: ConceptTrack[], frameCount: number, anchors: Anchor[], targetAnchors: Anchor[]): EvaluatedStep {
  const base: Finding = { stepId: step.id, status: "uncertain", startMs: candidate?.startMs ?? null, endMs: candidate?.endMs ?? null,
    explanation: "Muse did not locate a usable event window. This does not establish that the action never happened.", evidence: [] };
  const check: StepCheck = { stepId: step.id, firstFrame: null, lastFrame: null, subject: null, target: null,
    regionCandidates: [], decision: "no_window", finding: base };
  function finish(decision: StepCheck["decision"], finding: Finding): StepCheck { return { ...check, decision, finding }; }
  if (!candidate) return check;
  if (candidate.startMs === null || candidate.endMs === null) {
    // A visible non-event has no event timestamp. Whole-clip coverage can still
    // support a negative; the same geometry and visibility rules apply below.
    if (candidate.startMs === null && candidate.endMs === null && !candidate.actionVisible
      && candidate.nonOccurrenceVisible && candidate.searchComplete && step.checkType !== "object_present_at_end") {
      candidate = { ...candidate, startMs: 0, endMs: Math.round((frameCount - 1) * 1000 / ANALYSIS_FPS) };
    }
  }
  if (candidate.startMs === null || candidate.endMs === null) return check;
  // Muse's millisecond windows are approximate; map to the nearest sample so
  // 1167ms does not accidentally exclude frame 7 (1166.67ms).
  const explicit = candidate.subject !== undefined;
  const padding = explicit ? 500 : 0;
  const first = Math.max(0, Math.round((candidate.startMs - padding) * ANALYSIS_FPS / 1000));
  const last = Math.min(frameCount - 1, Math.round((candidate.endMs + padding) * ANALYSIS_FPS / 1000));
  if (first >= last || candidate.startMs > candidate.endMs) return check;
  check.firstFrame = first; check.lastFrame = last;
  const identityFirst = step.checkType === "object_present_at_end" ? Math.max(0, frameCount - 3)
    : Math.min(frameCount - 1, Math.round((candidate.before?.timestampMs ?? candidate.startMs) * ANALYSIS_FPS / 1000));
  const identityLast = step.checkType === "object_present_at_end" ? frameCount - 1
    : Math.min(frameCount - 1, Math.round((candidate.after?.timestampMs ?? candidate.endMs) * ANALYSIS_FPS / 1000));
  for (const ref of candidate.grounding ?? []) {
    const matching = tracks.find(track => canonical(track.concept) === canonical(ref.concept));
    if (!matching || matching.outcome !== "completed" || !matching.boxes.some(box => box.objectId === ref.objectId
      && box.frameIndex === Math.round(ref.timestampMs * ANALYSIS_FPS / 1000))) {
      return finish("ambiguous_proposal", { ...base, explanation: "A proposed object reference does not match actual SAM geometry at its timestamp." });
    }
  }
  for (const concept of [step.subjectConcept, step.targetConcept].filter((value): value is string => value !== null)) {
    let ids = new Set((candidate.grounding ?? []).filter(ref => canonical(ref.concept) === canonical(concept)).map(ref => ref.objectId));
    if (ids.size > 1 && step.checkType !== "object_enters_region") {
      const track = tracks.find(track => canonical(track.concept) === canonical(concept));
      ids = new Set(visibleStateInstances(track, identityFirst, identityLast).filter(id => ids.has(id)));
      if (ids.size !== 1) return finish("subject_track", { ...base, explanation: "No unique continuous identity supports the timestamped state evidence. Competing objects remain uncertain." });
    }
    if (ids.size > 1) return finish("ambiguous_proposal", { ...base, explanation: "The proposal references competing object identities for the same approved concept." });
    if (ids.size === 1) {
      const established = canonical(concept) === canonical(step.subjectConcept) ? anchors : targetAnchors;
      // An ID label is not evidence that this is the intended instance. Entry
      // geometry must remain unique before filtering; other checks need either
      // an established identity or one continuous instance across their evidence.
      if (established.length === 0) {
        if (step.checkType === "object_enters_region") continue;
        const track = tracks.find(track => canonical(track.concept) === canonical(concept));
        const possible = visibleStateInstances(track, identityFirst, identityLast);
        if (possible.length !== 1 || !ids.has(possible[0]!)) return finish("subject_track", { ...base,
          explanation: "Several object identities remain plausible, or the proposed identity lacks continuous support. Selecting a SAM label cannot establish the intended object." });
      }
      tracks = tracks.map(track => canonical(track.concept) === canonical(concept)
        ? { ...track, boxes: track.boxes.filter(box => ids.has(box.objectId)) } : track);
    }
  }
  if (explicit && step.checkType === "visible_state_change" && anchors.length === 0) {
    const subjectTrack = tracks.find(track => canonical(track.concept) === canonical(step.subjectConcept));
    const possible = visibleStateInstances(subjectTrack, identityFirst, identityLast);
    if (possible.length === 1) tracks = tracks.map(track => canonical(track.concept) === canonical(step.subjectConcept)
      ? { ...track, boxes: track.boxes.filter(box => box.objectId === possible[0]) } : track);
  }
  const subjectTrack = tracks.find((track) => canonical(track.concept) === canonical(step.subjectConcept));
  const regionTrack = tracks.find((track) => canonical(track.concept) === canonical(step.targetConcept ?? ""));
  check.subject = describeTrack(step.subjectConcept, subjectTrack, first, last);
  if (step.targetConcept) check.target = describeTrack(step.targetConcept, regionTrack, first, last);
  if (structuredConflicts(candidate).length > 0) return finish("contradictory_proposal", { ...base, explanation: "The visual proposal contains contradictory action evidence. Human review is needed." });
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
    if (explicit && candidate.actionVisible && (!candidate.action?.visible || !candidate.action.matchesRequirement)) {
      return finish("ambiguous_proposal", { ...base, explanation: "Entry needs timestamped evidence of the visible action; geometry alone is insufficient." });
    }
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
  const subjectFirst = step.checkType === "object_present_at_end" ? Math.max(0, frameCount - 3) : candidate.before ? Math.min(frameCount - 1, Math.round(candidate.before.timestampMs * ANALYSIS_FPS / 1000)) : first;
  const subjectLast = step.checkType === "object_present_at_end" ? frameCount - 1 : candidate.after ? Math.min(frameCount - 1, Math.round(candidate.after.timestampMs * ANALYSIS_FPS / 1000)) : last;
  if (step.checkType === "object_present_at_end") {
    check.firstFrame = subjectFirst; check.lastFrame = subjectLast;
    check.subject = describeTrack(step.subjectConcept, subjectTrack, subjectFirst, subjectLast);
    if (Math.round(candidate.endMs * ANALYSIS_FPS / 1000) < subjectFirst || explicit && (!candidate.after?.visible || !candidate.after.matchesRequirement || Math.round(candidate.after.timestampMs * ANALYSIS_FPS / 1000) < subjectFirst)) return finish("final_presence", { ...base, explanation: "The visual proposal does not cover the end of the recording. Final presence remains uncertain." });
  }
  const linked = anchor ? continuousTrack(subjectTrack, Math.min(subjectFirst, anchor.firstFrame), subjectLast, anchor.objectId) : null;
  const subject = anchor ? linked?.filter((box) => box.frameIndex >= subjectFirst) ?? null : continuousTrack(subjectTrack, subjectFirst, subjectLast);
  if (!subject) return finish("subject_track", { ...base, explanation: "A single continuous subject track could not be grounded across the event. Missing tracks are not evidence that the action never happened." });
  check.subject.selectedObjectId = subject[0]!.objectId;
  base.startMs = Math.round(subjectFirst * 1000 / ANALYSIS_FPS);
  base.endMs = Math.round(subjectLast * 1000 / ANALYSIS_FPS);
  base.evidence = refs(subject, step.subjectConcept);
  let targetEvidence: Finding["evidence"] = [];
  if (step.targetConcept) {
    const linkedTarget = targetAnchor ? continuousTrack(regionTrack, Math.min(subjectFirst, targetAnchor.firstFrame), subjectLast, targetAnchor.objectId) : null;
    const target = targetAnchor ? linkedTarget?.filter(box => box.frameIndex >= subjectFirst) ?? null : continuousTrack(regionTrack, subjectFirst, subjectLast);
    check.target = describeTrack(step.targetConcept, regionTrack, subjectFirst, subjectLast);
    if (!target) return finish("target_track", { ...base, explanation: "The approved target lacks a single continuous track across the required evidence. The finding remains uncertain." });
    check.target.selectedObjectId = target[0]!.objectId;
    targetEvidence = refs(target, step.targetConcept);
    base.evidence.push(...targetEvidence);
  }
  const supported = candidate.actionVisible && candidate.beforeMatches && candidate.afterMatches;

  if (step.checkType === "object_present_at_end") {
    const ending = continuousTrack(subjectTrack, Math.max(0, frameCount - 3), frameCount - 1, anchor?.objectId);
    if (candidate.afterMatches && ending && ending[0]!.objectId === subject[0]!.objectId) {
      return finish("final_presence", { ...base, status: "observed", startMs: Math.round(ending[0]!.frameIndex * 1000 / ANALYSIS_FPS),
        endMs: Math.round((frameCount - 1) * 1000 / ANALYSIS_FPS), evidence: [...refs(ending, step.subjectConcept), ...targetEvidence],
        explanation: "Muse's final-state proposal is grounded by the same visible object across the final sampled frames." });
    }
    return finish("final_presence", { ...base, explanation: "Presence at the end could not be grounded. Disappearance or a missing final track remains uncertain." });
  }

  if (step.checkType === "visible_state_change") {
    if (supported && ![subject[0]!, subject.at(-1)!].every(fullyFramed)) {
      return finish("subject_track", { ...base, explanation: "Only a frame-edge subject fragment supports the proposed before/after states. A visible state change remains uncertain." });
    }
    const stateEvidence = !explicit || Boolean(candidate.before?.visible && candidate.before.matchesRequirement
      && candidate.after?.visible && candidate.after.matchesRequirement && candidate.action?.visible && candidate.action.matchesRequirement
      && candidate.before.timestampMs < candidate.after.timestampMs
      && candidate.before.description.trim().toLowerCase() !== candidate.after.description.trim().toLowerCase());
    if (supported && stateEvidence) return finish("state_change", { ...base, status: "observed", explanation: "Muse proposes the required visible before/after change, grounded by one continuous SAM subject track. Inspect the clip to review those states." });
    // Negative findings require continuous positive scene coverage, never a missing detection.
    if (!candidate.actionVisible && candidate.beforeMatches && !candidate.afterMatches && candidate.nonOccurrenceVisible && candidate.searchComplete
      && (!explicit || candidate.before?.visible && candidate.before.matchesRequirement && candidate.after?.visible && !candidate.after.matchesRequirement)
      && continuousTrack(subjectTrack, 0, frameCount - 1)
      && (!step.targetConcept || continuousTrack(regionTrack, 0, frameCount - 1, targetAnchor?.objectId))) {
      return finish("state_change", { ...base, status: "not_observed", startMs: 0, endMs: Math.round((frameCount - 1) * 1000 / ANALYSIS_FPS),
        evidence: [...refs(continuousTrack(subjectTrack, 0, frameCount - 1)!, step.subjectConcept),
          ...(step.targetConcept ? refs(continuousTrack(regionTrack, 0, frameCount - 1, targetAnchor?.objectId)!, step.targetConcept) : [])],
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
    const { actionEndMs, ...check } = evaluate(step, observation.candidates.find((candidate) => candidate.stepId === step.id), tracks, frameCount,
      plan.schemaVersion === 1 ? grounded.get(canonical(step.subjectConcept)) ?? [] : [], plan.schemaVersion === 1 ? grounded.get(canonical(step.targetConcept ?? "")) ?? [] : []);
    const finding = check.finding;
    const candidate = observation.candidates.find(item => item.stepId === step.id);
    // Order the actual grounded evidence, not Muse's broader search windows.
    // Entry dwell samples stay inspectable but do not extend the action's end.
    // State findings retain their explicit before/after bounds.
    const eventStart = finding.startMs;
    const eventEnd = actionEndMs ?? finding.endMs;
    // Final presence is an end-of-clip assertion, not a sequential action. It
    // neither advances action order nor establishes an identity for past actions.
    if (plan.schemaVersion === 1 && finding.status === "observed" && eventStart !== null && step.checkType !== "object_present_at_end") {
      if (eventStart < latestEnd) {
        finding.status = "uncertain"; check.decision = "step_order";
        finding.explanation = "The proposed event conflicts with the approved step order. Review the recording to resolve the sequence.";
      } else {
        latestEnd = eventEnd ?? eventStart;
        for (const ref of finding.evidence) {
          const key = canonical(ref.concept);
          grounded.set(key, [...grounded.get(key) ?? [], { objectId: ref.objectId, firstFrame: ref.frameIndex }]);
        }
      }
    }
    if (plan.schemaVersion === 2 && finding.status === "observed") {
      const requirements = step.requirements ?? [];
      const groundedAt = (concept: string, frame: number) => {
        const selected = canonical(concept) === canonical(step.subjectConcept) ? check.subject?.selectedObjectId : check.target?.selectedObjectId;
        if (!selected || frame < check.firstFrame! || frame > check.lastFrame!) return false;
        const track = tracks.find(track => canonical(track.concept) === canonical(concept));
        const first = Math.min(frame, Math.round(finding.startMs! * ANALYSIS_FPS / 1000));
        const last = Math.max(frame, Math.round(finding.endMs! * ANALYSIS_FPS / 1000));
        return Boolean(continuousTrack(track, first, last, selected));
      };
      const valid = requirements.length > 0 && requirements.every(req => {
        const assessments = candidate?.requirementAssessments?.filter(item => item.requirementId === req.id) ?? [];
        const assessment = assessments[0];
        const moment = candidate?.[req.phase];
        const frame = assessment ? Math.round(assessment.timestampMs * ANALYSIS_FPS / 1000) : -1;
        return assessments.length === 1 && assessment?.visible && assessment.matchesRequirement && assessment.decisiveDetailsVisible
          && moment?.visible && moment.matchesRequirement && Math.round(moment.timestampMs * ANALYSIS_FPS / 1000) === frame
          && groundedAt(req.subjectConcept, frame)
          && (!req.targetConcept || groundedAt(req.targetConcept, frame));
      });
      if (!valid) {
        finding.status = "uncertain";
        finding.explanation = "The approved evidence requirements are not all visibly grounded, including their decisive details. Inspect the individual evidence; missing support cannot establish completion.";
      } else {
        finding.satisfiedRequirementIds = requirements.map(req => req.id);
        for (const req of requirements) {
          const assessment = candidate!.requirementAssessments!.find(item => item.requirementId === req.id)!;
          const frameIndex = Math.round(assessment.timestampMs * ANALYSIS_FPS / 1000);
          finding.startMs = Math.min(finding.startMs!, assessment.timestampMs);
          finding.endMs = Math.max(finding.endMs!, assessment.timestampMs);
          for (const concept of [req.subjectConcept, req.targetConcept].filter((value): value is string => value !== null)) {
            const objectId = canonical(concept) === canonical(step.subjectConcept) ? check.subject!.selectedObjectId! : check.target!.selectedObjectId!;
            finding.evidence.push({ concept, objectId, frameIndex });
          }
        }
      }
    }
    if (candidate?.subject && finding.status === "observed") {
      finding.moments = (["before", "action", "after"] as const).flatMap(phase => {
        const moment = candidate[phase];
        return moment?.visible && moment.matchesRequirement ? [{ phase, timestampMs: moment.timestampMs, description: moment.description }] : [];
      });
    }
    check.finding = findingSchema.parse(finding);
    checks.push(check);
  }
  if (plan.schemaVersion === 2) {
    for (const rel of plan.relationships ?? []) {
      const a = checks.find(check => check.stepId === rel.from)!, b = checks.find(check => check.stepId === rel.to)!;
      let status: Finding["status"] = "uncertain";
      const interval = (check: StepCheck) => {
        const candidate = observation.candidates.find(item => item.stepId === check.stepId);
        const value = candidate?.actionInterval;
        if (!value?.boundariesVisible || value.startMs >= value.endMs || check.finding.status !== "observed") return null;
        const first = Math.round(value.startMs * ANALYSIS_FPS / 1000), last = Math.round(value.endMs * ANALYSIS_FPS / 1000);
        if (first >= last || !candidate?.action || candidate.action.timestampMs < value.startMs || candidate.action.timestampMs > value.endMs) return null;
        if (value.startMs < check.finding.startMs! || value.endMs > check.finding.endMs!) return null;
        const track = tracks.find(track => canonical(track.concept) === canonical(check.subject!.concept));
        if (!continuousTrack(track, first, last, check.subject?.selectedObjectId ?? undefined)) return null;
        return value;
      };
      if (a.finding.status === "observed" && b.finding.status === "observed") {
        if (rel.type === "same_instance") {
          const first = Math.min(a.firstFrame!, b.firstFrame!), last = Math.max(a.lastFrame!, b.lastFrame!);
          const track = tracks.find(track => canonical(track.concept) === canonical(a.subject!.concept));
          if (a.subject?.selectedObjectId === b.subject?.selectedObjectId && continuousTrack(track, first, last, a.subject!.selectedObjectId!)) status = "observed";
        } else {
          const ia = interval(a), ib = interval(b), margin = 1000 / ANALYSIS_FPS;
          if (ia && ib) {
            if (rel.type === "before") {
              if (ib.startMs - ia.endMs > margin) status = "observed";
              else if (ia.endMs - ib.startMs > margin) status = "not_observed";
            } else {
              const overlap = Math.min(ia.endMs, ib.endMs) - Math.max(ia.startMs, ib.startMs);
              if (overlap > margin) status = "observed";
              else if (overlap < -margin) status = "not_observed";
            }
          }
        }
      }
      const from = plan.steps.find(step => step.id === rel.from)!.label, to = plan.steps.find(step => step.id === rel.to)!.label;
      const description = `${from} ${rel.type === "before" ? "must finish before" : rel.type === "overlap" ? "must visibly overlap" : "must use the same subject instance as"} ${to}. ${status === "observed" ? "Supported by grounded evidence." : status === "not_observed" ? "The visible action intervals contradict this relationship. Individual actions remain inspectable." : "This relationship remains unresolved; sampling, visibility or identity is insufficient."}`;
      for (const check of [a, b]) check.finding.relationships = [...check.finding.relationships ?? [], { id: rel.id, description, status }];
    }
  }
  const diagnostics = verificationDiagnosticsSchema.parse({ ruleVersion: VERIFICATION_RULE_VERSION, checks });
  return { findings: diagnostics.checks.map((check) => check.finding), diagnostics };
}

export function verifyEvidence(plan: ApprovedPlan, observation: Observation, tracks: ConceptTrack[], frameCount: number): Finding[] {
  return evaluateEvidence(plan, observation, tracks, frameCount).findings;
}

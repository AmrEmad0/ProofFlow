import type { StepCheck } from "../../shared/diagnostics";
import { structuredConflicts, type Observation } from "../../shared/observation";
import { canonicalConcept, type ProofStep } from "../../shared/proof-plan";
import { ANALYSIS_FPS, type ConceptTrack } from "../../shared/verification";
import { continuousTrack, describeTrack, visibleStateInstances } from "./track-evidence";

export function evaluateVisualCheck(step: ProofStep, candidate: Observation["candidates"][number] | undefined,
  tracks: ConceptTrack[], frameCount: number, check: StepCheck): StepCheck {
  const finish = (decision: StepCheck["decision"], explanation: string, status: StepCheck["finding"]["status"] = "uncertain"): StepCheck =>
    ({ ...check, decision, finding: { ...check.finding, status, explanation } });
  const scope = step.visualCheck, requirements = step.requirements ?? [];
  if (!candidate || !scope || !requirements.length || candidate.startMs === null || candidate.endMs === null) return check;
  const frameAt = (ms: number) => Math.round(ms * ANALYSIS_FPS / 1000);
  if (candidate.startMs > candidate.endMs || candidate.startMs < 0 || candidate.endMs > frameCount * 1000 / ANALYSIS_FPS) return check;
  if (!candidate.subject || candidate.subject.concept !== step.subjectConcept || (candidate.target?.concept ?? null) !== step.targetConcept) {
    return finish("ambiguous_proposal", "The proposal does not identify the approved subject and target.");
  }
  if (structuredConflicts(candidate).length) return finish("contradictory_proposal", "The visual proposal contains conflicting evidence. Review the recording.");
  if (candidate.visibility !== "clear" || candidate.ambiguities.length) return finish("ambiguous_proposal", "The details needed to assess this check are obscured or ambiguous.");
  if (scope.kind === "condition" && (candidate.action || candidate.before || candidate.actionInterval || candidate.actionVisible || candidate.beforeMatches)) {
    return finish("contradictory_proposal", "This condition requires visible state evidence, not an invented preceding action.");
  }
  const assessments = candidate.requirementAssessments ?? [];
  if (assessments.length !== requirements.length || assessments.some(a => !requirements.some(req => req.id === a.requirementId))) {
    return finish("visual_evidence", "Every approved requirement needs its own timestamped visual assessment.");
  }
  const moments: number[] = [];
  let allMatch = true;
  for (const req of requirements) {
    const matches = assessments.filter(a => a.requirementId === req.id);
    const assessment = matches[0], moment = candidate[req.phase];
    if (matches.length !== 1 || !assessment?.visible || !assessment.decisiveDetailsVisible || !moment?.visible
      || moment.matchesRequirement !== assessment.matchesRequirement || frameAt(moment.timestampMs) !== frameAt(assessment.timestampMs)
      || assessment.timestampMs < candidate.startMs || assessment.timestampMs > candidate.endMs) {
      return finish("visual_evidence", "The approved evidence and its decisive details are not consistently visible at the supplied timestamps.");
    }
    const frame = frameAt(assessment.timestampMs);
    if (frame < 0 || frame >= frameCount || scope.timing === "start" && frame > 2 || scope.timing === "end" && frame < frameCount - 3) {
      return finish("visual_evidence", "The proposed evidence does not cover the approved time in the recording.");
    }
    moments.push(frame);
    allMatch &&= assessment.matchesRequirement;
  }
  const actionRequirement = requirements.find(req => req.phase === "action");
  if (allMatch && candidate.nonOccurrenceVisible) return finish("contradictory_proposal", "The proposal asserts both matching evidence and non-occurrence.");
  if (scope.kind === "action" && (!actionRequirement || candidate.actionVisible !== assessments.find(a => a.requirementId === actionRequirement.id)?.matchesRequirement)
    || scope.kind === "condition" && candidate.afterMatches !== allMatch) {
    return finish("contradictory_proposal", "The summary assertion conflicts with the detailed visual assessment.");
  }
  let first = Math.max(0, Math.min(...moments) - 1), last = Math.min(frameCount - 1, Math.max(...moments) + 1);
  if (scope.kind === "action" && allMatch) {
    const interval = candidate.actionInterval;
    if (!candidate.actionVisible || !interval?.boundariesVisible || interval.startMs >= interval.endMs
      || interval.startMs < candidate.startMs || interval.endMs > candidate.endMs
      || !candidate.action || candidate.action.timestampMs < interval.startMs || candidate.action.timestampMs > interval.endMs
      || candidate.before && candidate.before.timestampMs > interval.startMs || candidate.after && candidate.after.timestampMs < interval.endMs
      || frameAt(interval.startMs) >= frameAt(interval.endMs)) {
      return finish("visual_evidence", "The requested action needs a visible interval with inspectable onset and completion; an outcome alone is insufficient.");
    }
    first = Math.min(first, frameAt(interval.startMs)); last = Math.max(last, frameAt(interval.endMs));
  }
  // An anytime mismatch is not non-occurrence. Negative action findings need
  // positive whole-clip scene coverage, never missing detections.
  const negativeAction = scope.kind === "action" && !allMatch && !candidate.actionVisible && candidate.nonOccurrenceVisible && candidate.searchComplete;
  if (negativeAction) { first = 0; last = frameCount - 1; }
  if (scope.timing === "start") { first = 0; last = Math.max(last, Math.min(2, frameCount - 1)); }
  if (scope.timing === "end") { first = Math.min(first, Math.max(0, frameCount - 3)); last = frameCount - 1; }
  check.firstFrame = first; check.lastFrame = last;
  const selected = new Map<string, string>();
  for (const concept of [step.subjectConcept, step.targetConcept].filter((value): value is string => value !== null)) {
    const track = tracks.find(item => canonicalConcept(item.concept) === canonicalConcept(concept));
    const detail = describeTrack(concept, track, first, last);
    const subject = concept === step.subjectConcept;
    if (subject) check.subject = detail; else check.target = detail;
    // A target area such as a tabletop may extend beyond the frame. Its
    // decisive visible details still need an explicit model assessment.
    const possible = subject ? visibleStateInstances(track, first, last)
      : [...new Set(track?.boxes.map(box => box.objectId))].filter(id => continuousTrack(track, first, last, id));
    if (possible.length !== 1) return finish(subject ? "subject_track" : "target_track", "A unique, continuous object track must support the evidence interval. Missing or competing tracks leave this check uncertain.");
    detail.selectedObjectId = possible[0]!;
    selected.set(canonicalConcept(concept), possible[0]!);
    const boxes = continuousTrack(track, first, last, possible[0])!;
    for (const box of [boxes[0]!, boxes.at(-1)!]) check.finding.evidence.push({ concept, objectId: box.objectId, frameIndex: box.frameIndex });
  }
  for (const ref of candidate.grounding ?? []) {
    const track = tracks.find(item => canonicalConcept(item.concept) === canonicalConcept(ref.concept));
    if (selected.get(canonicalConcept(ref.concept)) !== ref.objectId || !track?.boxes.some(box => box.objectId === ref.objectId && box.frameIndex === frameAt(ref.timestampMs))) {
      return finish("ambiguous_proposal", "The proposed identity reference does not match the uniquely grounded evidence.");
    }
  }
  check.finding.startMs = Math.round(first * 1000 / ANALYSIS_FPS);
  check.finding.endMs = Math.round(last * 1000 / ANALYSIS_FPS);
  if (allMatch) return finish("visual_evidence", "Muse assesses every approved visual requirement as observed, supported by timestamped footage and continuous SAM object tracks. Review the clip: tracking grounds the objects, not the meaning of the action or condition.", "observed");
  if (negativeAction || scope.kind === "condition" && scope.timing !== "anytime") {
    return finish("visual_evidence", "Muse reports visible evidence that does not meet the approved requirement, with the relevant objects continuously tracked. This finding applies only to the inspected recording and time.", "not_observed");
  }
  return finish("visual_evidence", "The located evidence does not establish this requirement. A mismatch at one moment cannot rule out its occurrence elsewhere in the recording.");
}

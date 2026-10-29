import type { Observation } from "../../shared/observation";
import { canonicalConcept, type ProofStep } from "../../shared/proof-plan";
import { ANALYSIS_FPS, type ConceptTrack } from "../../shared/verification";
import { continuousTrack } from "./track-evidence";

// Cropping is acceptable only with explicit, box-specific visible state evidence
// and exclusion of every competing instance, not merely a chosen SAM label.
export function assessedStateIdentity(step: ProofStep, candidate: Observation["candidates"][number], track: ConceptTrack | undefined): string | null {
  if (step.checkType !== "visible_state_change" || !track || !step.requirements?.length
    || candidate.visibility !== "clear" || candidate.ambiguities.length) return null;
  const moments = [candidate.before, candidate.action, candidate.after];
  if (moments.some(moment => !moment?.visible || !moment.matchesRequirement)) return null;
  const frameAt = (ms: number) => Math.round(ms * ANALYSIS_FPS / 1000);
  const first = frameAt(candidate.before!.timestampMs), last = frameAt(candidate.after!.timestampMs);
  const ids = [...new Set(track.boxes.filter(box => box.frameIndex >= first && box.frameIndex <= last).map(box => box.objectId))];
  const assessments = (candidate.objectAssessments ?? []).filter(item => canonicalConcept(item.concept) === canonicalConcept(step.subjectConcept));
  let selected: string | null = null;
  for (const phase of ["before", "action", "after"] as const) {
    const moment = candidate[phase]!;
    const frame = frameAt(moment.timestampMs);
    const req = step.requirements.find(req => req.phase === phase);
    const evidence = candidate.requirementAssessments?.filter(item => item.requirementId === req?.id);
    if (!req || evidence?.length !== 1 || !evidence[0]!.visible || !evidence[0]!.matchesRequirement
      || !evidence[0]!.decisiveDetailsVisible || frameAt(evidence[0]!.timestampMs) !== frame) return null;
    const matches: string[] = [];
    for (const id of ids) {
      const boxes = track.boxes.filter(box => box.objectId === id && box.frameIndex === frame);
      const at = assessments.filter(item => item.objectId === id && frameAt(item.timestampMs) === frame);
      if (boxes.length !== 1 || at.length !== 1 || !at[0]!.decisiveDetailsVisible) return null;
      if (at[0]!.matchesIntendedObject) matches.push(id);
    }
    if (matches.length !== 1 || selected !== null && selected !== matches[0]) return null;
    selected = matches[0]!;
    const refs = candidate.grounding?.filter(ref => canonicalConcept(ref.concept) === canonicalConcept(step.subjectConcept)
      && frameAt(ref.timestampMs) === frame);
    if (!refs?.some(ref => ref.objectId === selected) || new Set(refs.map(ref => ref.objectId)).size !== refs.length
      || refs.some(ref => !ids.includes(ref.objectId))) return null;
  }
  return selected && continuousTrack(track, first, last, selected) ? selected : null;
}

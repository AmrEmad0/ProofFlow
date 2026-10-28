import { structuredConflicts, type Observation } from "../../shared/observation";
import { canonicalConcept, type ApprovedPlan } from "../../shared/proof-plan";
import { ANALYSIS_FPS } from "../../shared/verification";
import type { ConceptTrack } from "../../shared/verification";
import type { VerificationDiagnostics } from "../../shared/diagnostics";
import type { ObservationContext } from "../meta/observe";

export function followUpQuestions(plan: ApprovedPlan, observation: Observation, tracks: ConceptTrack[], diagnostics: VerificationDiagnostics): ObservationContext["questions"] {
  return diagnostics.checks.flatMap(check => {
    const step = plan.steps.find(step => step.id === check.stepId)!;
    const candidate = observation.candidates.find(item => item.stepId === step.id);
    const unresolvedRelationship = check.finding.relationships?.filter(rel => rel.status === "uncertain") ?? [];
    if (check.finding.status !== "uncertain" && !unresolvedRelationship.length || !candidate || candidate.visibility === "occluded"
      || candidate.nonOccurrenceVisible || candidate.contradictions?.length || check.decision === "contradictory_proposal") return [];
    const concepts = [step.subjectConcept, step.targetConcept].filter((value): value is string => value !== null);
    if (concepts.some(concept => !tracks.some(track => canonicalConcept(track.concept) === canonicalConcept(concept)
      && track.outcome === "completed" && track.boxes.length > 0))) return [];
    return [{ stepId: step.id, question: `${check.finding.explanation} Unresolved relationships: ${JSON.stringify(unresolvedRelationship)}. For a temporal relationship supply visibly grounded action onset and completion; retain uncertainty if sampling cannot resolve them. Approved missing evidence: ${JSON.stringify(step.requirements?.filter(req => !candidate.requirementAssessments?.some(a => a.requirementId === req.id && a.visible && a.matchesRequirement && a.decisiveDetailsVisible)) ?? [])}. Do not change these requirements. Identify the intended SAM object IDs at the supplied timestamps and give explicit visible before/action/after evidence. Keep uncertainty if motion, state, or identity cannot be established.` }];
  });
}

export function mergeFollowUp(initial: Observation, followUp: Observation, stepIds: Set<string>): Observation {
  return { ...initial, omissions: [...new Set([...initial.omissions, ...followUp.omissions])], candidates: initial.candidates.map(first => {
    const second = followUp.candidates.find(candidate => candidate.stepId === first.stepId);
    if (!second || !stepIds.has(first.stepId)) return first;
    const contradictions = [...structuredConflicts(first), ...structuredConflicts(second)];
    if (first.actionVisible && first.nonOccurrenceVisible
      || first.nonOccurrenceVisible && second.actionVisible
      || first.actionVisible && second.nonOccurrenceVisible) contradictions.push("The two passes conflict about whether the action is visible.");
    for (const key of ["before", "action", "after"] as const) {
      const a = first[key], b = second[key];
      if (a?.visible && b?.visible && Math.round(a.timestampMs * ANALYSIS_FPS / 1000) === Math.round(b.timestampMs * ANALYSIS_FPS / 1000)
        && a.matchesRequirement !== b.matchesRequirement) contradictions.push(`The two passes disagree about the visible ${key} evidence.`);
    }
    if (first.actionInterval?.boundariesVisible && second.actionInterval?.boundariesVisible
      && (Math.abs(first.actionInterval.startMs - second.actionInterval.startMs) > 1000 / ANALYSIS_FPS
        || Math.abs(first.actionInterval.endMs - second.actionInterval.endMs) > 1000 / ANALYSIS_FPS)) contradictions.push("The passes disagree about visible action boundaries.");
    for (const a of first.requirementAssessments ?? []) {
      const b = second.requirementAssessments?.find(item => item.requirementId === a.requirementId);
      if (b && a.matchesRequirement !== b.matchesRequirement) contradictions.push(`The passes disagree about requirement ${a.requirementId}.`);
    }
    // Free-text caveats have no independently verifiable resolution signal.
    // A more confident second pass cannot silently erase missing visual evidence.
    return { ...second, contradictions, ambiguities: [...new Set([...first.ambiguities, ...second.ambiguities])],
      visibility: first.visibility === "occluded" ? "occluded" : second.visibility };
  }) };
}

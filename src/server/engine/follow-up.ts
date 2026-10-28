import { structuredConflicts, type Observation } from "../../shared/observation";
import type { ApprovedPlan } from "../../shared/proof-plan";
import type { ConceptTrack } from "../../shared/verification";
import type { VerificationDiagnostics } from "../../shared/diagnostics";
import type { ObservationContext } from "../meta/observe";

export function followUpQuestions(plan: ApprovedPlan, observation: Observation, tracks: ConceptTrack[], diagnostics: VerificationDiagnostics): ObservationContext["questions"] {
  return diagnostics.checks.flatMap(check => {
    const step = plan.steps.find(step => step.id === check.stepId)!;
    const candidate = observation.candidates.find(item => item.stepId === step.id);
    if (check.finding.status !== "uncertain" || !candidate || candidate.visibility === "occluded"
      || candidate.nonOccurrenceVisible || candidate.contradictions?.length || check.decision === "contradictory_proposal") return [];
    const concepts = [step.subjectConcept, step.targetConcept].filter((value): value is string => value !== null);
    if (concepts.some(concept => !tracks.some(track => track.concept.toLowerCase() === concept.toLowerCase()
      && track.outcome === "completed" && track.boxes.length > 0))) return [];
    return [{ stepId: step.id, question: `${check.finding.explanation} Identify the intended SAM object IDs at the supplied timestamps and give explicit visible before/action/after evidence. Keep uncertainty if motion, state, or identity cannot be established.` }];
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
      if (a?.visible && b?.visible && a.matchesRequirement !== b.matchesRequirement) contradictions.push(`The two passes disagree about the visible ${key} evidence.`);
    }
    return { ...second, contradictions,
      visibility: first.visibility === "occluded" ? "occluded" : second.visibility };
  }) };
}

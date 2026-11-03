import { z } from "zod";
import { plannerPreviewSchema } from "./planner";
import { proofPlanSchema, type ProofPlan } from "./proof-plan";

export const improvementIssueSchema = z.enum(["missed_action", "wrong_object", "unclear_requirement", "visibility", "other"]);
export const improvementRequestSchema = z.strictObject({
  revision: z.number().int().nonnegative(), runId: z.uuid(),
  issue: improvementIssueSchema, feedback: z.string().trim().min(1).max(2000),
});
export const improvementProposalSchema = z.strictObject({
  explanation: z.string().trim().min(1).max(4000),
  scopeChanges: z.array(z.string().trim().min(1).max(1000)).max(10),
  filmingAdvice: z.array(z.string().trim().min(1).max(1000)).max(10),
  plan: proofPlanSchema.nullable(),
});
export const improvementResponseSchema = z.strictObject({
  revision: z.number().int().nonnegative(), proposal: improvementProposalSchema,
});
export const applyImprovementSchema = improvementRequestSchema.extend({
  proposal: improvementProposalSchema, reviewed: z.literal(true),
});
export type ImprovementRequest = z.infer<typeof improvementRequestSchema>;
export type ImprovementProposal = z.infer<typeof improvementProposalSchema>;

export function changedPlanChecks(before: ProofPlan, after: ProofPlan) {
  const ids = [...new Set([...before.steps.map(step => step.id), ...after.steps.map(step => step.id)])];
  return ids.flatMap(id => {
    const previous = before.steps.find(step => step.id === id);
    const proposed = after.steps.find(step => step.id === id);
    return JSON.stringify(previous) === JSON.stringify(proposed) ? [] : [{ id, previous, proposed }];
  });
}

export const improvementProgressSchema = improvementProposalSchema.pick({ explanation: true, scopeChanges: true, filmingAdvice: true }).extend({
  explanation: z.string().max(4000),
});
export type ImprovementProgress = z.infer<typeof improvementProgressSchema>;

export const improvementStreamEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("start") }),
  z.strictObject({ type: z.literal("ping") }),
  z.strictObject({ type: z.literal("progress"), progress: improvementProgressSchema }),
  z.strictObject({ type: z.literal("preview"), preview: plannerPreviewSchema }),
  z.strictObject({ type: z.literal("done"), result: improvementResponseSchema }),
  z.strictObject({ type: z.literal("error"), message: z.string() }),
]);
export type ImprovementStreamEvent = z.infer<typeof improvementStreamEventSchema>;

export function scopeReviewWarnings(before: ProofPlan, after: ProofPlan): string[] {
  const warnings = changedPlanChecks(before, after).flatMap(({ previous, proposed }) => {
    if (!previous) return [`Added check: ${proposed!.label}. This adds a success criterion.`];
    if (!proposed) return [`Removed check: ${previous.label}. This removes a success criterion.`];
    const scope = (step: typeof previous) => ({ checkType: step.checkType, visualCheck: step.visualCheck,
      subjectConcept: step.subjectConcept, targetConcept: step.targetConcept, beforeState: step.beforeState,
      afterState: step.afterState, goalSource: step.goalSource, requirements: step.requirements });
    return JSON.stringify(scope(previous)) === JSON.stringify(scope(proposed)) ? []
      : [`Evidence criteria changed for “${proposed.label}”. Review the objects, timing, and required evidence to confirm the task still means what you intend.`];
  });
  const compare = (key: "goal" | "relationships" | "unresolvedGoals" | "limitations", description: string) => {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) warnings.push(description);
  };
  compare("goal", "The overall goal changed. Review its meaning.");
  compare("relationships", "Required relationships between checks changed. Review order, overlap, and object identity.");
  compare("unresolvedGoals", "Unresolved goals changed. Confirm any exclusions are intentional.");
  compare("limitations", "Plan limitations changed. Review what can and cannot be confirmed.");
  return warnings;
}

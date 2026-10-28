import { z } from "zod";

export const LIMITS = {
  steps: 5,
  concepts: 4,
  durationMs: 30_000,
  uploadBytes: 25 * 1024 * 1024,
} as const;

export const checkTypeSchema = z.enum([
  "object_enters_region",
  "visible_state_change",
  "object_present_at_end",
]);

export const proofStepSchema = z.strictObject({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(240),
  checkType: checkTypeSchema,
  subjectConcept: z.string().trim().min(1).max(120),
  targetConcept: z.string().trim().min(1).max(120).nullable(),
  beforeState: z.string().trim().min(1).max(240).nullable(),
  afterState: z.string().trim().min(1).max(240).nullable(),
  observableEvidence: z.string().trim().min(1).max(1000),
}).superRefine((step, ctx) => {
  if (step.checkType === "object_enters_region" && !step.targetConcept) {
    ctx.addIssue({ code: "custom", path: ["targetConcept"], message: "An entry check needs a target region." });
  }
  if (step.checkType === "visible_state_change" && (!step.beforeState || !step.afterState)) {
    ctx.addIssue({ code: "custom", path: ["beforeState"], message: "A state change needs visible before and after states." });
  }
});

// Keep the shape separate so model JSON Schema contains structural constraints;
// cross-field domain rules are always checked locally after parsing.
export const proofPlanShape = z.strictObject({
  schemaVersion: z.literal(1),
  title: z.string().trim().min(1).max(160),
  goal: z.string().trim().min(1).max(2000),
  steps: z.array(proofStepSchema).min(1).max(LIMITS.steps),
  limitations: z.array(z.string().trim().min(1).max(1000)).max(10),
});

export const proofPlanSchema = proofPlanShape.superRefine((plan, ctx) => {
  if (new Set(plan.steps.map((step) => step.id)).size !== plan.steps.length) {
    ctx.addIssue({ code: "custom", path: ["steps"], message: "Step IDs must be unique." });
  }
  if (trackedConcepts(plan).length > LIMITS.concepts) {
    ctx.addIssue({ code: "custom", path: ["steps"], message: "At most four unique object concepts are supported." });
  }
});

export const approvedPlanSchema = proofPlanSchema.safeExtend({
  approvedVersionId: z.uuid(),
  contractHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export type CheckType = z.infer<typeof checkTypeSchema>;
export type ProofStep = z.infer<typeof proofStepSchema>;
export type ProofPlan = z.infer<typeof proofPlanSchema>;
export type ApprovedPlan = z.infer<typeof approvedPlanSchema>;

export function trackedConcepts(plan: { steps: ProofStep[] }): string[] {
  return [...new Set(plan.steps.flatMap((step) => [step.subjectConcept, step.targetConcept])
    .filter((concept): concept is string => concept !== null)
    .map((concept) => concept.trim().toLowerCase()))];
}

import { z } from "zod";
import { LIMITS, checkTypeSchema, proofPlanSchema, proofStepSchema, type ProofStep } from "./proof-plan";

export const editableCheckSchema = z.strictObject({
  id: proofStepSchema.shape.id,
  subjectConcept: proofStepSchema.shape.subjectConcept,
  targetConcept: proofStepSchema.shape.targetConcept,
  beforeState: proofStepSchema.shape.beforeState,
  afterState: proofStepSchema.shape.afterState,
});
export const editChecksSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  steps: z.array(editableCheckSchema).min(1).max(LIMITS.steps),
});
export type EditableCheck = z.infer<typeof editableCheckSchema>;

export const manualPlanInputSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  title: proofPlanSchema.shape.title,
  steps: z.array(editableCheckSchema.extend({ checkType: checkTypeSchema })).min(1).max(LIMITS.steps),
});
export type ManualPlanInput = z.infer<typeof manualPlanInputSchema>;

export function buildManualPlan(input: ManualPlanInput) {
  const steps = input.steps.map(step => describeEditedCheck({ ...step, label: "", observableEvidence: "" }, step));
  return proofPlanSchema.parse({ schemaVersion: 1, title: input.title, goal: steps.map(step => step.label).join(". "), steps,
    limitations: ["Only visible evidence can be assessed. Hidden or occluded outcomes remain uncertain."] });
}

export function describeEditedCheck(original: ProofStep, edit: EditableCheck): ProofStep {
  const step = { ...original, ...edit };
  switch (step.checkType) {
    case "object_enters_region":
      return { ...step, beforeState: null, afterState: null,
        label: `Put ${step.subjectConcept} inside ${step.targetConcept}`.slice(0, 240),
        observableEvidence: `Show ${step.subjectConcept} outside ${step.targetConcept}, then moving through its opening and into it. Keep the opening and the action visible.` };
    case "visible_state_change":
      return { ...step, targetConcept: null,
        label: `Show ${step.subjectConcept} changing from ${step.beforeState} to ${step.afterState}`.slice(0, 240),
        observableEvidence: `Keep ${step.subjectConcept} visible. Show it ${step.beforeState} before the action and ${step.afterState} afterward, with the change visible.` };
    case "object_present_at_end":
      return { ...step, targetConcept: null, beforeState: null, afterState: null,
        label: `Show ${step.subjectConcept} at the end`,
        observableEvidence: `Keep ${step.subjectConcept} clearly visible at the end of the video.` };
  }
}

export const plannerMessageSchema = z.strictObject({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4000),
});

export const plannerReplySchema = z.strictObject({
  reply: z.string().trim().min(1).max(4000),
  plan: proofPlanSchema.nullable(),
});

export const referenceMediaSchema = z.strictObject({
  name: z.string().min(1).max(255),
  kind: z.enum(["image", "video"]),
  durationMs: z.number().int().positive().max(LIMITS.durationMs).nullable(),
  summary: z.string().trim().min(1).max(6000),
});
export type ReferenceMedia = z.infer<typeof referenceMediaSchema>;

export const savedPlanSchema = z.strictObject({
  id: z.uuid(),
  revision: z.number().int().nonnegative(),
  version: z.number().int().positive().nullable(),
  versionId: z.uuid().nullable(),
  status: z.enum(["draft", "approved"]),
  contractHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  approvedAt: z.string().nullable(),
  videoConsentAt: z.string().nullable().default(null),
  plan: proofPlanSchema.nullable(),
  messages: z.array(plannerMessageSchema),
  referenceMedia: referenceMediaSchema.nullable().default(null),
});

export type PlannerMessage = z.infer<typeof plannerMessageSchema>;
export type PlannerReply = z.infer<typeof plannerReplySchema>;
export type SavedPlan = z.infer<typeof savedPlanSchema>;

export const plannerStreamEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("start") }),
  z.strictObject({ type: z.literal("reply"), text: z.string().max(4000) }),
  z.strictObject({ type: z.literal("done"), saved: savedPlanSchema }),
  z.strictObject({ type: z.literal("error"), message: z.string() }),
]);
export type PlannerStreamEvent = z.infer<typeof plannerStreamEventSchema>;

export const deletePlanResultSchema = z.strictObject({ deleted: z.literal(true) });

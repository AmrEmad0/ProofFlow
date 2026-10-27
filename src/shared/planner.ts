import { z } from "zod";
import { proofPlanSchema, proofStepSchema, type ProofStep } from "./proof-plan";

export const editableCheckSchema = z.strictObject({
  id: proofStepSchema.shape.id,
  subjectConcept: proofStepSchema.shape.subjectConcept,
  targetConcept: proofStepSchema.shape.targetConcept,
  beforeState: proofStepSchema.shape.beforeState,
  afterState: proofStepSchema.shape.afterState,
});
export const editChecksSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  steps: z.array(editableCheckSchema).min(1).max(3),
});
export type EditableCheck = z.infer<typeof editableCheckSchema>;

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

export const savedPlanSchema = z.strictObject({
  id: z.uuid(),
  revision: z.number().int().nonnegative(),
  version: z.number().int().positive().nullable(),
  versionId: z.uuid().nullable(),
  status: z.enum(["draft", "approved"]),
  contractHash: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  approvedAt: z.string().nullable(),
  plan: proofPlanSchema.nullable(),
  messages: z.array(plannerMessageSchema),
});

export type PlannerMessage = z.infer<typeof plannerMessageSchema>;
export type PlannerReply = z.infer<typeof plannerReplySchema>;
export type SavedPlan = z.infer<typeof savedPlanSchema>;

export const deletePlanResultSchema = z.strictObject({ deleted: z.literal(true) });

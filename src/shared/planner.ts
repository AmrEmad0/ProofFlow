import { z } from "zod";
import { proofPlanSchema } from "./proof-plan";

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

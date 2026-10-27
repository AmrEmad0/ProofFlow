import type OpenAI from "openai";
import { z } from "zod";
import { proofPlanSchema, proofPlanShape } from "../../shared/proof-plan";
import { MODELS } from "../meta/client";

const goalSchema = z.string().trim().min(1).max(2000);
const draftResponseSchema = z.strictObject({
  plan: proofPlanShape.nullable(),
  rejectionReason: z.string().nullable(),
});

// Adapter only: HTTP persistence and explicit human approval are separate work.
export async function draftPlan(client: OpenAI, goal: string) {
  const response = await client.chat.completions.create({
    model: MODELS.muse,
    messages: [
      { role: "system", content: "Draft a video evidence plan, never a certification. Use 1–3 visually observable checks and at most 4 unique short noun-phrase concepts. Use only object_enters_region, visible_state_change, object_present_at_end. Entry requires a targetConcept; state change requires beforeState and afterState. Use null for inapplicable fields. Explain visibility limits. Reject goals about hidden/internal condition or other unobservable properties by setting plan to null and explaining rejectionReason. For observable goals, return a plan and null rejectionReason. Never auto-approve." },
      { role: "user", content: goalSchema.parse(goal) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "proof_plan_draft", strict: true, schema: z.toJSONSchema(draftResponseSchema) },
    },
  });
  const message = response.choices[0]?.message;
  if (message?.refusal || !message?.content) throw new Error("The model did not return an observable proof plan.");
  const result = draftResponseSchema.parse(JSON.parse(message.content));
  if (!result.plan || result.rejectionReason !== null) throw new Error("The goal could not be expressed as an observable proof plan.");
  return proofPlanSchema.parse(result.plan);
}

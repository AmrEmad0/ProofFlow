import type OpenAI from "openai";
import { z } from "zod";
import { proofPlanSchema, planningPlanShape } from "../../shared/proof-plan";
import { planningInstructions } from "./chat";
import { MODELS } from "../meta/client";

const goalSchema = z.string().trim().min(1).max(2000);
const draftResponseSchema = z.strictObject({
  plan: planningPlanShape.nullable(),
  rejectionReason: z.string().nullable(),
});

// Adapter only: HTTP persistence and explicit human approval are separate work.
export async function draftPlan(client: OpenAI, goal: string) {
  const response = await client.chat.completions.create({
    model: MODELS.muse,
    messages: [
      { role: "system", content: planningInstructions },
      { role: "user", content: goalSchema.parse(goal) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "proof_plan_draft", strict: true, schema: z.toJSONSchema(draftResponseSchema) },
    },
  });
  const message = response.choices[0]?.message;
  if (message?.refusal || !message?.content) throw new Error("The model did not return an observable proof plan.");
  const result = draftResponseSchema.extend({ plan: proofPlanSchema.nullable() }).parse(JSON.parse(message.content));
  if (!result.plan || result.rejectionReason !== null) throw new Error("The goal could not be expressed as an observable proof plan.");
  return proofPlanSchema.parse(result.plan);
}

import type OpenAI from "openai";
import { z } from "zod";
import { approvedPlanSchema, type ApprovedPlan } from "../../shared/proof-plan";
import { MODELS } from "./client";
import { museAnalysisSchema } from "../../shared/observation";
export { museAnalysisSchema } from "../../shared/observation";
export type MuseAnalysis = z.infer<typeof museAnalysisSchema>;

export async function analyzeVideo(client: OpenAI, fileId: string, plan: ApprovedPlan): Promise<MuseAnalysis> {
  const approved = approvedPlanSchema.parse(plan);
  const response = await client.responses.create({
    model: MODELS.muse,
    input: [{ role: "user", content: [
      { type: "input_text", text: `Find candidate visible events for this approved plan. Report approximate milliseconds, before/after states, omissions, and ambiguities. Hypotheses only; do not certify success. Use only the supplied step IDs.\n${JSON.stringify(approved)}` },
      { type: "input_file", file_id: fileId },
    ] }],
    text: { format: { type: "json_schema", name: "candidate_events", strict: true, schema: z.toJSONSchema(museAnalysisSchema) } },
  });
  if (response.status !== "completed") throw new Error("Muse video analysis did not complete.");
  const result = museAnalysisSchema.parse(JSON.parse(response.output_text));
  const ids = new Set(approved.steps.map((step) => step.id));
  const seen = new Set<string>();
  for (const candidate of result.candidates) {
    if (!ids.has(candidate.stepId) || seen.has(candidate.stepId)) throw new Error("Muse returned unknown or duplicate step IDs.");
    seen.add(candidate.stepId);
    if ((candidate.startMs === null) !== (candidate.endMs === null)
      || (candidate.startMs !== null && candidate.endMs !== null && candidate.endMs < candidate.startMs)) {
      throw new Error("Muse returned an invalid event window.");
    }
  }
  return result;
}

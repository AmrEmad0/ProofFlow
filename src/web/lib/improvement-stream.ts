import { improvementStreamEventSchema, type ImprovementProgress } from "../../shared/plan-improvement";

import type { PlannerPreview } from "../../shared/planner";

export async function readImprovementStream(events: AsyncIterable<unknown>, onProgress?: (progress: ImprovementProgress) => void, onPlanPreview?: (preview: PlannerPreview) => void) {
  for await (const envelope of events) {
    const data = typeof envelope === "object" && envelope !== null && "data" in envelope ? envelope.data : undefined;
    const event = improvementStreamEventSchema.parse(data);
    if (event.type === "progress") onProgress?.(event.progress);
    if (event.type === "preview") onPlanPreview?.(event.preview);
    if (event.type === "done") return event.result;
    if (event.type === "error") throw new Error(event.message);
  }
  throw new Error("The suggestions were interrupted. Your plan is unchanged. Please try again.");
}

import { plannerStreamEventSchema, type SavedPlan } from "../../shared/planner";

export async function readPlannerStream(events: AsyncIterable<unknown>, onReplyText: (text: string) => void): Promise<SavedPlan> {
  for await (const envelope of events) {
    const data = typeof envelope === "object" && envelope !== null && "data" in envelope ? envelope.data : undefined;
    const event = plannerStreamEventSchema.parse(data);
    if (event.type === "reply") onReplyText(event.text);
    else if (event.type === "done") return event.saved;
    else if (event.type === "error") throw new Error(event.message);
  }
  throw new Error("The reply was interrupted before it could be saved. Reload the draft before trying again.");
}

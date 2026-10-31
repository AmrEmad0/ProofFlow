import { evidenceChatStreamEventSchema, type EvidenceChatReply } from "../../shared/evidence-chat";

export async function readEvidenceChatStream(events: AsyncIterable<unknown>, onReplyText: (text: string) => void): Promise<EvidenceChatReply> {
  for await (const envelope of events) {
    const data = typeof envelope === "object" && envelope !== null && "data" in envelope ? envelope.data : undefined;
    const event = evidenceChatStreamEventSchema.parse(data);
    if (event.type === "reply") onReplyText(event.text);
    else if (event.type === "done") return event.answer;
    else if (event.type === "error") throw new Error(event.message);
  }
  throw new Error("The reply was interrupted. Please try again.");
}

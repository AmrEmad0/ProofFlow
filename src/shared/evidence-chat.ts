import { z } from "zod";

export const evidenceChatMessageSchema = z.strictObject({
  role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000),
});
export const evidenceChatRequestSchema = z.strictObject({
  messages: z.array(evidenceChatMessageSchema).min(1).max(21),
}).refine(({ messages }) => messages.every((message, index) => message.role === (index % 2 === 0 ? "user" : "assistant")) && messages.at(-1)?.role === "user", "Send alternating messages ending with a question.");
export const evidenceChatReplySchema = z.strictObject({
  reply: z.string().trim().min(1).max(4000),
  references: z.array(z.strictObject({ stepId: z.string(), label: z.string(), timestampMs: z.number().nonnegative() })),
});
export type EvidenceChatMessage = z.infer<typeof evidenceChatMessageSchema>;
export type EvidenceChatReply = z.infer<typeof evidenceChatReplySchema>;

export const evidenceChatStreamEventSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("start") }),
  z.strictObject({ type: z.literal("ping") }),
  z.strictObject({ type: z.literal("reply"), text: z.string().max(4000) }),
  z.strictObject({ type: z.literal("done"), answer: evidenceChatReplySchema }),
  z.strictObject({ type: z.literal("error"), message: z.string() }),
]);
export type EvidenceChatStreamEvent = z.infer<typeof evidenceChatStreamEventSchema>;

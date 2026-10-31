import { sse } from "elysia";
import type { EvidenceChatReply, EvidenceChatStreamEvent } from "../../shared/evidence-chat";

export async function* evidenceChatEvents(
  complete: (onReplyText: (text: string) => void, signal: AbortSignal) => Promise<EvidenceChatReply>,
  requestSignal: AbortSignal,
) {
  const cancellation = new AbortController();
  const signal = AbortSignal.any([requestSignal, cancellation.signal]);
  const events = new ReadableStream<EvidenceChatStreamEvent>({
    async start(controller) {
      const emit = (event: EvidenceChatStreamEvent) => { if (!signal.aborted) controller.enqueue(event); };
      emit({ type: "start" });
      const heartbeat = setInterval(() => emit({ type: "ping" }), 15_000);
      try {
        const answer = await complete(text => emit({ type: "reply", text }), signal);
        signal.throwIfAborted();
        emit({ type: "done", answer });
      } catch {
        emit({ type: "error", message: "The evidence explanation was interrupted. Please try again." });
      } finally {
        clearInterval(heartbeat);
        if (!cancellation.signal.aborted) controller.close();
      }
    },
    cancel() { cancellation.abort(); },
  });
  const reader = events.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield sse({ data: value });
    }
  } finally {
    cancellation.abort();
    await reader.cancel();
    reader.releaseLock();
  }
}

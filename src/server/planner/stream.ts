import { sse } from "elysia";
import type { PlannerStreamEvent, SavedPlan } from "../../shared/planner";

export async function* plannerEvents(
  complete: (onReplyText: (text: string) => void, signal: AbortSignal) => Promise<SavedPlan>,
  requestSignal: AbortSignal,
) {
  const cancellation = new AbortController();
  const signal = AbortSignal.any([requestSignal, cancellation.signal]);
  const events = new ReadableStream<PlannerStreamEvent>({
    async start(controller) {
      const emit = (event: PlannerStreamEvent) => { if (!signal.aborted) controller.enqueue(event); };
      emit({ type: "start" });
      try {
        const saved = await complete((text) => emit({ type: "reply", text }), signal);
        emit({ type: "done", saved });
      } catch (error) {
        emit({ type: "error", message: error instanceof Error ? error.message : "The reply was interrupted. Please try again." });
      } finally {
        controller.close();
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

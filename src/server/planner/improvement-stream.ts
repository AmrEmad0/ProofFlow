import { sse } from "elysia";
import type { ImprovementCallbacks } from "./improve";
import type { z } from "zod";
import type { improvementResponseSchema, ImprovementStreamEvent } from "../../shared/plan-improvement";

export async function* improvementEvents(complete: (signal: AbortSignal, callbacks: ImprovementCallbacks) => Promise<z.infer<typeof improvementResponseSchema>>, requestSignal: AbortSignal) {
  const cancellation = new AbortController();
  const signal = AbortSignal.any([requestSignal, cancellation.signal]);
  const events = new ReadableStream<ImprovementStreamEvent>({
    async start(controller) {
      const emit = (event: ImprovementStreamEvent) => { if (!signal.aborted) controller.enqueue(event); };
      emit({ type: "start" });
      const heartbeat = setInterval(() => emit({ type: "ping" }), 15_000);
      try {
        const result = await complete(signal, { onProgress: progress => emit({ type: "progress", progress }), onPlanPreview: preview => emit({ type: "preview", preview }) });
        signal.throwIfAborted();
        emit({ type: "done", result });
      } catch (error) {
        emit({ type: "error", message: error instanceof Error ? error.message : "The suggestions were interrupted. Please try again." });
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

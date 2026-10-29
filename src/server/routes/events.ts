import type { Database } from "bun:sqlite";
import { Elysia } from "elysia";
import type { Config } from "../config";
import { requireWorkspaceOrigin, sessionHash } from "../http/session";
import { workspaceEvents } from "../http/workspace-events";
import type { WorkspaceEvent } from "../../shared/workspace-events";
import type { VerificationWorker } from "../verification/worker";

export function eventRoutes(db: Database, config: Config, worker?: VerificationWorker) {
  const hub = workspaceEvents(db);
  return new Elysia().get("/api/events", ({ request }) => {
    requireWorkspaceOrigin(request, config);
    const owner = sessionHash(request);
    const encoder = new TextEncoder();
    let cleanup = (_closeStream: boolean) => {};
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;
        let timer: ReturnType<typeof setInterval> | undefined;
        let unsubscribe = () => {};
        const onAbort = () => close();
        const close = (closeStream = true) => {
          if (closed) return;
          closed = true;
          if (timer) clearInterval(timer);
          unsubscribe();
          request.signal.removeEventListener("abort", onAbort);
          if (closeStream) controller.close();
        };
        cleanup = close;
        const send = (event: WorkspaceEvent) => {
          if (closed) return;
          // A slow client reconnects and resyncs instead of buffering unbounded updates.
          if ((controller.desiredSize ?? 0) <= 0) { close(); return; }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };
        const readiness = () => ({ available: Boolean(worker?.ready && config.modelConfigured), retentionHours: config.MEDIA_RETENTION_HOURS });
        unsubscribe = hub.subscribe(owner, send, close);
        request.signal.addEventListener("abort", onAbort, { once: true });
        if (request.signal.aborted) { close(); return; }
        send({ type: "ready", ...readiness() });
        timer = setInterval(() => send({ type: "heartbeat", ...readiness() }), 15_000);
        timer.unref();
      },
      cancel() { cleanup(false); },
    }, { highWaterMark: 64 });
    return new Response(stream, { headers: {
      "content-type": "text/event-stream", "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no", "x-content-type-options": "nosniff",
    } });
  });
}

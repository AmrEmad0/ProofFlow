import type { QueryClient } from "@tanstack/react-query";
import { workspaceEventSchema } from "../../shared/workspace-events";

let connected = false;
export const workspaceStreamConnected = () => connected;
const liveKeys = new Set(["triggers", "runs", "run", "verification-status"]);

export function connectWorkspaceEvents(client: QueryClient) {
  let source: EventSource | null = null;
  let stopped = false;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let reconnect: ReturnType<typeof setTimeout> | undefined;
  const resync = () => {
    void client.invalidateQueries({ predicate: query => liveKeys.has(String(query.queryKey[0])) });
  };
  const disconnect = () => {
    if (!connected) return;
    connected = false;
    resync();
  };
  const start = () => {
    if (stopped || source || reconnect || typeof EventSource === "undefined") return;
    // A plan/run query is only mounted after a workspace session has been created.
    const hasWorkspace = client.getQueryCache().getAll().some(query =>
      ["triggers", "runs", "run"].includes(String(query.queryKey[0])) && typeof query.queryKey[1] === "string");
    if (!hasWorkspace) return;
    source = new EventSource("/api/events");
    source.onmessage = (message) => {
      let value: unknown;
      try { value = JSON.parse(message.data); } catch { disconnect(); return; }
      const parsed = workspaceEventSchema.safeParse(value);
      if (!parsed.success) { disconnect(); return; }
      const event = parsed.data;
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(disconnect, 45_000);
      if (event.type === "ready" || event.type === "heartbeat") {
        client.setQueryData(["verification-status"], { available: event.available, retentionHours: event.retentionHours });
        if (!connected) { connected = true; resync(); }
      } else if (event.type === "run.updated") {
        void client.invalidateQueries({ queryKey: ["runs", event.planId], exact: true });
        void client.invalidateQueries({ queryKey: ["run", event.runId], exact: true });
      } else {
        void client.invalidateQueries({ queryKey: ["triggers", event.planId], exact: true });
      }
    };
    source.onerror = () => {
      if (watchdog) clearTimeout(watchdog);
      disconnect();
      // EventSource retries transient failures itself; terminal HTTP errors need a new instance.
      if (source?.readyState === EventSource.CLOSED && !reconnect) {
        source.close();
        source = null;
        reconnect = setTimeout(() => { reconnect = undefined; start(); }, 15_000);
      }
    };
  };
  const unsubscribe = client.getQueryCache().subscribe(start);
  start();
  return () => {
    stopped = true;
    unsubscribe();
    source?.close();
    if (watchdog) clearTimeout(watchdog);
    if (reconnect) clearTimeout(reconnect);
    connected = false;
  };
}

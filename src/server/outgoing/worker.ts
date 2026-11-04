import type { Database } from "bun:sqlite";
import { outgoingStore } from "./store";
import { postOutgoing } from "./transport";

export function createOutgoingWorker(db: Database, send = postOutgoing) {
  let stopped = false;
  let work: Promise<void> | null = null;
  async function drain() {
    while (!stopped) {
      const delivery = outgoingStore(db).claim();
      if (!delivery) return;
      let status: number | null = null;
      try { status = await send(delivery.endpoint, delivery.payload_json, delivery.event_id); } catch { /* Persist a safe error without destination or response data. */ }
      const delivered = status !== null && status >= 200 && status < 300;
      db.query(`UPDATE outgoing_deliveries SET state = ?, http_status = ?, error = ?, delivered_at = ?, next_at = ? WHERE run_id = ?`)
        .run(delivered ? "delivered" : delivery.attempts >= 3 ? "failed" : "pending", status,
          delivered ? null : status ? `Endpoint returned HTTP ${status}.` : "Endpoint unavailable or blocked; delivery was not confirmed.",
          delivered ? new Date().toISOString() : null, Date.now() + delivery.attempts * 15_000, delivery.run_id);
    }
  }
  function kick() {
    if (stopped || work) return;
    work = drain().catch(() => console.warn("Outgoing report delivery deferred")).finally(() => { work = null; });
  }
  const timer = setInterval(kick, 2000);
  timer.unref();
  kick();
  return { kick, idle: async () => { await work; }, stop: async () => { stopped = true; clearInterval(timer); await work; } };
}

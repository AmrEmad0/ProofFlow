import type { Database } from "bun:sqlite";
import { outgoingOverviewSchema, outgoingPayloadSchema, outgoingPayload } from "../../shared/outgoing";
import { plannerStore, PlannerError } from "../planner/store";
import { verificationStore } from "../verification/store";

type Delivery = { run_id: string; event_id: string; endpoint: string; payload_json: string | null;
  state: "pending" | "sending" | "delivered" | "failed"; attempts: number; http_status: number | null; error: string | null; delivered_at: string | null };

export function outgoingStore(db: Database) {
  function overview(planId: string, owner: string, runId?: string) {
    plannerStore(db).read(planId, owner);
    if (runId) {
      const run = verificationStore(db).row(runId, owner);
      const version = db.query<{ plan_id: string }, [string]>("SELECT plan_id FROM plan_versions WHERE id = ?").get(run.plan_version_id);
      if (version?.plan_id !== planId) throw new PlannerError(404, "This video belongs to another plan.");
    }
    const delivery = runId ? db.query<Delivery, [string]>("SELECT * FROM outgoing_deliveries WHERE run_id = ?").get(runId) : null;
    return outgoingOverviewSchema.parse({ endpoint: db.query<{ endpoint: string }, [string]>("SELECT endpoint FROM plan_outgoing WHERE plan_id = ?").get(planId)?.endpoint ?? null,
      delivery: delivery ? { state: delivery.state, attempts: delivery.attempts, httpStatus: delivery.http_status, error: delivery.error, deliveredAt: delivery.delivered_at } : null });
  }
  function save(planId: string, owner: string, endpoint: string | null) {
    plannerStore(db).read(planId, owner);
    if (endpoint) db.query("INSERT INTO plan_outgoing (plan_id, endpoint) VALUES (?, ?) ON CONFLICT(plan_id) DO UPDATE SET endpoint = excluded.endpoint").run(planId, endpoint);
    else db.query("DELETE FROM plan_outgoing WHERE plan_id = ?").run(planId);
    return overview(planId, owner);
  }
  function claim() {
    return db.transaction(() => {
      const delivery = db.query<Delivery, [number]>(`SELECT d.* FROM outgoing_deliveries d
        JOIN runs r ON r.id = d.run_id JOIN plan_versions v ON v.id = r.plan_version_id JOIN plans p ON p.id = v.plan_id
        WHERE p.deleted_at IS NULL AND d.state IN ('pending','sending') AND d.next_at <= ? LIMIT 1`).get(Date.now());
      if (!delivery) return null;
      if (delivery.attempts >= 3) {
        db.query("UPDATE outgoing_deliveries SET state = 'failed', error = 'Delivery interrupted after three attempts.' WHERE run_id = ?").run(delivery.run_id);
        return null;
      }
      const owner = db.query<{ session_hash: string }, [string]>(`SELECT o.session_hash FROM runs r JOIN plan_versions v ON v.id = r.plan_version_id
        JOIN planner_owners o ON o.plan_id = v.plan_id WHERE r.id = ?`).get(delivery.run_id)!;
      const savedPayload = delivery.payload_json ? outgoingPayloadSchema.safeParse(JSON.parse(delivery.payload_json)) : null;
      const payload = savedPayload?.success ? JSON.stringify(savedPayload.data)
        : JSON.stringify(outgoingPayload(verificationStore(db).details(delivery.run_id, owner.session_hash)));
      db.query("UPDATE outgoing_deliveries SET state = 'sending', attempts = attempts + 1, next_at = ?, payload_json = ? WHERE run_id = ?")
        .run(Date.now() + 60_000, payload, delivery.run_id);
      return { ...delivery, attempts: delivery.attempts + 1, payload_json: payload };
    })();
  }
  return { overview, save, claim };
}

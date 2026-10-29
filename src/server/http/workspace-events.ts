import type { Database } from "bun:sqlite";
import type { WorkspaceEvent } from "../../shared/workspace-events";

type Change = Extract<WorkspaceEvent, { planId: string }>;
type Listener = (event: Change) => void;
const hubs = new WeakMap<Database, ReturnType<typeof createHub>>();

function createHub(db: Database) {
  const listeners = new Map<string, Set<Listener>>();
  const disconnects = new Set<() => void>();
  const pending = new Map<string, { owner: string; event: Change }>();
  let scheduled = false;
  db.function("proofflow_changed", (owner: unknown, type: unknown, planId: unknown, runId: unknown) => {
    if (typeof owner !== "string" || typeof planId !== "string") return 0;
    const event: Change = type === "run.updated" && typeof runId === "string"
      ? { type, planId, runId } : { type: "triggers.updated", planId };
    pending.set(`${owner}:${event.type}:${runId ?? planId}`, { owner, event });
    if (!scheduled) {
      scheduled = true;
      // SQLite calls during the write. Fetches must happen after the transaction ends.
      // A rollback can cause a harmless invalidation; events never carry verdicts or row data.
      queueMicrotask(() => {
        scheduled = false;
        const batch = [...pending.values()];
        pending.clear();
        for (const { owner, event } of batch) for (const listener of listeners.get(owner) ?? []) listener(event);
      });
    }
    return 0;
  });

  // Connection-local triggers cover API writes and both workers without a polling loop.
  const tables = [
    { table: "runs", plan: "(SELECT plan_id FROM plan_versions WHERE id = ROW.plan_version_id)", run: "ROW.id" },
    { table: "task_sessions", plan: "ROW.plan_id" },
    { table: "trigger_captures", plan: "(SELECT plan_id FROM task_sessions WHERE id = ROW.session_id)" },
    { table: "plan_triggers", plan: "ROW.plan_id" },
    { table: "demo_feeds", plan: "ROW.plan_id" },
  ];
  for (const { table, plan, run } of tables) for (const operation of ["INSERT", "UPDATE", "DELETE"]) {
    const row = operation === "DELETE" ? "OLD" : "NEW";
    const planId = plan.replaceAll("ROW", row);
    db.exec(`CREATE TEMP TRIGGER proofflow_events_${table}_${operation} AFTER ${operation} ON main.${table}
      BEGIN SELECT proofflow_changed((SELECT session_hash FROM planner_owners WHERE plan_id = ${planId}),
        '${run ? "run.updated" : "triggers.updated"}', ${planId}, ${run ? run.replaceAll("ROW", row) : "NULL"}); END`);
  }
  return {
    subscribe(owner: string, listener: Listener, disconnect: () => void) {
      const subscribers = listeners.get(owner) ?? new Set<Listener>();
      subscribers.add(listener);
      listeners.set(owner, subscribers);
      disconnects.add(disconnect);
      return () => {
        subscribers.delete(listener);
        disconnects.delete(disconnect);
        if (!subscribers.size) listeners.delete(owner);
      };
    },
    close() { for (const disconnect of [...disconnects]) disconnect(); },
  };
}

export function workspaceEvents(db: Database) {
  let hub = hubs.get(db);
  if (!hub) { hub = createHub(db); hubs.set(db, hub); }
  return hub;
}

import type { Database } from "bun:sqlite";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { defaultTriggerSettings, taskSessionSchema, triggerConfigurationSchema, triggerEventSchema, triggerSettingsSchema, type TriggerSource } from "../../shared/triggers";
import { PlannerError, plannerStore } from "../planner/store";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");
type ConfigurationRow = { revision: number; settings_json: string; api_key_hash: string | null; start_link_token: string | null; finish_link_token: string | null };
type SessionRow = {
  id: string; plan_id: string; plan_version_id: string; contract_hash: string; configuration_revision: number;
  settings_json: string; reference: string | null; source: TriggerSource; state: "active" | "finished" | "cancelled";
  started_at: string; ended_at: string | null; run_id: string | null;
};

export function triggerStore(db: Database) {
  const plans = plannerStore(db);
  function configuration(planId: string) {
    const row = db.query<ConfigurationRow, [string]>("SELECT * FROM plan_triggers WHERE plan_id = ?").get(planId);
    return triggerConfigurationSchema.parse({ revision: row?.revision ?? 0,
      settings: row ? JSON.parse(row.settings_json) : defaultTriggerSettings, apiKeyConfigured: Boolean(row?.api_key_hash),
      links: { start: row?.start_link_token ? `/api/hooks/${row.start_link_token}` : null,
        finish: row?.finish_link_token ? `/api/hooks/${row.finish_link_token}` : null } });
  }
  function session(id: string, planId: string) {
    const row = db.query<SessionRow, [string, string]>("SELECT * FROM task_sessions WHERE id = ? AND plan_id = ?").get(id, planId);
    if (!row) throw new PlannerError(404, "This task session could not be found.");
    const capture = db.query<{ state: string; error_message: string | null }, [string]>("SELECT state, error_message FROM trigger_captures WHERE session_id = ?").get(id);
    return taskSessionSchema.parse({ captureState: capture?.state ?? null, captureError: capture?.error_message ?? null, id: row.id, planId: row.plan_id, approvedVersionId: row.plan_version_id,
      contractHash: row.contract_hash, configurationRevision: row.configuration_revision, settings: JSON.parse(row.settings_json),
      reference: row.reference, source: row.source, state: row.state, startedAt: row.started_at, endedAt: row.ended_at, runId: row.run_id });
  }
  function overview(planId: string, owner: string) {
    plans.read(planId, owner);
    const rows = db.query<{ id: string }, [string]>("SELECT id FROM task_sessions WHERE plan_id = ? ORDER BY started_at DESC, rowid DESC LIMIT 30").all(planId);
    return { configuration: configuration(planId), sessions: rows.map(row => session(row.id, planId)) };
  }
  function save(planId: string, owner: string, revision: number, input: unknown) {
    const parsed = triggerSettingsSchema.safeParse(input);
    if (!parsed.success) throw new PlannerError(400, "Choose a supported start and finish trigger.");
    if (Boolean(parsed.data.recording) !== (parsed.data.finish === "clip")) throw new PlannerError(400, "Recorded sources finish when their clip ends.");
    db.transaction(() => {
      plans.read(planId, owner);
      if (configuration(planId).revision !== revision) throw new PlannerError(409, "Trigger settings changed. Reload before saving.");
      if (db.query("SELECT 1 FROM task_sessions WHERE plan_id = ? AND state = 'active'").get(planId)) {
        throw new PlannerError(409, "Finish or cancel the current task before changing its triggers.");
      }
      const startToken = parsed.data.start === "api" ? randomBytes(32).toString("hex") : null;
      const finishToken = parsed.data.finish === "api" ? randomBytes(32).toString("hex") : null;
      db.query(`INSERT INTO plan_triggers (plan_id, revision, settings_json, start_link_token, finish_link_token) VALUES (?, 1, ?, ?, ?)
        ON CONFLICT(plan_id) DO UPDATE SET revision = revision + 1, settings_json = excluded.settings_json,
        start_link_token = CASE WHEN excluded.start_link_token IS NULL THEN NULL ELSE COALESCE(start_link_token, excluded.start_link_token) END,
        finish_link_token = CASE WHEN excluded.finish_link_token IS NULL THEN NULL ELSE COALESCE(finish_link_token, excluded.finish_link_token) END`)
        .run(planId, JSON.stringify(parsed.data), startToken, finishToken);
    })();
    return configuration(planId);
  }
  function rotateKey(planId: string, owner: string) {
    plans.read(planId, owner);
    const token = randomBytes(32).toString("hex");
    db.query(`INSERT INTO plan_triggers (plan_id, settings_json, api_key_hash) VALUES (?, ?, ?)
      ON CONFLICT(plan_id) DO UPDATE SET api_key_hash = excluded.api_key_hash`).run(planId, JSON.stringify(defaultTriggerSettings), digest(token));
    return { token };
  }
  function revokeKey(planId: string, owner: string) {
    plans.read(planId, owner);
    db.query("UPDATE plan_triggers SET api_key_hash = NULL WHERE plan_id = ?").run(planId);
    return { revoked: true as const };
  }
  function apiOwner(planId: string, authorization: string | null) {
    const token = authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    const row = db.query<{ api_key_hash: string | null; session_hash: string }, [string]>(`SELECT t.api_key_hash, o.session_hash
      FROM plan_triggers t JOIN planner_owners o ON o.plan_id = t.plan_id JOIN plans p ON p.id = t.plan_id
      WHERE t.plan_id = ? AND p.deleted_at IS NULL`).get(planId);
    if (!token || !row?.api_key_hash || !timingSafeEqual(Buffer.from(digest(token), "hex"), Buffer.from(row.api_key_hash, "hex"))) {
      throw new PlannerError(403, "A valid API trigger key for this plan is required.");
    }
    return row.session_hash;
  }
  function regenerateLink(planId: string, owner: string, action: "start" | "finish") {
    plans.read(planId, owner);
    if (configuration(planId).settings[action] !== "api") throw new PlannerError(409, "Choose API link for this trigger first.");
    const token = randomBytes(32).toString("hex");
    if (action === "start") db.query("UPDATE plan_triggers SET start_link_token = ? WHERE plan_id = ?").run(token, planId);
    else db.query("UPDATE plan_triggers SET finish_link_token = ? WHERE plan_id = ?").run(token, planId);
    return configuration(planId);
  }
  function fireLink(token: string) {
    if (!/^[a-f0-9]{64}$/.test(token)) throw new PlannerError(404, "This trigger link is unavailable.");
    return db.transaction(() => {
      const row = db.query<{ plan_id: string; session_hash: string; start_link_token: string | null }, [string, string]>(`SELECT t.plan_id, t.start_link_token, o.session_hash
        FROM plan_triggers t JOIN plans p ON p.id = t.plan_id JOIN planner_owners o ON o.plan_id = t.plan_id
        WHERE (t.start_link_token = ? OR t.finish_link_token = ?) AND p.deleted_at IS NULL`).get(token, token);
      if (!row) throw new PlannerError(404, "This trigger link is unavailable.");
      const action = row.start_link_token === token ? "start" : "finish";
      const active = db.query<{ id: string }, [string]>("SELECT id FROM task_sessions WHERE plan_id = ? AND state = 'active'").get(row.plan_id);
      // Direct links carry authority in the URL. Never include their token in logs or responses.
      if (action === "start" && active) return { triggered: true as const, action, sessionId: active.id, state: "active" as const };
      if (action === "finish" && !active) throw new PlannerError(409, "No active task to finish.");
      const task = dispatch(row.plan_id, row.session_hash, "api", { eventId: crypto.randomUUID(), action, ...(active ? { sessionId: active.id } : {}) });
      return { triggered: true as const, action, sessionId: task.id, state: task.state };
    })();
  }
  function dispatch(planId: string, owner: string, source: TriggerSource, input: unknown) {
    const parsed = triggerEventSchema.safeParse(input);
    if (!parsed.success) throw new PlannerError(400, "Provide a valid trigger event and unique event ID.");
    const event = parsed.data;
    if (event.action === "start" ? Boolean(event.sessionId) : !event.sessionId || Boolean(event.reference)) {
      throw new PlannerError(400, "Start takes an optional reference; finish and cancel require a session ID.");
    }
    return db.transaction(() => {
      const plan = plans.read(planId, owner);
      const payloadHash = digest(JSON.stringify([source, event.action, event.reference ?? null, event.sessionId ?? null]));
      const previous = db.query<{ payload_hash: string; session_id: string }, [string, string]>("SELECT * FROM trigger_events WHERE plan_id = ? AND event_id = ?").get(planId, event.eventId);
      if (previous) {
        if (previous.payload_hash !== payloadHash) throw new PlannerError(409, "This event ID was already used for a different trigger.");
        return session(previous.session_id, planId);
      }
      let id: string;
      if (event.action === "start") {
        const config = configuration(planId);
        if (config.settings.start !== source) throw new PlannerError(409, "This start trigger is not enabled for the plan.");
        if (source === "scanner" && !event.reference) throw new PlannerError(400, "Scan or enter an order reference first.");
        if (plan.status !== "approved" || !plan.versionId || !plan.contractHash) throw new PlannerError(409, "Review and approve the plan before starting a task.");
        if (db.query("SELECT 1 FROM task_sessions WHERE plan_id = ? AND state = 'active'").get(planId)) throw new PlannerError(409, "A task is already active. Finish or cancel it before starting another.");
        if (config.settings.recording && !plan.videoConsentAt) throw new PlannerError(409, "Approve video sharing before starting a recorded task.");
        const recent = db.query<{ count: number }, [string]>("SELECT count(*) AS count FROM task_sessions WHERE plan_id = ? AND started_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')").get(planId)!.count;
        if (recent >= 200) throw new PlannerError(429, "This plan has reached its daily limit of 200 task sessions.");
        id = crypto.randomUUID();
        db.query(`INSERT INTO task_sessions (id, plan_id, plan_version_id, contract_hash, configuration_revision, settings_json, reference, source, state, started_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`).run(id, planId, plan.versionId, plan.contractHash, config.revision, JSON.stringify(config.settings), event.reference ?? null, source, new Date().toISOString());
        if (config.settings.recording) db.query("INSERT INTO trigger_captures (session_id, state) VALUES (?, 'queued')").run(id);
      } else {
        id = event.sessionId!;
        const current = session(id, planId);
        if (current.state !== "active") throw new PlannerError(409, "This task has already ended.");
        const allowed = event.action === "cancel" ? source === "manual" || (source === "api" && (current.settings.start === "api" || current.settings.finish === "api")) : current.settings.finish === source;
        if (!allowed) throw new PlannerError(409, "Use the configured finish trigger for this task.");
        db.query("UPDATE task_sessions SET state = ?, ended_at = ? WHERE id = ?").run(event.action === "finish" ? "finished" : "cancelled", new Date().toISOString(), id);
      }
      db.query("INSERT INTO trigger_events (plan_id, event_id, payload_hash, session_id) VALUES (?, ?, ?, ?)").run(planId, event.eventId, payloadHash, id);
      return session(id, planId);
    })();
  }
  function attachment(id: string, owner: string, versionId: string) {
    const row = db.query<{ plan_id: string }, [string]>("SELECT plan_id FROM task_sessions WHERE id = ?").get(id);
    if (!row) throw new PlannerError(404, "This task session could not be found.");
    plans.read(row.plan_id, owner);
    const current = session(id, row.plan_id);
    if (current.approvedVersionId !== versionId) throw new PlannerError(409, "The video must use the approved plan version saved when this task started.");
    if (current.state !== "finished" || current.runId) throw new PlannerError(409, "Choose a finished task that does not already have a video.");
    return current;
  }
  return { configuration, overview, save, rotateKey, revokeKey, apiOwner, regenerateLink, fireLink, dispatch, attachment };
}

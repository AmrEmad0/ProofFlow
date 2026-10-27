import type { Database } from "bun:sqlite";
import { approvedPlanSchema } from "../../shared/proof-plan";
import { runDetailsSchema, runSummarySchema, type RunSummary } from "../../shared/verification";
import { hashContract } from "../engine/contract";
import { PlannerError } from "../planner/store";

export type RunRow = {
  id: string; plan_version_id: string; state: RunSummary["state"]; video_path: string;
  normalized_path: string | null; remote_file_id: string | null; video_sha256: string | null;
  duration_ms: number | null; created_at: string; completed_at: string | null; expires_at: string | null;
  error_message: string | null; media_json: string | null; receipt_json: string | null;
  timings_json: string; warnings_json: string;
};

export function verificationStore(db: Database) {
  function approved(versionId: string, sessionHash?: string) {
    const row = db.query<{
      id: string; title_snapshot: string; goal_snapshot: string; steps_json: string; limitations_json: string; contract_hash: string;
    }, [string, string | null, string | null]>(`SELECT v.* FROM plan_versions v JOIN planner_owners o ON o.plan_id = v.plan_id JOIN plans p ON p.id = v.plan_id
      WHERE v.id = ? AND v.status = 'approved' AND p.deleted_at IS NULL AND (? IS NULL OR o.session_hash = ?)`).get(versionId, sessionHash ?? null, sessionHash ?? null);
    if (!row) throw new PlannerError(404, "The approved plan could not be found in your workspace.");
    const plan = approvedPlanSchema.parse({ schemaVersion: 1, title: row.title_snapshot, goal: row.goal_snapshot,
      steps: JSON.parse(row.steps_json), limitations: JSON.parse(row.limitations_json),
      approvedVersionId: row.id, contractHash: row.contract_hash });
    const { approvedVersionId: _version, contractHash: _hash, ...contract } = plan;
    if (hashContract(contract) !== plan.contractHash) throw new Error("Approved contract integrity check failed.");
    return plan;
  }

  function row(id: string, sessionHash?: string): RunRow {
    const result = db.query<RunRow, [string, string | null, string | null]>(`SELECT r.* FROM runs r
      JOIN plan_versions v ON v.id = r.plan_version_id JOIN planner_owners o ON o.plan_id = v.plan_id JOIN plans p ON p.id = v.plan_id
      WHERE r.id = ? AND p.deleted_at IS NULL AND (? IS NULL OR o.session_hash = ?) AND r.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`).get(id, sessionHash ?? null, sessionHash ?? null);
    if (!result) throw new PlannerError(404, "This video run could not be found or has expired.");
    return result;
  }

  function summary(run: RunRow): RunSummary {
    return runSummarySchema.parse({ id: run.id, approvedVersionId: run.plan_version_id, state: run.state,
      createdAt: run.created_at, completedAt: run.completed_at, expiresAt: run.expires_at, error: run.error_message, durationMs: run.duration_ms });
  }

  function details(id: string, sessionHash: string) {
    const run = row(id, sessionHash);
    return runDetailsSchema.parse({ ...summary(run), approvedPlan: approved(run.plan_version_id, sessionHash),
      receipt: run.receipt_json ? JSON.parse(run.receipt_json) : null,
      media: run.media_json ? JSON.parse(run.media_json) : null,
      tracks: [], warnings: JSON.parse(run.warnings_json), timings: JSON.parse(run.timings_json) });
  }

  function list(versionId: string, sessionHash: string) {
    approved(versionId, sessionHash);
    return db.query<RunRow, [string]>("SELECT * FROM runs WHERE plan_version_id = ? AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ORDER BY created_at DESC, rowid DESC").all(versionId).map(summary);
  }

  function create(id: string, versionId: string, hash: string, sessionHash: string, path: string, retentionHours: number) {
    db.transaction(() => {
      const plan = approved(versionId, sessionHash);
      if (plan.contractHash !== hash) throw new PlannerError(409, "The approved plan does not match the version you reviewed.");
      const active = db.query<{ count: number }, [string]>(`SELECT count(*) AS count FROM runs r JOIN plan_versions v ON v.id = r.plan_version_id
        JOIN planner_owners o ON o.plan_id = v.plan_id WHERE o.session_hash = ? AND r.state NOT IN ('completed', 'failed')`).get(sessionHash)?.count ?? 0;
      if (active > 0) throw new PlannerError(409, "A video is already being processed in your workspace. Wait for it to finish.");
      const queued = db.query<{ count: number }, []>("SELECT count(*) AS count FROM runs WHERE state NOT IN ('completed', 'failed')").get()?.count ?? 0;
      const recent = db.query<{ count: number }, [string]>(`SELECT count(*) AS count FROM runs r JOIN plan_versions v ON v.id = r.plan_version_id
        JOIN planner_owners o ON o.plan_id = v.plan_id WHERE o.session_hash = ? AND r.created_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day')`).get(sessionHash)?.count ?? 0;
      if (queued >= 6 || recent >= 20) throw new PlannerError(429, "The video queue or daily workspace limit is full. Please try again later.");
      const now = new Date().toISOString();
      db.query("INSERT INTO runs (id, plan_version_id, state, video_path, consent_at, expires_at) VALUES (?, ?, 'queued', ?, ?, ?)")
        .run(id, versionId, path, now, new Date(Date.now() + retentionHours * 3_600_000).toISOString());
    })();
    return summary(row(id, sessionHash));
  }

  return { approved, row, summary, details, list, create };
}

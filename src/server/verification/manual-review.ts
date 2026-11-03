import type { Database } from "bun:sqlite";
import { manualReviewInputSchema, manualReviewSchema, needsManualReview, reviewQueueSchema, type ManualReviewInput } from "../../shared/manual-review";
import { PlannerError } from "../planner/store";
import { verificationStore } from "./store";

export function manualReviewStore(db: Database) {
  function history(runId: string) {
    return db.query<{ id: number; step_id: string; decision: string; timestamp_ms: number | null; note: string; reviewed_at: string }, [string]>(
      "SELECT * FROM manual_reviews WHERE run_id = ? ORDER BY id").all(runId).map(row => manualReviewSchema.parse({
        id: row.id, stepId: row.step_id, decision: row.decision, timestampMs: row.timestamp_ms, note: row.note, reviewedAt: row.reviewed_at,
      }));
  }
  function save(runId: string, owner: string, input: ManualReviewInput) {
    const value = manualReviewInputSchema.parse(input);
    return db.transaction(() => {
      const run = verificationStore(db).details(runId, owner);
      if (run.state !== "completed" || !run.receipt || !run.media || !run.durationMs) throw new PlannerError(409, "This video is not ready for manual review.");
      if (!run.receipt.findings.some(item => item.stepId === value.stepId) || !run.approvedPlan.steps.some(item => item.id === value.stepId)) throw new PlannerError(404, "This check does not belong to this video.");
      if (value.timestampMs !== null && value.timestampMs >= run.durationMs) throw new PlannerError(400, "Choose a moment within this recording.");
      const latest = history(runId).filter(item => item.stepId === value.stepId).at(-1);
      if ((latest?.id ?? 0) !== value.expectedRevision) throw new PlannerError(409, "This decision changed elsewhere. Reload before saving your review.");
      const result = db.query("INSERT INTO manual_reviews (run_id, step_id, decision, timestamp_ms, note, reviewed_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(runId, value.stepId, value.decision, value.timestampMs, value.note, new Date().toISOString());
      return history(runId).find(item => item.id === Number(result.lastInsertRowid))!;
    })();
  }
  function queue(owner: string) {
    const rows = db.query<{ id: string; plan_id: string }, [string]>(`SELECT r.id, v.plan_id FROM runs r
      JOIN plan_versions v ON v.id = r.plan_version_id JOIN planner_owners o ON o.plan_id = v.plan_id
      JOIN plans p ON p.id = v.plan_id WHERE o.session_hash = ? AND p.deleted_at IS NULL
      AND r.state = 'completed' AND r.receipt_json IS NOT NULL ORDER BY r.created_at, r.id`).all(owner);
    return reviewQueueSchema.parse(rows.flatMap(row => {
      const run = verificationStore(db).details(row.id, owner);
      return (run.receipt?.findings ?? []).filter(needsManualReview).map(finding => {
        const step = run.approvedPlan.steps.find(item => item.id === finding.stepId)!;
        return { runId: run.id, planId: row.plan_id, planTitle: run.approvedPlan.title, planVersion: run.planVersion,
          stepId: step.id, label: step.label, requirement: step.observableEvidence, createdAt: run.createdAt,
          taskReference: run.taskReference, automatedStatus: finding.status,
          latestReview: run.manualReviews.filter(item => item.stepId === step.id).at(-1) ?? null };
      });
    }));
  }
  return { history, save, queue };
}

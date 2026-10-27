import type { Database } from "bun:sqlite";
import { savedPlanSchema, type PlannerMessage, type PlannerReply, type SavedPlan } from "../../shared/planner";
import { packproofTemplate } from "../../shared/packproof";
import { proofPlanSchema, type ProofPlan } from "../../shared/proof-plan";
import { hashContract } from "../engine/contract";

export class PlannerError extends Error {
  constructor(public status: 400 | 403 | 404 | 409 | 413 | 416 | 429 | 502 | 503, message: string) { super(message); }
}

type VersionRow = {
  id: string; version: number; status: "draft" | "approved";
  title_snapshot: string; goal_snapshot: string; steps_json: string; limitations_json: string;
  contract_hash: string | null; approved_at: string | null;
};

export function plannerStore(db: Database) {
  function read(id: string, sessionHash: string): SavedPlan {
    const owner = db.query<{ revision: number }, [string, string]>(
      "SELECT o.revision FROM planner_owners o JOIN plans p ON p.id = o.plan_id WHERE o.plan_id = ? AND o.session_hash = ? AND p.deleted_at IS NULL",
    ).get(id, sessionHash);
    if (!owner) throw new PlannerError(404, "This template could not be found in your workspace.");
    const row = db.query<VersionRow, [string]>("SELECT * FROM plan_versions WHERE plan_id = ? ORDER BY version DESC LIMIT 1").get(id);
    const plan = row ? proofPlanSchema.parse({
      schemaVersion: 1, title: row.title_snapshot, goal: row.goal_snapshot,
      steps: JSON.parse(row.steps_json), limitations: JSON.parse(row.limitations_json),
    }) : null;
    const messages = db.query<PlannerMessage, [string]>("SELECT role, content FROM planner_messages WHERE plan_id = ? ORDER BY id").all(id);
    return savedPlanSchema.parse({
      id, revision: owner.revision, version: row?.version ?? null, versionId: row?.id ?? null,
      status: row?.status ?? "draft", contractHash: plan ? hashContract(plan) : null,
      approvedAt: row?.approved_at ?? null, plan, messages,
    });
  }

  function addVersion(id: string, version: number, input: ProofPlan) {
    const plan = proofPlanSchema.parse(input);
    db.query(`INSERT INTO plan_versions
      (id, plan_id, version, status, title_snapshot, goal_snapshot, steps_json, limitations_json)
      VALUES (?, ?, ?, 'draft', ?, ?, ?, ?)`).run(
      crypto.randomUUID(), id, version, plan.title, plan.goal, JSON.stringify(plan.steps), JSON.stringify(plan.limitations),
    );
    db.query("UPDATE plans SET title = ? WHERE id = ?").run(plan.title, id);
  }

  function create(sessionHash: string, template: "blank" | "packproof") {
    const count = db.query<{ count: number }, [string]>("SELECT count(*) AS count FROM planner_owners o JOIN plans p ON p.id = o.plan_id WHERE o.session_hash = ? AND p.deleted_at IS NULL").get(sessionHash)?.count ?? 0;
    if (count >= 50) throw new PlannerError(429, "Your workspace has reached its limit of 50 templates.");
    const id = crypto.randomUUID();
    db.transaction(() => {
      db.query("INSERT INTO plans (id, title) VALUES (?, ?)").run(id, template === "packproof" ? "PackProof" : "Untitled template");
      db.query("INSERT INTO planner_owners (plan_id, session_hash) VALUES (?, ?)").run(id, sessionHash);
      if (template === "packproof") addVersion(id, 1, packproofTemplate);
    })();
    return read(id, sessionHash);
  }

  function list(sessionHash: string) {
    return db.query<{ id: string; title: string; status: "draft" | "approved" }, [string]>(`
      SELECT p.id, p.title, COALESCE(v.status, 'draft') AS status FROM plans p
      JOIN planner_owners o ON o.plan_id = p.id
      LEFT JOIN plan_versions v ON v.plan_id = p.id AND v.version = (SELECT max(version) FROM plan_versions WHERE plan_id = p.id)
      WHERE o.session_hash = ? AND p.deleted_at IS NULL ORDER BY p.created_at DESC, p.rowid DESC`).all(sessionHash);
  }

  function saveReply(id: string, sessionHash: string, revision: number, message: string, reply: PlannerReply) {
    db.transaction(() => {
      const current = read(id, sessionHash);
      if (current.revision !== revision) throw new PlannerError(409, "This template changed. Reload it before sending again.");
      if (current.status === "approved") throw new PlannerError(409, "This version is approved. Create a new draft to make changes.");
      if (reply.plan) addVersion(id, (current.version ?? 0) + 1, reply.plan);
      const insert = db.query("INSERT INTO planner_messages (plan_id, role, content) VALUES (?, ?, ?)");
      insert.run(id, "user", message);
      insert.run(id, "assistant", reply.reply);
      db.query("UPDATE planner_owners SET revision = revision + 1 WHERE plan_id = ?").run(id);
    })();
    return read(id, sessionHash);
  }

  function approve(id: string, sessionHash: string, revision: number, contractHash: string) {
    db.transaction(() => {
      const current = read(id, sessionHash);
      if (current.revision !== revision || current.contractHash !== contractHash) {
        throw new PlannerError(409, "The draft changed. Review the latest version before approving.");
      }
      if (!current.plan || !current.versionId) throw new PlannerError(400, "Create a proof plan before approving it.");
      if (current.status === "approved") return;
      db.query("UPDATE plan_versions SET status = 'approved', contract_hash = ?, approved_at = ? WHERE id = ?")
        .run(hashContract(current.plan), new Date().toISOString(), current.versionId);
      db.query("UPDATE planner_owners SET revision = revision + 1 WHERE plan_id = ?").run(id);
    })();
    return read(id, sessionHash);
  }

  function revise(id: string, sessionHash: string, revision: number) {
    db.transaction(() => {
      const current = read(id, sessionHash);
      if (current.revision !== revision) throw new PlannerError(409, "The template changed. Reload it to continue.");
      if (!current.plan || current.status !== "approved") throw new PlannerError(400, "Only an approved template needs a new draft.");
      addVersion(id, (current.version ?? 0) + 1, current.plan);
      db.query("UPDATE planner_owners SET revision = revision + 1 WHERE plan_id = ?").run(id);
    })();
    return read(id, sessionHash);
  }

  function markDeleted(id: string, sessionHash: string) {
    db.transaction(() => {
      read(id, sessionHash);
      const active = db.query(`SELECT 1 FROM runs r JOIN plan_versions v ON v.id = r.plan_version_id
        WHERE v.plan_id = ? AND r.state NOT IN ('completed', 'failed') LIMIT 1`).get(id);
      if (active) throw new PlannerError(409, "Wait for this plan’s video verification to finish before deleting it.");
      // Hide the plan before asynchronous cleanup so uploads cannot create new runs against it.
      db.query("UPDATE plans SET deleted_at = ? WHERE id = ?").run(new Date().toISOString(), id);
      db.query("UPDATE planner_owners SET revision = revision + 1 WHERE plan_id = ?").run(id);
    })();
  }

  function restoreDeleted(id: string) {
    db.query("UPDATE plans SET deleted_at = NULL WHERE id = ?").run(id);
  }

  function finishDelete(id: string) {
    db.transaction(() => {
      db.query("DELETE FROM planner_messages WHERE plan_id = ?").run(id);
      db.query("DELETE FROM plan_versions WHERE plan_id = ? AND status = 'draft'").run(id);
      // Approved snapshots stay immutable even after the workspace plan and evidence are removed.
      if (!db.query("SELECT 1 FROM plan_versions WHERE plan_id = ? LIMIT 1").get(id)) {
        db.query("DELETE FROM planner_owners WHERE plan_id = ?").run(id);
        db.query("DELETE FROM plans WHERE id = ?").run(id);
      }
    })();
  }

  return { read, create, list, saveReply, approve, revise, markDeleted, restoreDeleted, finishDelete };
}

import type { Database } from "bun:sqlite";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { savedPlanSchema } from "../../shared/planner";
import { runDetailsSchema } from "../../shared/verification";
import { runDiagnosticsSchema } from "../../shared/diagnostics";
import { PACK_DEMO, PACK_DEMO_VIDEOS } from "../../shared/demo";
import type { Config } from "../config";
import { hashContract } from "../engine/contract";
import { runDirectory } from "../verification/storage";
import { DEMO_OWNER } from "./access";
import snapshot from "./pack-order.json";
import flowSnapshot from "./pack-order-flow.json";

export function seedPackDemo(db: Database, config: Config): void {
  const saved = savedPlanSchema.parse(snapshot.saved);
  const recordings = [snapshot, flowSnapshot].map((item, index) => ({
    run: runDetailsSchema.parse(item.run), diagnostics: runDiagnosticsSchema.parse(item.diagnostics), video: PACK_DEMO_VIDEOS[index]!,
  }));
  if (!saved.plan || !saved.versionId || !saved.approvedAt || saved.status !== "approved" || hashContract(saved.plan) !== saved.contractHash
    || saved.id !== PACK_DEMO.planId || recordings.some(({ run, video }) => run.id !== video.runId || run.state !== "completed" || run.approvedVersionId !== PACK_DEMO.versionId
      || run.approvedPlan.contractHash !== saved.contractHash || run.receipt?.contractHash !== saved.contractHash)) throw new Error("Bundled demo integrity check failed.");
  db.transaction(() => {
    db.query("UPDATE demo_feeds SET running = 0 WHERE plan_id = ?").run(PACK_DEMO.planId);
    if (!db.query("SELECT 1 FROM plans WHERE id = ?").get(saved.id)) {
      db.query("INSERT INTO plans (id, title) VALUES (?, ?)").run(saved.id, PACK_DEMO.title);
      db.query(`INSERT INTO plan_versions (id, plan_id, version, status, title_snapshot, goal_snapshot, steps_json, limitations_json, schema_version, contract_json, contract_hash, approved_at)
        VALUES (?, ?, ?, 'approved', ?, ?, ?, ?, ?, ?, ?, ?)`).run(saved.versionId!, saved.id, saved.version!, saved.plan!.title, saved.plan!.goal,
        JSON.stringify(saved.plan!.steps), JSON.stringify(saved.plan!.limitations), saved.plan!.schemaVersion, JSON.stringify(saved.plan), saved.contractHash!, saved.approvedAt!);
    }
    db.query("INSERT OR IGNORE INTO planner_owners (plan_id, session_hash, revision) VALUES (?, ?, ?)").run(saved.id, DEMO_OWNER, saved.revision);
    db.query("UPDATE planner_owners SET session_hash = ? WHERE plan_id = ? AND session_hash != ?").run(DEMO_OWNER, saved.id, DEMO_OWNER);
  })();
  for (const { run, diagnostics, video } of recordings) {
    const directory = runDirectory(config, run.id);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const assets = fileURLToPath(new URL(`../../../assets/demo/pack-order/${run.id === PACK_DEMO.runId ? "" : "flow/"}`, import.meta.url));
    for (const [source, target] of [[video.filename, "source.upload"], ["analysis.mp4", "analysis.mp4"], ["thumbnail.jpg", "thumbnail.jpg"]] as const) {
      copyFileSync(join(assets, source), join(directory, target));
    }
    const artifacts = run.tracks.map((track, index) => {
      const path = join(directory, `track-${index}.json`);
      writeFileSync(path, JSON.stringify({ track, diagnostic: diagnostics.tracking.find(item => item.concept === track.concept) }));
      return { track, path };
    });
    // Only curated, schema-validated evidence ships; no API credentials, upload IDs, or raw model responses.
    if (diagnostics.observation) writeFileSync(join(directory, "muse.json"), JSON.stringify(diagnostics.observation));
    if (diagnostics.verification) writeFileSync(join(directory, "verification.json"), JSON.stringify(diagnostics.verification));
    db.transaction(() => {
      if (!db.query("SELECT 1 FROM runs WHERE id = ?").get(run.id)) {
        db.query(`INSERT INTO runs (id, plan_version_id, state, video_path, normalized_path, video_sha256, duration_ms, created_at, completed_at, media_json, receipt_json, timings_json, warnings_json, activity_json, partial_findings_json)
          VALUES (?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(run.id, run.approvedVersionId, join(directory, "source.upload"), join(directory, "analysis.mp4"),
          run.media!.sha256, run.durationMs!, run.createdAt, run.completedAt!, JSON.stringify(run.media), JSON.stringify(run.receipt), JSON.stringify(run.timings), JSON.stringify(run.warnings), JSON.stringify(run.activity), JSON.stringify(run.partialFindings));
        for (const { track, path } of artifacts) db.query("INSERT INTO track_artifacts (run_id, concept, artifact_path, model_version, outcome) VALUES (?, ?, ?, ?, ?)").run(run.id, track.concept, path, "sam-3.1", "completed");
      }
      // Repair paths on a moved deployment without altering the frozen evidence.
      db.query("UPDATE runs SET video_path = ?, normalized_path = ? WHERE id = ? AND (video_path != ? OR normalized_path != ?)").run(join(directory, "source.upload"), join(directory, "analysis.mp4"), run.id, join(directory, "source.upload"), join(directory, "analysis.mp4"));
      for (const { track, path } of artifacts) db.query("UPDATE track_artifacts SET artifact_path = ? WHERE run_id = ? AND concept = ? AND artifact_path != ?").run(path, run.id, track.concept, path);
    })();
  }
}

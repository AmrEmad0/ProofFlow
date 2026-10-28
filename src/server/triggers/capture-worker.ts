import type { Database } from "bun:sqlite";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { LIMITS } from "../../shared/proof-plan";
import { triggerSettingsSchema } from "../../shared/triggers";
import type { Config } from "../config";
import { runMediaCommand } from "../media/process";
import { PlannerError } from "../planner/store";
import { runDirectory } from "../verification/storage";
import { verificationStore } from "../verification/store";
import type { VerificationWorker } from "../verification/worker";
import { recordingInput } from "./sources";

type Job = { session_id: string; settings_json: string; plan_version_id: string; contract_hash: string; session_hash: string; started_at: string; state: string };
export function createCaptureWorker(db: Database, config: Config, verification: Pick<VerificationWorker, "ready" | "kick">) {
  let pending: Promise<void> | null = null;
  let stopped = false;
  function fail(id: string, message: string) {
    db.transaction(() => {
      db.query("UPDATE trigger_captures SET state = 'failed', error_message = ?, lease_until = NULL WHERE session_id = ?").run(message, id);
      db.query("UPDATE task_sessions SET state = 'cancelled', ended_at = ? WHERE id = ? AND state = 'active'").run(new Date().toISOString(), id);
    })();
  }
  async function tick() {
    if (!verification.ready || !config.modelConfigured) return;
    // A camera interval cannot be recreated after interruption. Never substitute later footage.
    const stale = db.query<{ session_id: string }, [number]>("SELECT session_id FROM trigger_captures WHERE state = 'capturing' AND lease_until < ?").all(Date.now());
    for (const job of stale) {
      fail(job.session_id, "Capture was interrupted. Trigger a new task to record a new clip.");
      await rm(runDirectory(config, job.session_id), { recursive: true, force: true });
    }
    const cancelled = db.query<{ session_id: string }, []>(`SELECT c.session_id FROM trigger_captures c
      JOIN task_sessions s ON s.id = c.session_id WHERE s.state = 'cancelled' AND c.state IN ('queued','captured')`).all();
    for (const job of cancelled) {
      fail(job.session_id, "Task was cancelled before verification.");
      await rm(runDirectory(config, job.session_id), { recursive: true, force: true });
    }
    const job = db.query<Job, []>(`SELECT c.*, s.settings_json, s.plan_version_id, s.contract_hash, s.started_at, o.session_hash
      FROM trigger_captures c JOIN task_sessions s ON s.id = c.session_id JOIN planner_owners o ON o.plan_id = s.plan_id
      JOIN plans p ON p.id = s.plan_id WHERE c.state IN ('queued','captured') AND s.state IN ('active','finished')
      AND s.run_id IS NULL AND p.deleted_at IS NULL ORDER BY s.started_at LIMIT 1`).get();
    if (!job) return;
    const directory = runDirectory(config, job.session_id);
    const path = join(directory, "source.upload");
    try {
      if (job.state === "queued") {
        const claimed = db.query("UPDATE trigger_captures SET state = 'capturing', lease_until = ? WHERE session_id = ? AND state = 'queued'").run(Date.now() + 120_000, job.session_id);
        if (!claimed.changes) return;
        const source = triggerSettingsSchema.parse(JSON.parse(job.settings_json)).recording;
        if (!source) throw new Error("Missing recording source");
        if (source.kind === "camera" && Date.now() - Date.parse(job.started_at) > 5000) throw new Error("Camera capture missed its trigger window");
        const input = await recordingInput(config, source.kind, source.id);
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await runMediaCommand([config.FFMPEG_PATH, "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
          ...(source.kind === "camera" && input.startsWith("rtsp:") ? ["-rtsp_transport", "tcp"] : []),
          "-i", input, "-t", String(source.seconds), "-map", "0:v:0", "-an", "-vf", "scale=1280:720:force_original_aspect_ratio=decrease", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-fs", String(LIMITS.uploadBytes), "-f", "mp4", path], 60_000);
        db.query("UPDATE trigger_captures SET state = 'captured', lease_until = NULL WHERE session_id = ?").run(job.session_id);
      }
      let attached = false;
      db.transaction(() => {
        const current = db.query<{ state: string; run_id: string | null }, [string]>("SELECT state, run_id FROM task_sessions WHERE id = ?").get(job.session_id);
        if (!current || current.state === "cancelled" || current.run_id) return;
        db.query("UPDATE task_sessions SET state = 'finished', ended_at = ? WHERE id = ? AND state = 'active'").run(new Date().toISOString(), job.session_id);
        verificationStore(db).create(job.session_id, job.plan_version_id, job.contract_hash, job.session_hash, path, config.MEDIA_RETENTION_HOURS, job.session_id);
        attached = true;
        db.query("UPDATE trigger_captures SET state = 'done', error_message = NULL WHERE session_id = ?").run(job.session_id);
      })();
      if (!attached && !db.query("SELECT 1 FROM runs WHERE id = ?").get(job.session_id)) {
        fail(job.session_id, "Task was cancelled before verification.");
        await rm(directory, { recursive: true, force: true });
      }
      verification.kick();
    } catch (error) {
      if (error instanceof PlannerError && (error.status === 409 || error.status === 429)) return;
      fail(job.session_id, "Recording failed. Check the selected source and FFmpeg, then trigger a new task.");
      await rm(directory, { recursive: true, force: true });
    }
  }
  function kick() {
    if (stopped || pending) return;
    pending = tick().catch(() => { console.error("Trigger capture worker failed"); }).finally(() => { pending = null; });
  }
  const timer = setInterval(kick, 1000);
  kick();
  return { kick, async stop() { stopped = true; clearInterval(timer); await pending; } };
}

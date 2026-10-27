import type { Database } from "bun:sqlite";
import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { ANALYSIS_FPS, conceptTrackSchema, type ConceptTrack } from "../../shared/verification";
import { trackedConcepts, type ApprovedPlan } from "../../shared/proof-plan";
import { receiptSchema, type RunState } from "../../shared/receipt";
import type { Config } from "../config";
import { createMetaClient, MODELS } from "../meta/client";
import { uploadVideo, deleteVideo } from "../meta/files";
import { observeVideo, observationSchema, VIDEO_PROMPT_VERSION } from "../meta/observe";
import { segmentVideo } from "../meta/sam";
import { normalizeVideo } from "../media/video";
import { VERIFICATION_RULE_VERSION, verifyEvidence } from "../engine/verify";
import { verificationStore, type RunRow } from "./store";
import { runDirectory } from "./storage";

type Segmentation = Pick<Awaited<ReturnType<typeof segmentVideo>>, "boxes" | "rawOutput" | "diagnostics" | "outcome">;
export type VerificationAdapters = {
  upload: (path: string) => Promise<{ id: string }>;
  observe: (fileId: string, plan: ApprovedPlan, durationMs: number) => ReturnType<typeof observeVideo>;
  segment: (fileId: string, concept: string) => Promise<Segmentation>;
  delete: (fileId: string) => Promise<void>;
};

export type VerificationWorker = ReturnType<typeof createVerificationWorker>;
class WorkerLeaseError extends Error {}

export function createVerificationWorker(db: Database, config: Config, adapters?: VerificationAdapters) {
  const store = verificationStore(db);
  const owner = crypto.randomUUID();
  let accepting = false;
  let work: Promise<void> | null = null;
  let ticker: ReturnType<typeof setInterval> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  const models: VerificationAdapters = adapters ?? {
    upload: (path) => uploadVideo(createMetaClient(config), path),
    observe: (file, plan, duration) => observeVideo(createMetaClient(config), file, plan, duration),
    segment: (file, concept) => segmentVideo(createMetaClient(config), file, concept),
    delete: (file) => deleteVideo(createMetaClient(config), file),
  };

  function hasLease() {
    return Boolean(db.query("SELECT 1 FROM verification_worker WHERE id = 1 AND owner = ? AND lease_until > ?").get(owner, Date.now()));
  }

  async function remoteCleanup(run: RunRow): Promise<boolean> {
    if (!run.remote_file_id) return true;
    try {
      await models.delete(run.remote_file_id);
      db.query("UPDATE runs SET remote_file_id = NULL WHERE id = ?").run(run.id);
      return true;
    } catch (error) {
      if (error && typeof error === "object" && "status" in error && error.status === 404) {
        db.query("UPDATE runs SET remote_file_id = NULL WHERE id = ?").run(run.id);
        return true;
      }
      console.warn("Remote video cleanup deferred", { runId: run.id });
      return false;
    }
  }

  async function removeRun(run: RunRow) {
    if (!await remoteCleanup(run)) return false;
    await rm(runDirectory(config, run.id), { recursive: true, force: true });
    db.transaction(() => {
      db.query("DELETE FROM findings WHERE run_id = ?").run(run.id);
      db.query("DELETE FROM track_artifacts WHERE run_id = ?").run(run.id);
      db.query("DELETE FROM runs WHERE id = ?").run(run.id);
    })();
    return true;
  }

  async function cleanup() {
    const pending = db.query<RunRow, []>("SELECT * FROM runs WHERE state IN ('completed', 'failed') AND remote_file_id IS NOT NULL").all();
    for (const run of pending) await remoteCleanup(run);
    const expired = db.query<RunRow, []>("SELECT * FROM runs WHERE expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AND state IN ('completed', 'failed')").all();
    for (const run of expired) await removeRun(run);
    const entries = await readdir(join(config.STORAGE_PATH, "runs"), { withFileTypes: true }).catch((error: unknown) => {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
      throw error;
    });
    for (const entry of entries) {
      if (!entry.isDirectory() || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(entry.name)) continue;
      if (db.query("SELECT 1 FROM runs WHERE id = ?").get(entry.name)) continue;
      const directory = runDirectory(config, entry.name);
      if (Date.now() - (await stat(directory)).mtimeMs > config.MEDIA_RETENTION_HOURS * 3_600_000) await rm(directory, { recursive: true, force: true });
    }
  }

  async function processRun(run: RunRow) {
    const timings: Record<string, number> = {};
    const warnings: string[] = [];
    let phase: RunState = "preprocessing";
    const totalStarted = performance.now();
    const directory = runDirectory(config, run.id);
    function state(next: RunState) {
      if (!hasLease()) throw new Error("Verification worker lease lost.");
      phase = next;
      const updated = db.query("UPDATE runs SET state = ?, timings_json = ? WHERE id = ? AND state NOT IN ('completed', 'failed')")
        .run(next, JSON.stringify(timings), run.id);
      if (updated.changes !== 1) throw new Error("Verification run is no longer active.");
    }
    async function measure<T>(name: string, operation: () => Promise<T>): Promise<T> {
      const started = performance.now();
      try { return await operation(); } finally { timings[name] = Math.round(performance.now() - started); }
    }
    try {
      const plan = store.approved(run.plan_version_id);
      const normalizedPath = join(directory, "analysis.mp4");
      const normalized = await measure("preprocessing", () => normalizeVideo(run.video_path, normalizedPath, config));
      if (!normalized.frameCount || normalized.frameCount < 2 || normalized.frameRate !== "6/1") throw new Error("Invalid normalized frame timing.");
      const media = { width: normalized.width, height: normalized.height, frameCount: normalized.frameCount,
        fps: ANALYSIS_FPS, sha256: new Bun.CryptoHasher("sha256").update(await Bun.file(normalizedPath).arrayBuffer()).digest("hex") };
      db.query("UPDATE runs SET normalized_path = ?, duration_ms = ?, video_sha256 = ?, media_json = ? WHERE id = ?")
        .run(normalizedPath, normalized.durationMs, media.sha256, JSON.stringify(media), run.id);
      state("uploading");
      const uploaded = await measure("upload", () => models.upload(normalizedPath));
      db.query("UPDATE runs SET remote_file_id = ? WHERE id = ?").run(uploaded.id, run.id);
      state("analyzing");
      const tracks: ConceptTrack[] = [];
      const concepts = trackedConcepts(plan);
      async function trackConcept(concept: string, index: number) {
        let track: ConceptTrack;
        let raw: unknown = null;
        try {
          const result = await measure(`sam_${index + 1}`, () => models.segment(uploaded.id, concept));
          raw = result;
          if (result.outcome.status !== "completed" || result.diagnostics.length > 0) throw new Error("Incomplete or ambiguous SAM output.");
          // Parser boxes are half-open source pixels. Source frame N maps to N/6 seconds in our CFR copy.
          const dimensions = [...result.rawOutput.matchAll(/;w=(\d+);h=(\d+)/g)];
          if (result.boxes.length > 0 && (dimensions.length === 0 || dimensions.some((match) => Number(match[1]) !== media.width || Number(match[2]) !== media.height))) throw new Error("SAM coordinate dimensions do not match the analysis copy.");
          track = conceptTrackSchema.parse({ concept, outcome: "completed", boxes: result.boxes.filter((box) => box.confidence === undefined || box.confidence >= 0.5).map((box) => {
            if (box.frame?.frameIndex === undefined || box.frame.frameIndex >= media.frameCount) throw new Error("SAM frame outside the analysis copy.");
            return { objectId: box.objectId, frameIndex: box.frame.frameIndex, left: box.left / media.width,
              top: box.top / media.height, right: box.right / media.width, bottom: box.bottom / media.height };
          }) });
        } catch {
          track = { concept, outcome: "failed", boxes: [] };
          warnings.push(`Tracking for “${concept}” could not be used. Dependent findings remain uncertain.`);
        }
        const path = join(directory, `track-${index}.json`);
        await Bun.write(path, JSON.stringify({ track, raw }), { mode: 0o600 });
        db.query("INSERT INTO track_artifacts (run_id, concept, artifact_path, model_version, outcome) VALUES (?, ?, ?, ?, ?)")
          .run(run.id, concept, path, MODELS.sam, track.outcome);
        tracks.push(track);
      }
      // Wait for both branches even when Muse fails, so no SAM request outlives remote-file cleanup.
      const results = await Promise.allSettled([
        measure("muse", () => models.observe(uploaded.id, plan, normalized.durationMs)),
        (async () => { for (let index = 0; index < concepts.length; index += 2) {
          const batch = await Promise.allSettled([trackConcept(concepts[index]!, index), ...(concepts[index + 1] ? [trackConcept(concepts[index + 1]!, index + 1)] : [])]);
          if (batch.some((result) => result.status === "rejected")) throw new Error("Track artifacts could not be saved.");
        } })(),
      ]);
      const observed = results[0];
      if (observed.status === "rejected" || results[1].status === "rejected") throw new Error("Video evidence analysis failed.");
      const observation = observationSchema.parse(observed.value);
      await Bun.write(join(directory, "muse.json"), JSON.stringify(observation), { mode: 0o600 });
      state("verifying");
      const started = performance.now();
      const findings = verifyEvidence(plan, observation, tracks, media.frameCount);
      timings.verification = Math.round(performance.now() - started);
      const receipt = receiptSchema.parse({ runId: run.id, approvedVersionId: plan.approvedVersionId, contractHash: plan.contractHash, findings,
        provenance: { museModel: MODELS.muse, samModel: MODELS.sam, promptVersion: VIDEO_PROMPT_VERSION,
          verificationRuleVersion: VERIFICATION_RULE_VERSION, createdAt: new Date().toISOString() } });
      timings.total = Math.round(performance.now() - totalStarted);
      if (!hasLease()) throw new Error("Verification worker lease lost.");
      db.transaction(() => {
        for (const finding of findings) db.query("INSERT INTO findings (run_id, step_id, status, start_ms, end_ms, explanation, evidence_json) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(run.id, finding.stepId, finding.status, finding.startMs, finding.endMs, finding.explanation, JSON.stringify(finding.evidence));
        db.query("UPDATE runs SET state = 'completed', completed_at = ?, receipt_json = ?, timings_json = ?, warnings_json = ? WHERE id = ?")
          .run(new Date().toISOString(), JSON.stringify(receipt), JSON.stringify(timings), JSON.stringify(warnings), run.id);
      })();
    } catch {
      timings.total = Math.round(performance.now() - totalStarted);
      if (hasLease()) db.query("UPDATE runs SET state = 'failed', error_message = ?, completed_at = ?, timings_json = ?, warnings_json = ? WHERE id = ? AND state != 'completed'")
        .run(phase === "preprocessing" ? "The recording could not be read or normalized. Use a readable MP4, MOV, or WebM up to 20 seconds and 25 MB."
          : `Video ${phase} failed. No verdict was produced. Check Meta model access and try a new run.`, new Date().toISOString(), JSON.stringify(timings), JSON.stringify(warnings), run.id);
      console.warn("Video verification failed", { runId: run.id, phase });
    } finally {
      const latest = db.query<RunRow, [string]>("SELECT * FROM runs WHERE id = ?").get(run.id);
      if (latest) await remoteCleanup(latest);
      console.info("Video verification finished", { runId: run.id, timings });
    }
  }

  async function drain() {
    db.query("UPDATE runs SET state = 'failed', error_message = 'This queued recording expired before processing.', completed_at = ? WHERE state = 'queued' AND expires_at <= ?")
      .run(new Date().toISOString(), new Date().toISOString());
    while (accepting && hasLease()) {
      const queued = db.query<RunRow, []>("SELECT * FROM runs WHERE state = 'queued' ORDER BY created_at, rowid LIMIT 1").get();
      if (!queued) break;
      db.query("UPDATE runs SET state = 'preprocessing' WHERE id = ? AND state = 'queued'").run(queued.id);
      await processRun(queued);
    }
    await cleanup();
  }

  function kick() {
    if (!accepting || work) return;
    work = drain().catch(() => { console.error("Verification worker encountered a storage error"); }).finally(() => { work = null; });
  }

  function start() {
    if (accepting) return;
    const acquired = db.query(`INSERT INTO verification_worker (id, owner, lease_until) VALUES (1, ?, ?)
      ON CONFLICT (id) DO UPDATE SET owner = excluded.owner, lease_until = excluded.lease_until WHERE verification_worker.lease_until < ?`)
      .run(owner, Date.now() + 30_000, Date.now());
    if (acquired.changes !== 1) throw new WorkerLeaseError("Another verification worker holds the database lease.");
    db.query("UPDATE runs SET state = 'failed', error_message = 'Processing was interrupted by a server restart. Upload again; no verdict was produced.', completed_at = ? WHERE state NOT IN ('queued', 'completed', 'failed')")
      .run(new Date().toISOString());
    accepting = true;
    heartbeat = setInterval(() => { db.query("UPDATE verification_worker SET lease_until = ? WHERE id = 1 AND owner = ?").run(Date.now() + 30_000, owner); }, 5000);
    ticker = setInterval(kick, 10_000);
    heartbeat.unref(); ticker.unref();
    kick();
  }

  async function stop() {
    accepting = false;
    if (ticker) clearInterval(ticker);
    await work;
    if (heartbeat) clearInterval(heartbeat);
    db.query("DELETE FROM verification_worker WHERE id = 1 AND owner = ?").run(owner);
  }

  async function startWhenAvailable(timeoutMs = 35_000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try { start(); return; } catch (error) {
        if (!(error instanceof WorkerLeaseError) || Date.now() >= deadline) throw error;
        // Bun watch may restart the process before its previous lease has expired.
        await Bun.sleep(Math.min(250, deadline - Date.now()));
      }
    }
  }

  return { start, startWhenAvailable, kick, stop, idle: async () => { await work; }, removeRun,
    get ready() { return accepting && hasLease(); } };
}

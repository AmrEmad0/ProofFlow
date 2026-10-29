import type { Database } from "bun:sqlite";
import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { ANALYSIS_FPS, conceptTrackSchema, type ConceptTrack, type VerificationActivity } from "../../shared/verification";
import type { TrackingDiagnostic } from "../../shared/diagnostics";
import { LIMITS, trackedConcepts, type ApprovedPlan } from "../../shared/proof-plan";
import { receiptSchema, type RunState } from "../../shared/receipt";
import type { Config } from "../config";
import { createMetaClient, MODELS } from "../meta/client";
import { uploadVideo, deleteVideo } from "../meta/files";
import { observeVideo, observationSchema, VIDEO_PROMPT_VERSION, type ObservationContext, type ModelUsage } from "../meta/observe";
import { followUpQuestions, mergeFollowUp } from "../engine/follow-up";
import { createFollowUpFrames } from "../media/follow-up";
import { segmentVideo } from "../meta/sam";
import { normalizeVideo } from "../media/video";
import { createVideoThumbnail } from "../media/thumbnail";
import { VERIFICATION_RULE_VERSION, evaluateEvidence } from "../engine/verify";
import { verificationStore, type RunRow } from "./store";
import { runDirectory } from "./storage";

type Segmentation = { usage?: ModelUsage } & Pick<Awaited<ReturnType<typeof segmentVideo>>, "boxes" | "rawOutput" | "diagnostics" | "outcome">;
export type VerificationAdapters = {
  upload: (path: string) => Promise<{ id: string }>;
  observe: (fileId: string, plan: ApprovedPlan, durationMs: number) => ReturnType<typeof observeVideo>;
  followUp?: (fileId: string, plan: ApprovedPlan, durationMs: number, context: ObservationContext) => ReturnType<typeof observeVideo>;
  segment: (fileId: string, concept: string) => Promise<Segmentation>;
  delete: (fileId: string) => Promise<void>;
};

export type VerificationWorker = ReturnType<typeof createVerificationWorker>;
class WorkerLeaseError extends Error {}

const TEMPORARY_FILE_MAX_AGE_MS = 24 * 3_600_000;

export function createVerificationWorker(db: Database, config: Config, adapters?: VerificationAdapters) {
  const store = verificationStore(db);
  const owner = crypto.randomUUID();
  let accepting = false;
  let work: Promise<void> | null = null;
  let ticker: ReturnType<typeof setInterval> | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;
  let recordUsage: ((usage: ModelUsage) => void) | undefined;
  const models: VerificationAdapters = adapters ?? {
    upload: (path) => uploadVideo(createMetaClient(config), path),
    observe: (file, plan, duration) => observeVideo(createMetaClient(config), file, plan, duration, undefined, recordUsage),
    followUp: (file, plan, duration, context) => observeVideo(createMetaClient(config), file, plan, duration, context, recordUsage),
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
    const references = db.query<{ id: string }, [number]>("SELECT id FROM planner_remote_files WHERE cleanup_after <= ?").all(Date.now());
    for (const reference of references) {
      try {
        await models.delete(reference.id);
        db.query("DELETE FROM planner_remote_files WHERE id = ?").run(reference.id);
      } catch (error) {
        if (error && typeof error === "object" && "status" in error && error.status === 404) db.query("DELETE FROM planner_remote_files WHERE id = ?").run(reference.id);
        else console.warn("Reference media cleanup deferred");
      }
    }
    const pending = db.query<RunRow, []>("SELECT * FROM runs WHERE state IN ('completed', 'failed') AND remote_file_id IS NOT NULL").all();
    for (const run of pending) await remoteCleanup(run);
    const referenceRoot = join(config.STORAGE_PATH, "planner-temporary");
    const temporaryReferences = await readdir(referenceRoot, { withFileTypes: true }).catch(() => []);
    for (const entry of temporaryReferences) {
      if (!entry.isDirectory() || !entry.name.startsWith("reference-")) continue;
      const directory = join(referenceRoot, entry.name);
      if (Date.now() - (await stat(directory)).mtimeMs > TEMPORARY_FILE_MAX_AGE_MS) await rm(directory, { recursive: true, force: true });
    }
    const entries = await readdir(join(config.STORAGE_PATH, "runs"), { withFileTypes: true }).catch((error: unknown) => {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return [];
      throw error;
    });
    for (const entry of entries) {
      if (!entry.isDirectory() || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(entry.name)) continue;
      if (db.query("SELECT 1 FROM runs WHERE id = ?").get(entry.name)) continue;
      const directory = runDirectory(config, entry.name);
      if (Date.now() - (await stat(directory)).mtimeMs > TEMPORARY_FILE_MAX_AGE_MS) await rm(directory, { recursive: true, force: true });
    }
  }

  async function processRun(run: RunRow) {
    const timings: Record<string, number> = {};
    const warnings: string[] = [];
    const requests: { model: string; phase: string; latencyMs: number; status: string; usage?: ModelUsage }[] = [];
    let museCalls = 0;
    let samCalls = 0;
    async function request<T>(model: "muse" | "sam", phase: string, operation: () => Promise<T>): Promise<T> {
      if (model === "muse" ? museCalls >= 2 : samCalls >= 4) throw new Error("Per-video model request budget exhausted.");
      if (model === "muse") museCalls++; else samCalls++;
      const entry: typeof requests[number] = { model: MODELS[model], phase, latencyMs: 0, status: "failed" };
      requests.push(entry);
      if (model === "muse") recordUsage = usage => { entry.usage = usage; };
      const started = performance.now();
      try { const result = await measure(phase, operation); entry.status = "completed"; return result; }
      finally { entry.latencyMs = Math.round(performance.now() - started); if (model === "muse") recordUsage = undefined; }
    }
    let phase: RunState = "preprocessing";
    let stage: VerificationActivity["stage"] = "preparing";
    function activity(message: string, kind: VerificationActivity["kind"] = "progress", stepId?: string) {
      if (!hasLease()) throw new Error("Verification worker lease lost.");
      store.addActivity(run.id, { message, kind, stage, ...(stepId ? { stepId } : {}) });
    }
    const totalStarted = performance.now();
    const directory = runDirectory(config, run.id);
    function state(next: RunState) {
      if (!hasLease()) throw new Error("Verification worker lease lost.");
      phase = next;
      stage = next === "analyzing" ? "visual" : next === "verifying" ? "confirming" : "preparing";
      const updated = db.query("UPDATE runs SET state = ?, timings_json = ? WHERE id = ? AND state NOT IN ('completed', 'failed')")
        .run(next, JSON.stringify(timings), run.id);
      if (updated.changes !== 1) throw new Error("Verification run is no longer active.");
    }
    async function measure<T>(name: string, operation: () => Promise<T>): Promise<T> {
      const started = performance.now();
      try { return await operation(); } finally { timings[name] = Math.round(performance.now() - started); }
    }
    try {
      activity("Preparing your video for analysis.");
      const plan = store.approved(run.plan_version_id);
      const normalizedPath = join(directory, "analysis.mp4");
      const normalized = await measure("preprocessing", () => normalizeVideo(run.video_path, normalizedPath, config));
      if (!normalized.frameCount || normalized.frameCount < 2 || normalized.frameRate !== "6/1") throw new Error("Invalid normalized frame timing.");
      const media = { width: normalized.width, height: normalized.height, frameCount: normalized.frameCount,
        fps: ANALYSIS_FPS as typeof ANALYSIS_FPS, sha256: new Bun.CryptoHasher("sha256").update(await Bun.file(normalizedPath).arrayBuffer()).digest("hex") };
      db.query("UPDATE runs SET normalized_path = ?, duration_ms = ?, video_sha256 = ?, media_json = ? WHERE id = ?")
        .run(normalizedPath, normalized.durationMs, media.sha256, JSON.stringify(media), run.id);
      await createVideoThumbnail(normalizedPath, join(directory, "thumbnail.jpg"), config).catch(() => {
        console.warn("Video thumbnail unavailable", { runId: run.id });
      });
      activity("Video prepared. Sending it for analysis.");
      state("uploading");
      const uploaded = await measure("upload", () => models.upload(normalizedPath));
      db.query("UPDATE runs SET remote_file_id = ? WHERE id = ?").run(uploaded.id, run.id);
      state("analyzing");
      activity("Video sent. Looking for the actions in your plan.");
      const tracks: ConceptTrack[] = [];
      const concepts = trackedConcepts(plan);
      async function trackConcept(concept: string, index: number) {
        activity(`Tracking “${concept}” through the video.`);
        let track: ConceptTrack;
        let raw: unknown = null;
        const diagnostic: TrackingDiagnostic = { concept, receivedBoxes: 0, retainedBoxes: 0, lowConfidenceBoxes: 0, confidenceThreshold: 0.5, issue: "model_request" };
        try {
          const descriptions = observation.candidates.flatMap(candidate => [candidate.subject, candidate.target])
            .filter(object => object?.concept.trim().toLowerCase() === concept).map(object => object!.description);
          // Conflicting descriptions must not split a concept into separate object tracks.
          const description = new Set(descriptions).size === 1 ? descriptions[0] : undefined;
          // SAM must retain the approved noun; workflow captions can produce no detections.
          const prompt = description?.trim().toLowerCase().startsWith(concept) ? description : concept;
          const result = await request("sam", `sam_${index + 1}`, () => models.segment(uploaded.id, prompt));
          if (result.usage) {
            const entry = requests.find(entry => entry.phase === `sam_${index + 1}`);
            if (entry) entry.usage = result.usage;
          }
          raw = result;
          diagnostic.receivedBoxes = result.boxes.length;
          diagnostic.lowConfidenceBoxes = result.boxes.filter((box) => box.confidence !== undefined && box.confidence < diagnostic.confidenceThreshold).length;
          diagnostic.issue = result.outcome.status !== "completed" ? "incomplete_output" : result.diagnostics.length > 0 ? "parser_diagnostics" : "invalid_geometry";
          if (result.outcome.status !== "completed" || result.diagnostics.length > 0) throw new Error("Incomplete or ambiguous SAM output.");
          // Parser boxes are half-open source pixels. Source frame N maps to N/6 seconds in our CFR copy.
          const dimensions = [...result.rawOutput.matchAll(/;w=(\d+);h=(\d+)/g)];
          if (result.boxes.length > 0 && (dimensions.length === 0 || dimensions.some((match) => Number(match[1]) !== media.width || Number(match[2]) !== media.height))) throw new Error("SAM coordinate dimensions do not match the analysis copy.");
          track = conceptTrackSchema.parse({ concept, outcome: "completed", boxes: result.boxes.filter((box) => box.confidence === undefined || box.confidence >= diagnostic.confidenceThreshold).map((box) => {
            if (box.frame?.frameIndex === undefined || box.frame.frameIndex >= media.frameCount) throw new Error("SAM frame outside the analysis copy.");
            return { objectId: box.objectId, frameIndex: box.frame.frameIndex, ...(box.confidence === undefined ? {} : { confidence: box.confidence }), left: box.left / media.width,
              top: box.top / media.height, right: box.right / media.width, bottom: box.bottom / media.height };
          }) });
          diagnostic.retainedBoxes = track.boxes.length;
          diagnostic.issue = null;
        } catch {
          track = { concept, outcome: "failed", boxes: [] };
          warnings.push(`Tracking for “${concept}” could not be used. Dependent findings remain uncertain.`);
        }
        const path = join(directory, `track-${index}.json`);
        await Bun.write(path, JSON.stringify({ track, diagnostic, raw }), { mode: 0o600 });
        db.query("INSERT INTO track_artifacts (run_id, concept, artifact_path, model_version, outcome) VALUES (?, ?, ?, ?, ?)")
          .run(run.id, concept, path, MODELS.sam, track.outcome);
        tracks.push(track);
        if (!hasLease()) throw new Error("Verification worker lease lost.");
        const readySteps = new Set(plan.steps.filter(step => [step.subjectConcept, step.targetConcept].filter(Boolean)
          .every(concept => tracks.some(item => item.concept === concept!.trim().toLowerCase()))).map(step => step.id));
        const partial = evaluateEvidence(plan, observation, tracks, media.frameCount).findings.filter(finding => readySteps.has(finding.stepId));
        db.query("UPDATE runs SET partial_findings_json = ? WHERE id = ? AND state NOT IN ('completed', 'failed')")
          .run(JSON.stringify(partial), run.id);
        activity(track.outcome === "failed" ? `Tracking for “${concept}” could not be used. Dependent checks may remain uncertain.`
          : track.boxes.length ? `Tracking ready for “${concept}”. Checking it against the visual evidence.`
          : `No usable track returned for “${concept}”. This alone does not mean an action was missed.`,
          track.outcome === "failed" || !track.boxes.length ? "warning" : "progress");
      }
      let observation = observationSchema.parse(await request("muse", "muse", () => models.observe(uploaded.id, plan, normalized.durationMs)));
      stage = "tracking";
      activity("Visual analysis returned. These proposals still need evidence checks.");
      for (const step of plan.steps) {
        const proposed = observation.candidates.some(candidate => candidate.stepId === step.id);
        activity(proposed ? `Visual proposal received for “${step.label}”. Checking object tracks before a verdict.`
          : `No visual proposal returned for “${step.label}”. The outcome is still unresolved.`, "progress", step.id);
      }
      await Bun.write(join(directory, "muse-initial.json"), JSON.stringify(observation), { mode: 0o600 });
      const tracking = await Promise.allSettled(concepts.map(trackConcept));
      if (tracking.some(result => result.status === "rejected")) throw new Error("Track artifacts could not be saved.");
      state("verifying");
      activity("Object tracking finished. Evaluating the evidence for each check.");
      const started = performance.now();
      let evaluated = evaluateEvidence(plan, observation, tracks, media.frameCount);
      const questions = followUpQuestions(plan, observation, tracks, evaluated.diagnostics);
      if (questions.length && models.followUp) {
        try {
          activity("Some evidence needs a closer look. Preparing a follow-up check.");
          const frames = await createFollowUpFrames(normalizedPath, directory, media, tracks, observation, questions, config);
          if (frames.length) {
            activity("Reviewing selected video frames to resolve unclear evidence.");
            const second = observationSchema.parse(await request("muse", "muse_follow_up", () => models.followUp!(uploaded.id, plan, normalized.durationMs, { initial: observation, questions, frames })));
            await Bun.write(join(directory, "muse-follow-up.json"), JSON.stringify(second), { mode: 0o600 });
            const merged = mergeFollowUp(observation, second, new Set(questions.map(question => question.stepId)));
            const reevaluated = evaluateEvidence(plan, merged, tracks, media.frameCount);
            observation = merged;
            evaluated = reevaluated;
            activity("Follow-up analysis returned. Rechecking the grounded evidence.");
          }
        } catch {
          activity("The follow-up was unavailable. Unresolved findings retain their uncertainty.", "warning");
          warnings.push("The grounded follow-up was unavailable. Unresolved findings retain their initial uncertainty.");
        }
      }
      await Bun.write(join(directory, "muse.json"), JSON.stringify(observation), { mode: 0o600 });
      const { findings, diagnostics } = evaluated;
      await Bun.write(join(directory, "verification.json"), JSON.stringify(diagnostics), { mode: 0o600 });
      timings.verification = Math.round(performance.now() - started);
      const receipt = receiptSchema.parse({ runId: run.id, approvedVersionId: plan.approvedVersionId, contractHash: plan.contractHash, findings,
        provenance: { museModel: MODELS.muse, samModel: MODELS.sam, promptVersion: VIDEO_PROMPT_VERSION,
          verificationRuleVersion: VERIFICATION_RULE_VERSION, createdAt: new Date().toISOString() } });
      timings.total = Math.round(performance.now() - totalStarted);
      if (!hasLease()) throw new Error("Verification worker lease lost.");
      activity("Evidence checks finished. Preparing your findings and video links.");
      db.transaction(() => {
        for (const finding of findings) db.query("INSERT INTO findings (run_id, step_id, status, start_ms, end_ms, explanation, evidence_json) VALUES (?, ?, ?, ?, ?, ?, ?)")
          .run(run.id, finding.stepId, finding.status, finding.startMs, finding.endMs, finding.explanation, JSON.stringify(finding.evidence));
        db.query("UPDATE runs SET state = 'completed', completed_at = ?, receipt_json = ?, timings_json = ?, warnings_json = ? WHERE id = ?")
          .run(new Date().toISOString(), JSON.stringify(receipt), JSON.stringify(timings), JSON.stringify(warnings), run.id);
      })();
    } catch {
      timings.total = Math.round(performance.now() - totalStarted);
      if (hasLease()) db.query("UPDATE runs SET state = 'failed', error_message = ?, completed_at = ?, timings_json = ?, warnings_json = ? WHERE id = ? AND state != 'completed'")
        .run(phase === "preprocessing" ? `The recording could not be read or normalized. Use a readable MP4, MOV, or WebM up to ${LIMITS.durationMs / 1000} seconds and ${LIMITS.uploadBytes / 1024 / 1024} MB.`
          : `Video ${phase} failed. No verdict was produced. Check Meta model access and try a new run.`, new Date().toISOString(), JSON.stringify(timings), JSON.stringify(warnings), run.id);
      console.warn("Video verification failed", { runId: run.id, phase });
    } finally {
      await Bun.write(join(directory, "model-requests.json"), JSON.stringify({ museCalls, samCalls, transportRetries: 0, requests }), { mode: 0o600 }).catch(() => {
        console.warn("Model request diagnostics unavailable", { runId: run.id });
      });
      const latest = db.query<RunRow, [string]>("SELECT * FROM runs WHERE id = ?").get(run.id);
      if (latest) await remoteCleanup(latest);
      console.info("Video verification finished", { runId: run.id, timings });
    }
  }

  async function drain() {
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

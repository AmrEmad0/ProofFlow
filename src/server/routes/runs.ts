import type { Database } from "bun:sqlite";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { Elysia, t } from "elysia";
import { evidenceChatRequestSchema } from "../../shared/evidence-chat";
import { createMetaClient } from "../meta/client";
import { evidenceChatEvents } from "../verification/chat-stream";
import { explainEvidence } from "../verification/chat";
import { conceptTrackSchema } from "../../shared/verification";
import { LIMITS } from "../../shared/proof-plan";
import type { Config } from "../config";
import { requireWorkspaceOrigin, sessionHash } from "../http/session";
import { PlannerError } from "../planner/store";
import { runDirectory } from "../verification/storage";
import { verificationStore } from "../verification/store";
import type { VerificationWorker } from "../verification/worker";
import { readRunDiagnostics } from "../verification/diagnostics";
import { createVideoThumbnail } from "../media/thumbnail";
import { createAnnotatedVideo } from "../media/annotated-video";

const idParams = t.Object({ id: t.String({ format: "uuid" }) });

export function videoResponse(file: ReturnType<typeof Bun.file>, range: string | null): Response {
  const headers = new Headers({ "content-type": "video/mp4", "accept-ranges": "bytes", "cache-control": "no-store",
    "x-content-type-options": "nosniff", "cross-origin-resource-policy": "same-origin" });
  if (!range) return new Response(file, { headers });
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  const invalid = () => new Response(null, { status: 416, headers: { ...Object.fromEntries(headers), "content-range": `bytes */${file.size}` } });
  if (!match || (!match[1] && !match[2])) return invalid();
  const start = match[1] ? Number(match[1]) : Math.max(0, file.size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(file.size - 1, Number(match[2])) : file.size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= file.size || (!match[1] && Number(match[2]) === 0)) return invalid();
  headers.set("content-range", `bytes ${start}-${end}/${file.size}`);
  headers.set("content-length", String(end - start + 1));
  return new Response(file.slice(start, end + 1), { status: 206, headers });
}

export function runRoutes(db: Database, config: Config, worker?: VerificationWorker) {
  const store = verificationStore(db);
  const receiving = new Set<string>();
  const chatting = new Set<string>();
  const recentChats = new Map<string, number>();
  const thumbnails = new Map<string, Promise<void>>();
  const videoExports = new Map<string, Promise<void>>();
  return new Elysia()
    .onBeforeHandle(({ request, set }) => {
      set.headers["cache-control"] = "no-store";
      if (request.method !== "GET" && request.method !== "HEAD") requireWorkspaceOrigin(request, config);
    })
    .get("/api/verification/status", () => ({ available: Boolean(worker?.ready && config.modelConfigured) }))
    .get("/api/runs", ({ query, request }) => "planId" in query ? store.listForPlan(query.planId, sessionHash(request)) : store.list(query.approvedVersionId, sessionHash(request)), {
      query: t.Union([t.Object({ planId: t.String({ format: "uuid" }) }), t.Object({ approvedVersionId: t.String({ format: "uuid" }) })]),
    })
    .post("/api/runs", async ({ body, request, set }) => {
      const hash = sessionHash(request);
      const approved = store.approved(body.approvedVersionId, hash);
      if (approved.contractHash !== body.contractHash) throw new PlannerError(409, "The approved plan does not match the version you reviewed.");
      if (!worker?.ready || !config.modelConfigured) throw new PlannerError(503, "Video verification is not ready. Check the server worker and Meta API configuration.");
      if (body.consent !== "true") throw new PlannerError(400, "Consent to send this recording to Meta is required.");
      if (!body.video.size || body.video.size > LIMITS.uploadBytes) throw new PlannerError(413, "Choose a nonempty video up to 25 MB.");
      if (receiving.has(hash) || receiving.size >= 2) throw new PlannerError(429, "Another upload is being received. Please wait.");
      receiving.add(hash);
      const id = crypto.randomUUID();
      const directory = runDirectory(config, id);
      let saved = false;
      try {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        const path = join(directory, "source.upload");
        await Bun.write(path, body.video, { mode: 0o600 });
        const run = store.create(id, body.approvedVersionId, body.contractHash, hash, path, body.taskSessionId);
        saved = true;
        set.status = 202;
        worker.kick();
        return run;
      } finally {
        receiving.delete(hash);
        if (!saved) await rm(directory, { recursive: true, force: true });
      }
    }, { body: t.Object({
      approvedVersionId: t.String({ format: "uuid" }), contractHash: t.String({ pattern: "^[a-f0-9]{64}$" }),
      consent: t.Literal("true"), video: t.File({ minSize: 1, maxSize: LIMITS.uploadBytes }),
      taskSessionId: t.Optional(t.String({ format: "uuid" })),
    }, { additionalProperties: false }) })
    .get("/api/runs/:id", async ({ params, request }) => {
      const details = store.details(params.id, sessionHash(request));
      {
        const artifacts = db.query<{ artifact_path: string }, [string]>("SELECT artifact_path FROM track_artifacts WHERE run_id = ? ORDER BY concept").all(params.id);
        details.tracks = await Promise.all(artifacts.map(async ({ artifact_path }) => {
          const value: unknown = await Bun.file(artifact_path).json();
          if (!value || typeof value !== "object" || !("track" in value)) throw new Error("Tracking artifact is unavailable.");
          return conceptTrackSchema.parse(value.track);
        }));
      }
      return details;
    }, { params: idParams })
    .post("/api/runs/:id/messages", async ({ params, request, body, query, set }) => {
      const hash = sessionHash(request);
      const details = store.details(params.id, hash);
      if (!config.modelConfigured) throw new PlannerError(503, "The evidence assistant is unavailable right now.");
      if (chatting.has(hash) || chatting.size >= 2 || Date.now() - (recentChats.get(hash) ?? 0) < 5000) throw new PlannerError(429, "Please wait before asking another evidence question.");
      for (const [key, time] of recentChats) if (Date.now() - time >= 5000) recentChats.delete(key);
      chatting.add(hash);
      recentChats.set(hash, Date.now());
      const complete = async (onReplyText?: (text: string) => void, signal = request.signal) => {
        const started = performance.now();
        let outcome = "failed";
        try {
          const result = await explainEvidence(createMetaClient(config), details, body.messages, signal, onReplyText);
          signal.throwIfAborted();
          store.row(params.id, hash);
          outcome = "completed";
          return result;
        } catch (error) {
          if (error instanceof PlannerError) throw error;
          throw new PlannerError(502, "The evidence explanation could not be completed. Please try again.");
        } finally {
          chatting.delete(hash);
          console.info("Evidence chat request", { runId: params.id, outcome, elapsedMs: Math.round(performance.now() - started) });
        }
      };
      if (query.stream === "true") {
        set.headers["x-accel-buffering"] = "no";
        return evidenceChatEvents(complete, request.signal);
      }
      return complete();
    }, { params: idParams, query: t.Object({ stream: t.Optional(t.Literal("true")) }), body: evidenceChatRequestSchema })
    .get("/api/runs/:id/diagnostics", async ({ params, request }) => {
      const details = store.details(params.id, sessionHash(request));
      const artifacts = db.query<{ artifact_path: string }, [string]>("SELECT artifact_path FROM track_artifacts WHERE run_id = ? ORDER BY concept").all(params.id);
      return readRunDiagnostics(runDirectory(config, params.id), details, artifacts.map((artifact) => artifact.artifact_path));
    }, { params: idParams })
    .get("/api/runs/:id/video", async ({ params, request, query }) => {
      const hash = sessionHash(request);
      const run = store.row(params.id, hash);
      if (query.download && run.state !== "completed") throw new PlannerError(409, "Wait for verification to finish before downloading the final video.");
      if (!run.normalized_path || !await Bun.file(run.normalized_path).exists()) throw new PlannerError(404, "The analysis video is not available yet.");
      let path = run.normalized_path;
      if (query.download && query.variant !== "analysis") {
        path = join(runDirectory(config, params.id), "annotated-v1.mp4");
        if (!await Bun.file(path).exists()) {
          let pending = videoExports.get(run.id);
          if (!pending) {
            if (videoExports.size >= 2) throw new PlannerError(429, "Other video downloads are being prepared. Please try again shortly.");
            const media = store.details(run.id, hash).media;
            if (!media) throw new PlannerError(409, "The analysis video is not ready to export.");
            const artifacts = db.query<{ artifact_path: string }, [string]>("SELECT artifact_path FROM track_artifacts WHERE run_id = ? ORDER BY concept").all(run.id);
            const output = path;
            pending = (async () => {
              const tracks = await Promise.all(artifacts.map(async ({ artifact_path }) => conceptTrackSchema.parse((await Bun.file(artifact_path).json()).track)));
              await createAnnotatedVideo(run.normalized_path!, output, media, tracks, config);
            })().catch(() => { throw new PlannerError(502, "The video with SAM boxes could not be prepared. Check FFmpeg subtitles support and try again."); })
              .finally(() => { videoExports.delete(run.id); });
            videoExports.set(run.id, pending);
          }
          await pending;
        }
        store.row(params.id, hash);
      }
      const response = videoResponse(Bun.file(path), request.headers.get("range"));
      if (query.download && response.ok) response.headers.set("content-disposition", `attachment; filename="proofflow-${run.id}-${query.variant === "analysis" ? "analysis" : "tracked"}.mp4"`);
      return response;
    }, { params: idParams, query: t.Object({ download: t.Optional(t.Literal("true")), variant: t.Optional(t.Union([t.Literal("analysis"), t.Literal("tracked")])) }) })
    .get("/api/runs/:id/thumbnail", async ({ params, request }) => {
      const run = store.row(params.id, sessionHash(request));
      const path = join(runDirectory(config, params.id), "thumbnail.jpg");
      if (!await Bun.file(path).exists()) {
        if (!run.normalized_path || !await Bun.file(run.normalized_path).exists()) throw new PlannerError(404, "The video thumbnail is not available yet.");
        let pending = thumbnails.get(run.id);
        if (!pending) {
          pending = createVideoThumbnail(run.normalized_path, path, config).finally(() => { thumbnails.delete(run.id); });
          thumbnails.set(run.id, pending);
        }
        await pending;
      }
      store.row(params.id, sessionHash(request));
      return new Response(Bun.file(path), { headers: { "content-type": "image/jpeg", "cache-control": "no-store",
        "x-content-type-options": "nosniff", "cross-origin-resource-policy": "same-origin" } });
    }, { params: idParams })
    .delete("/api/runs/:id", async ({ params, request }) => {
      const run = store.row(params.id, sessionHash(request));
      if (run.state !== "completed" && run.state !== "failed") throw new PlannerError(409, "Wait for this run to finish before deleting it.");
      if (!worker) throw new PlannerError(503, "Video cleanup is unavailable.");
      if (!await worker.removeRun(run)) throw new PlannerError(502, "Meta file cleanup could not be confirmed. Your run is retained so cleanup can be retried.");
      return { deleted: true as const };
    }, { params: idParams });
}

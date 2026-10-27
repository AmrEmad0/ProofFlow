import type { Database } from "bun:sqlite";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { Elysia, t } from "elysia";
import { conceptTrackSchema } from "../../shared/verification";
import { LIMITS } from "../../shared/proof-plan";
import type { Config } from "../config";
import { requireWorkspaceOrigin, sessionHash } from "../http/session";
import { PlannerError } from "../planner/store";
import { runDirectory } from "../verification/storage";
import { verificationStore } from "../verification/store";
import type { VerificationWorker } from "../verification/worker";

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
  return new Elysia()
    .onBeforeHandle(({ request, set }) => {
      set.headers["cache-control"] = "no-store";
      if (request.method !== "GET" && request.method !== "HEAD") requireWorkspaceOrigin(request, config);
    })
    .get("/api/verification/status", () => ({ available: Boolean(worker?.ready && config.modelConfigured), retentionHours: config.MEDIA_RETENTION_HOURS }))
    .get("/api/runs", ({ query, request }) => store.list(query.approvedVersionId, sessionHash(request)), {
      query: t.Object({ approvedVersionId: t.String({ format: "uuid" }) }),
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
        const run = store.create(id, body.approvedVersionId, body.contractHash, hash, path, config.MEDIA_RETENTION_HOURS);
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
    }, { additionalProperties: false }) })
    .get("/api/runs/:id", async ({ params, request }) => {
      const details = store.details(params.id, sessionHash(request));
      if (details.state === "completed") {
        const artifacts = db.query<{ artifact_path: string }, [string]>("SELECT artifact_path FROM track_artifacts WHERE run_id = ? ORDER BY concept").all(params.id);
        details.tracks = await Promise.all(artifacts.map(async ({ artifact_path }) => {
          const value: unknown = await Bun.file(artifact_path).json();
          if (!value || typeof value !== "object" || !("track" in value)) throw new Error("Tracking artifact is unavailable.");
          return conceptTrackSchema.parse(value.track);
        }));
      }
      return details;
    }, { params: idParams })
    .get("/api/runs/:id/video", async ({ params, request }) => {
      const run = store.row(params.id, sessionHash(request));
      if (!run.normalized_path || !await Bun.file(run.normalized_path).exists()) throw new PlannerError(404, "The analysis video is not available yet.");
      return videoResponse(Bun.file(run.normalized_path), request.headers.get("range"));
    }, { params: idParams })
    .delete("/api/runs/:id", async ({ params, request }) => {
      const run = store.row(params.id, sessionHash(request));
      if (run.state !== "completed" && run.state !== "failed") throw new PlannerError(409, "Wait for this run to finish before deleting it.");
      if (!worker) throw new PlannerError(503, "Video cleanup is unavailable.");
      if (!await worker.removeRun(run)) throw new PlannerError(502, "Meta file cleanup could not be confirmed. Your run is retained so cleanup can be retried.");
      return { deleted: true as const };
    }, { params: idParams });
}

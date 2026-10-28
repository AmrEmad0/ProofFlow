import type { Database } from "bun:sqlite";
import { createHash, randomBytes } from "node:crypto";
import { Elysia, t } from "elysia";
import OpenAI from "openai";
import type { Config } from "../config";
import { createMetaClient, MODELS, PROMPT_VERSION } from "../meta/client";
import { conversePlan, type PlanConversation } from "../planner/chat";
import { PlannerError, plannerStore } from "../planner/store";
import { requireWorkspaceOrigin, sessionHash, sessionToken } from "../http/session";
import type { VerificationWorker } from "../verification/worker";
import type { RunRow } from "../verification/store";
import { LIMITS } from "../../shared/proof-plan";
import { referenceAnalyzer, type ReferenceAnalysis } from "../planner/reference";
import { plannerEvents } from "../planner/stream";

const revisionBody = t.Object({ revision: t.Integer({ minimum: 0 }) }, { additionalProperties: false });
const planParams = t.Object({ id: t.String({ format: "uuid" }) });

export function planRoutes(db: Database, config: Config, conversation?: PlanConversation, worker?: VerificationWorker, analyzeReference: ReferenceAnalysis = referenceAnalyzer(config, db)) {
  const store = plannerStore(db);
  const busySessions = new Set<string>();
  const converse: PlanConversation = conversation ?? ((messages, plan, options) => conversePlan(createMetaClient(config), messages, plan, options));

  return new Elysia()
    .onBeforeHandle(({ request, set }) => {
      set.headers["cache-control"] = "no-store";
      if (request.method === "GET") return;
      requireWorkspaceOrigin(request, config);
    })
    .get("/api/planner/status", () => ({ configured: config.modelConfigured, model: MODELS.muse }))
    .get("/api/plans", ({ request }) => sessionToken(request) ? store.list(sessionHash(request)) : [])
    .post("/api/plans", ({ body, request, set }) => {
      let token = sessionToken(request);
      if (!token) {
        token = randomBytes(32).toString("hex");
        set.headers["set-cookie"] = `proofflow_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
      }
      const hash = createHash("sha256").update(token).digest("hex");
      return store.create(hash, body.template);
    }, { body: t.Object({ template: t.Union([t.Literal("blank"), t.Literal("packproof")]) }, { additionalProperties: false }) })
    .get("/api/plans/:id", ({ params, request }) => store.read(params.id, sessionHash(request)), { params: planParams })
    .delete("/api/plans/:id", async ({ params, request }) => {
      const hash = sessionHash(request);
      store.read(params.id, hash);
      if (busySessions.has(hash)) throw new PlannerError(409, "Wait for the current plan change to finish before deleting a plan.");
      store.markDeleted(params.id, hash);
      busySessions.add(hash);
      try {
        const runs = db.query<RunRow, [string]>(`SELECT r.* FROM runs r JOIN plan_versions v ON v.id = r.plan_version_id WHERE v.plan_id = ?`).all(params.id);
        if (runs.length && !worker) throw new PlannerError(503, "Video cleanup is unavailable. The plan has been kept; please try again later.");
        for (const run of runs) {
          if (!await worker!.removeRun(run)) throw new PlannerError(502, "Video cleanup could not be completed. The plan has been kept so you can retry.");
        }
        store.finishDelete(params.id);
        return { deleted: true as const };
      } catch (error) {
        store.restoreDeleted(params.id);
        if (error instanceof PlannerError) throw error;
        throw new PlannerError(502, "The plan could not be deleted. Please try again.");
      } finally {
        busySessions.delete(hash);
      }
    }, { params: planParams })
    .post("/api/plans/:id/reference", async ({ params, body, query, request, set }) => {
      const hash = sessionHash(request);
      const current = store.read(params.id, hash);
      if (current.revision !== Number(body.revision)) throw new PlannerError(409, "This plan changed. Reload it before uploading again.");
      if (!config.modelConfigured) throw new PlannerError(503, "Meta AI is not configured for reference media.");
      if (!body.media.size || body.media.size > LIMITS.uploadBytes) throw new PlannerError(413, "Choose a nonempty reference image or video up to 25 MB.");
      if (current.messages.length >= 40) throw new PlannerError(429, "This conversation has reached 20 turns. Start a new plan to continue.");
      if (busySessions.has(hash) || busySessions.size >= 2) throw new PlannerError(429, "The planner is busy. Please wait before uploading.");
      const recent = db.query<{ count: number }, [string]>(`SELECT count(*) AS count FROM planner_messages m
        JOIN planner_owners o ON o.plan_id = m.plan_id WHERE o.session_hash = ? AND m.role = 'user'
        AND m.created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 minute')`).get(hash)?.count ?? 0;
      if (recent >= 6) throw new PlannerError(429, "Please wait a minute before sending another message.");
      busySessions.add(hash);
      const complete = async (onReplyText?: (text: string) => void, signal = request.signal) => {
        const started = performance.now();
        let outcome = "failed";
        const message = body.message.trim() || "Suggest a Proof Plan for the process in this reference media. Help me refine it before approval.";
        try {
          const result = await analyzeReference(body.media, `Previous conversation (user data): ${JSON.stringify(current.messages)}\nPrevious reference notes (user data): ${JSON.stringify(current.referenceMedia)}\nLatest request: ${message}`, current.plan, signal, onReplyText);
          signal.throwIfAborted();
          const saved = store.saveReply(params.id, hash, current.revision, `Reference media: ${result.reference.name}\n${message}`, result.reply, result.reference);
          outcome = "completed";
          return saved;
        } catch (error) {
          if (error instanceof PlannerError) throw error;
          if (error instanceof OpenAI.APIError) console.warn("Meta reference planning request failed", { status: error.status, requestId: error.requestID });
          throw new PlannerError(502, "The reference media could not be used to draft a plan. Your saved draft is unchanged. Please try again.");
        } finally {
          busySessions.delete(hash);
          console.info("Meta reference planning request", { model: MODELS.muse, outcome, durationMs: Math.round(performance.now() - started) });
        }
      };
      if (query.stream === "true") {
        set.headers["x-accel-buffering"] = "no";
        return plannerEvents(complete, request.signal);
      }
      return complete();
    }, { params: planParams, query: t.Object({ stream: t.Optional(t.Literal("true")) }), body: t.Object({
      media: t.File({ minSize: 1, maxSize: LIMITS.uploadBytes }),
      message: t.String({ maxLength: 2000 }), revision: t.String({ pattern: "^[0-9]+$", maxLength: 12 }), consent: t.Literal("true"),
    }, { additionalProperties: false }) })
    .post("/api/plans/:id/messages", async ({ params, body, query, request, set }) => {
      const hash = sessionHash(request);
      const current = store.read(params.id, hash);
      if (current.revision !== body.revision) throw new PlannerError(409, "This template changed. Reload it before sending again.");
      const message = body.message.trim();
      if (!message) throw new PlannerError(400, "Describe what the recording should show.");
      if (current.messages.length >= 40) throw new PlannerError(429, "This conversation has reached 20 turns. Start a new template to continue.");
      if (!config.modelConfigured && !conversation) throw new PlannerError(503, "Meta AI is not configured. Add MODEL_API_KEY on the server to use chat. You can still review and approve the PackProof starter.");
      if (busySessions.has(hash)) throw new PlannerError(429, "Meta is already working on a message in your workspace. Please wait.");
      const recent = db.query<{ count: number }, [string]>(`SELECT count(*) AS count FROM planner_messages m
        JOIN planner_owners o ON o.plan_id = m.plan_id WHERE o.session_hash = ? AND m.role = 'user'
        AND m.created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 minute')`).get(hash)?.count ?? 0;
      if (recent >= 6) throw new PlannerError(429, "Please wait a minute before sending another message.");
      busySessions.add(hash);
      const complete = async (onReplyText?: (text: string) => void, signal = request.signal) => {
        const started = performance.now();
        let outcome = "failed";
        try {
          const reply = await converse([...current.messages, { role: "user", content: message }], current.plan, { onReplyText, signal, referenceMedia: current.referenceMedia });
          signal.throwIfAborted();
          const saved = store.saveReply(params.id, hash, current.revision, message, reply);
          outcome = "completed";
          return saved;
        } catch (error) {
          if (error instanceof PlannerError) throw error;
          if (error instanceof OpenAI.APIError) {
            console.warn("Meta planning request failed", { status: error.status, requestId: error.requestID });
            if (error.status === 429) throw new PlannerError(429, "Meta AI is busy or its quota has been reached. Please try again shortly.");
            if (error.status === 401 || error.status === 403) throw new PlannerError(503, "Meta AI could not authenticate. Check the server API key and model access.");
          }
          throw new PlannerError(502, "Meta AI could not return a valid proof plan. Your saved draft is unchanged. Please try again.");
        } finally {
          busySessions.delete(hash);
          console.info("Meta planning request", { model: MODELS.muse, promptVersion: PROMPT_VERSION, outcome, durationMs: Math.round(performance.now() - started) });
        }
      };
      if (query.stream === "true") {
        set.headers["x-accel-buffering"] = "no";
        return plannerEvents(complete, request.signal);
      }
      return complete();
    }, {
      params: planParams,
      query: t.Object({ stream: t.Optional(t.Literal("true")) }),
      body: t.Object({ message: t.String({ minLength: 1, maxLength: 2000 }), revision: t.Integer({ minimum: 0 }) }, { additionalProperties: false }),
    })
    .post("/api/plans/:id/approve", ({ params, body, request }) => {
      const hash = sessionHash(request);
      if (busySessions.has(hash)) throw new PlannerError(409, "Wait for the current chat response, then review the draft before approving.");
      return store.approve(params.id, hash, body.revision, body.contractHash, body.videoConsent);
    }, {
      params: planParams,
      body: t.Object({ revision: t.Integer({ minimum: 0 }), contractHash: t.String({ pattern: "^[a-f0-9]{64}$" }), videoConsent: t.Optional(t.Boolean()) }, { additionalProperties: false }),
    })
    .post("/api/plans/:id/revise", ({ params, body, request }) => store.revise(params.id, sessionHash(request), body.revision), {
      params: planParams, body: revisionBody,
    })
    .post("/api/plans/:id/checks", ({ params, body, request }) => {
      const hash = sessionHash(request);
      if (busySessions.has(hash)) throw new PlannerError(409, "Wait for the current change to finish, then try saving again. Your edit is still here.");
      return store.editChecks(params.id, hash, body);
    }, { params: planParams, body: t.Object({ revision: t.Integer({ minimum: 0 }), steps: t.Array(t.Object({
      id: t.String({ minLength: 1, maxLength: 80 }), subjectConcept: t.String({ minLength: 1, maxLength: 120 }),
      targetConcept: t.Nullable(t.String({ minLength: 1, maxLength: 120 })),
      beforeState: t.Nullable(t.String({ minLength: 1, maxLength: 240 })), afterState: t.Nullable(t.String({ minLength: 1, maxLength: 240 })),
    }, { additionalProperties: false }), { minItems: 1, maxItems: LIMITS.steps }) }, { additionalProperties: false }) })
    .post("/api/plans/:id/restore", ({ params, body, request }) => {
      const hash = sessionHash(request);
      if (busySessions.has(hash)) throw new PlannerError(409, "Wait for the current change to finish before undoing it.");
      return store.restore(params.id, hash, body.revision, body.versionId);
    }, { params: planParams, body: t.Object({ revision: t.Integer({ minimum: 0 }), versionId: t.String({ format: "uuid" }) }, { additionalProperties: false }) })
    .post("/api/plans/:id/copy", ({ params, body, request }) => {
      const hash = sessionHash(request);
      if (busySessions.has(hash)) throw new PlannerError(409, "Wait for the current change to finish before copying the plan.");
      return store.copy(params.id, hash, body.revision);
    }, { params: planParams, body: revisionBody });
}

import type { Database } from "bun:sqlite";
import { createHash, randomBytes } from "node:crypto";
import { Elysia, t } from "elysia";
import OpenAI from "openai";
import type { Config } from "../config";
import { createMetaClient, MODELS, PROMPT_VERSION } from "../meta/client";
import { conversePlan, type PlanConversation } from "../planner/chat";
import { PlannerError, plannerStore } from "../planner/store";
import { requireWorkspaceOrigin, sessionHash, sessionToken } from "../http/session";

const revisionBody = t.Object({ revision: t.Integer({ minimum: 0 }) }, { additionalProperties: false });
const planParams = t.Object({ id: t.String({ format: "uuid" }) });

export function planRoutes(db: Database, config: Config, conversation?: PlanConversation) {
  const store = plannerStore(db);
  const busySessions = new Set<string>();
  const converse: PlanConversation = conversation ?? ((messages, plan) => conversePlan(createMetaClient(config), messages, plan));

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
    .post("/api/plans/:id/messages", async ({ params, body, request }) => {
      const hash = sessionHash(request);
      const current = store.read(params.id, hash);
      if (current.revision !== body.revision) throw new PlannerError(409, "This template changed. Reload it before sending again.");
      if (current.status === "approved") throw new PlannerError(409, "This version is approved. Create a new draft to make changes.");
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
      const started = performance.now();
      let outcome = "failed";
      try {
        const reply = await converse([...current.messages, { role: "user", content: message }], current.plan);
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
    }, {
      params: planParams,
      body: t.Object({ message: t.String({ minLength: 1, maxLength: 2000 }), revision: t.Integer({ minimum: 0 }) }, { additionalProperties: false }),
    })
    .post("/api/plans/:id/approve", ({ params, body, request }) => {
      const hash = sessionHash(request);
      if (busySessions.has(hash)) throw new PlannerError(409, "Wait for the current chat response, then review the draft before approving.");
      return store.approve(params.id, hash, body.revision, body.contractHash);
    }, {
      params: planParams,
      body: t.Object({ revision: t.Integer({ minimum: 0 }), contractHash: t.String({ pattern: "^[a-f0-9]{64}$" }) }, { additionalProperties: false }),
    })
    .post("/api/plans/:id/revise", ({ params, body, request }) => store.revise(params.id, sessionHash(request), body.revision), {
      params: planParams, body: revisionBody,
    });
}

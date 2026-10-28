import { recordingInput, recordingSources } from "../triggers/sources";
import type { Database } from "bun:sqlite";
import { Elysia, t } from "elysia";
import type { Config } from "../config";
import { requireWorkspaceOrigin, sessionHash } from "../http/session";
import { triggerStore } from "../triggers/store";

const params = t.Object({ id: t.String({ format: "uuid" }) });
const event = {
  eventId: t.String({ format: "uuid" }),
  action: t.Union([t.Literal("start"), t.Literal("finish"), t.Literal("cancel")]),
  reference: t.Optional(t.String({ minLength: 1, maxLength: 120 })),
  sessionId: t.Optional(t.String({ format: "uuid" })),
};

export function triggerRoutes(db: Database, config: Config) {
  const store = triggerStore(db);
  return new Elysia()
    .onBeforeHandle(({ request, set }) => {
      set.headers["cache-control"] = "no-store";
      set.headers["referrer-policy"] = "no-referrer";
      if (request.method === "HEAD" && new URL(request.url).pathname.startsWith("/api/hooks/")) {
        return new Response(null, { status: 405, headers: { allow: "GET, POST", "cache-control": "no-store" } });
      }
      if (request.method !== "GET") requireWorkspaceOrigin(request, config);
    })
    .get("/api/recording-sources", () => recordingSources(config))
    .get("/api/plans/:id/triggers", ({ params, request }) => store.overview(params.id, sessionHash(request)), { params })
    .post("/api/plans/:id/triggers", async ({ params, request, body }) => {
      store.overview(params.id, sessionHash(request));
      if (body.settings.recording) await recordingInput(config, body.settings.recording.kind, body.settings.recording.id);
      return store.save(params.id, sessionHash(request), body.revision, body.settings);
    }, {
      params, body: t.Object({ revision: t.Integer({ minimum: 0 }), settings: t.Object({
        start: t.Union([t.Literal("manual"), t.Literal("scanner"), t.Literal("api")]),
        finish: t.Union([t.Literal("manual"), t.Literal("api"), t.Literal("clip")]),
        recording: t.Optional(t.Object({ kind: t.Union([t.Literal("demo"), t.Literal("camera")]), id: t.String({ minLength: 1, maxLength: 200 }), seconds: t.Integer({ minimum: 1, maximum: 30 }) }, { additionalProperties: false })),
      }, { additionalProperties: false }) }, { additionalProperties: false }),
    })
    .post("/api/plans/:id/triggers/feed", ({ params, request, body }) => store.setFeed(params.id, sessionHash(request), body.running), { params, body: t.Object({ running: t.Boolean() }, { additionalProperties: false }) })
    .post("/api/plans/:id/triggers/key", ({ params, request }) => store.rotateKey(params.id, sessionHash(request)), { params })
    .delete("/api/plans/:id/triggers/key", ({ params, request }) => store.revokeKey(params.id, sessionHash(request)), { params })
    .post("/api/plans/:id/triggers/links", ({ params, request, body }) => store.regenerateLink(params.id, sessionHash(request), body.action), {
      params, body: t.Object({ action: t.Union([t.Literal("start"), t.Literal("finish")]) }, { additionalProperties: false }),
    })
    .get("/api/hooks/:token", ({ params }) => store.fireLink(params.token), {
      params: t.Object({ token: t.String({ pattern: "^[a-f0-9]{64}$" }) }),
    })
    .post("/api/hooks/:token", ({ params }) => store.fireLink(params.token), {
      params: t.Object({ token: t.String({ pattern: "^[a-f0-9]{64}$" }) }),
    })
    .post("/api/plans/:id/triggers/events", ({ params, request, body }) => store.dispatch(params.id, sessionHash(request), body.source, {
      eventId: body.eventId, action: body.action, reference: body.reference, sessionId: body.sessionId,
    }), { params, body: t.Object({ ...event, source: t.Union([t.Literal("manual"), t.Literal("scanner")]) }, { additionalProperties: false }) })
    .post("/api/triggers/:id/events", ({ params, request, body }) => {
      const owner = store.apiOwner(params.id, request.headers.get("authorization"));
      return store.dispatch(params.id, owner, "api", body);
    }, { params, body: t.Object(event, { additionalProperties: false }) });
}

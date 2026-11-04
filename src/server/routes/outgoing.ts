import type { Database } from "bun:sqlite";
import { Elysia, t } from "elysia";
import { outgoingSettingsSchema } from "../../shared/outgoing";
import type { Config } from "../config";
import { requireWorkspaceOrigin, sessionHash } from "../http/session";
import { outgoingStore } from "../outgoing/store";
import { resolveEndpoint } from "../outgoing/transport";
import { plannerStore, PlannerError } from "../planner/store";

export function outgoingRoutes(db: Database, config: Config) {
  const store = outgoingStore(db);
  const params = t.Object({ id: t.String({ format: "uuid" }) });
  return new Elysia().onBeforeHandle(({ request, set }) => {
    set.headers["cache-control"] = "no-store";
    if (request.method !== "GET") requireWorkspaceOrigin(request, config);
  })
    .get("/api/plans/:id/outgoing", ({ params, request, query }) => store.overview(params.id, sessionHash(request), query.runId), {
      params, query: t.Object({ runId: t.Optional(t.String({ format: "uuid" })) }),
    })
    .post("/api/plans/:id/outgoing", async ({ params, request, body }) => {
      const owner = sessionHash(request);
      plannerStore(db).read(params.id, owner);
      if (body.endpoint) {
        try { await resolveEndpoint(body.endpoint); }
        catch (error) { if (error instanceof PlannerError) throw error; throw new PlannerError(400, "The outgoing endpoint could not be resolved."); }
      }
      return store.save(params.id, owner, body.endpoint);
    }, { params, body: outgoingSettingsSchema });
}

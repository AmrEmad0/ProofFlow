import { isDemoRead } from "../demo/access";
import type { Database } from "bun:sqlite";
import { Elysia, t } from "elysia";
import { sessionHash, sessionToken } from "../http/session";
import { createReport } from "../verification/reports";

export function reportRoutes(db: Database) {
  return new Elysia().get("/api/reports", ({ request, query, set }) => {
    set.headers["cache-control"] = "no-store";
    return db.transaction(() => createReport(db, sessionToken(request) || isDemoRead(request) ? sessionHash(request) : null, query))();
  }, { query: t.Object({ planId: t.Optional(t.String({ format: "uuid" })), from: t.Optional(t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" })), to: t.Optional(t.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}$" })) }) });
}

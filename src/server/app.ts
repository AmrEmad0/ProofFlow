import type { Database } from "bun:sqlite";
import { cors } from "@elysia/cors";
import { Elysia } from "elysia";
import type { Config } from "./config";
import { healthRoutes } from "./routes/health";
import { templateRoutes } from "./routes/templates";
import { planRoutes } from "./routes/plans";
import { PlannerError } from "./planner/store";
import type { ReferenceAnalysis } from "./planner/reference";
import type { PlanConversation } from "./planner/chat";
import { runRoutes } from "./routes/runs";
import type { VerificationWorker } from "./verification/worker";
import { workspaceOrigins } from "./http/session";
import { triggerRoutes } from "./routes/triggers";

export function createApp(db: Database, config: Config, conversation?: PlanConversation, worker?: VerificationWorker, analyzeReference?: ReferenceAnalysis) {
  return new Elysia({ normalize: false, serve: { maxRequestBodySize: 26 * 1024 * 1024 } })
    .use(config.NODE_ENV === "development"
      ? cors({ origin: workspaceOrigins(config), methods: ["GET", "POST", "PATCH", "DELETE"], credentials: false })
      : new Elysia())
    .onError(({ code, error, set }) => {
      if (error instanceof PlannerError) { set.status = error.status; return { error: error.message }; }
      if (code === "NOT_FOUND") { set.status = 404; return { error: "Route not found" }; }
      if (code === "VALIDATION" || code === "PARSE") { set.status = 400; return { error: "Invalid request" }; }
      console.error("API request failed", { code, name: error instanceof Error ? error.name : "UnknownError" });
      set.status = 500;
      return { error: "The request could not be completed" };
    })
    .use(healthRoutes(db, config, () => Boolean(worker?.ready && config.modelConfigured)))
    .use(templateRoutes)
    .use(planRoutes(db, config, conversation, worker, analyzeReference))
    .use(triggerRoutes(db, config))
    .use(runRoutes(db, config, worker));
}

export type App = ReturnType<typeof createApp>;

import type { Database } from "bun:sqlite";
import { cors } from "@elysia/cors";
import { Elysia } from "elysia";
import type { Config } from "./config";
import { healthRoutes } from "./routes/health";
import { templateRoutes } from "./routes/templates";

export function createApp(db: Database, config: Config) {
  return new Elysia({ serve: { maxRequestBodySize: 26 * 1024 * 1024 } })
    .use(config.NODE_ENV === "development"
      ? cors({ origin: [config.WEB_ORIGIN], methods: ["GET", "POST", "PATCH"], credentials: false })
      : new Elysia())
    .onError(({ code, error, set }) => {
      if (code === "NOT_FOUND") { set.status = 404; return { error: "Route not found" }; }
      if (code === "VALIDATION" || code === "PARSE") { set.status = 400; return { error: "Invalid request" }; }
      console.error("API request failed", error);
      set.status = 500;
      return { error: "The request could not be completed" };
    })
    .use(healthRoutes(db, config))
    .use(templateRoutes);
}

export type App = ReturnType<typeof createApp>;

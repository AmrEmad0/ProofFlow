import type { Database } from "bun:sqlite";
import { Elysia } from "elysia";
import type { Config } from "../config";
import { mediaReadiness } from "../media/process";

export function healthRoutes(db: Database, config: Config) {
  return new Elysia().get("/api/health", async ({ set }) => {
    let database = false;
    try { database = db.query("SELECT 1").get() !== null; } catch { /* readiness reports a failure */ }
    const media = await mediaReadiness(config);
    const ready = database && media.ffmpeg && media.ffprobe;
    if (!ready) set.status = 503;
    return {
      status: ready ? "ok" as const : "degraded" as const,
      services: { database, ...media },
      models: { configured: config.modelConfigured },
      capabilities: { templates: true, videoAnalysis: false },
    };
  });
}

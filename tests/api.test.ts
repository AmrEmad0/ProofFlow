import { afterAll, describe, expect, test } from "bun:test";
import { treaty } from "@elysia/eden";
import { createApp } from "../src/server/app";
import { loadConfig } from "../src/server/config";
import { openDatabase } from "../src/server/db";

const db = openDatabase(":memory:");
const config = loadConfig({ NODE_ENV: "test", DATABASE_PATH: ":memory:" });
const app = createApp(db, config);
afterAll(() => db.close());

describe("foundation API", () => {
  test("Eden infers the PackProof route and reads a generic, unapproved plan", async () => {
    const client = treaty(app);
    const { data, error } = await client.api.templates.packproof.get();
    expect(error).toBeNull();
    expect(data?.title).toBe("PackProof");
    expect(data?.steps).toHaveLength(3);
    expect(data).not.toHaveProperty("approvedVersionId");
  });

  test("health checks real local dependencies without requiring model credentials", async () => {
    const response = await app.handle(new Request("http://localhost/api/health"));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.services).toEqual({ database: true, ffmpeg: true, ffprobe: true });
    expect(body.models.configured).toBe(false);
    expect(body.capabilities.videoAnalysis).toBe(false);
  });

  test("reports degraded readiness for an unavailable media binary", async () => {
    const unavailable = createApp(db, { ...config, FFMPEG_PATH: "/no-such-ffmpeg" });
    const response = await unavailable.handle(new Request("http://localhost/api/health"));
    expect(response.status).toBe(503);
    expect((await response.json()).services.ffmpeg).toBe(false);
  });

  test("unimplemented analysis endpoints return 404", async () => {
    const response = await app.handle(new Request("http://localhost/api/runs", { method: "POST" }));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Route not found" });
  });

  test("development CORS permits only the configured origin", async () => {
    const dev = createApp(db, { ...config, NODE_ENV: "development" });
    const allowed = await dev.handle(new Request("http://localhost/api/templates/packproof", { headers: { origin: config.WEB_ORIGIN } }));
    expect(allowed.headers.get("access-control-allow-origin")).toBe(config.WEB_ORIGIN);
    const denied = await dev.handle(new Request("http://localhost/api/templates/packproof", { headers: { origin: "https://unrelated.example" } }));
    expect(denied.headers.get("access-control-allow-origin")).not.toBe("https://unrelated.example");
  });
});

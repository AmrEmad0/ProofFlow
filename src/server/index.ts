import { createCaptureWorker } from "./triggers/capture-worker";
import { staticPlugin } from "@elysia/static";
import { mkdir } from "node:fs/promises";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { openDatabase } from "./db";
import { createVerificationWorker } from "./verification/worker";
import { workspaceEvents } from "./http/workspace-events";

const config = loadConfig();
await mkdir(config.STORAGE_PATH, { recursive: true, mode: 0o700 });
const db = openDatabase(config.DATABASE_PATH);
const worker = createVerificationWorker(db, config);
await worker.startWhenAvailable();
const captures = createCaptureWorker(db, config, worker);
const app = createApp(db, config, undefined, worker);

if (config.NODE_ENV === "production") {
  if (!await Bun.file("dist/index.html").exists()) {
    db.close();
    throw new Error("Frontend build missing. Run bun run build before starting production.");
  }
  app.use(staticPlugin({ assets: "dist", prefix: "/", alwaysStatic: true, indexHTML: true }));
  app.get("/*", ({ path, set }) => {
    if (path === "/api" || path.startsWith("/api/") || path.split("/").at(-1)?.includes(".")) {
      set.status = 404;
      return { error: "Route not found" };
    }
    return Bun.file("dist/index.html");
  });
}

app.listen({ hostname: config.HOST, port: config.PORT });
console.log(`ProofFlow API listening on http://${config.HOST}:${config.PORT}`);

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  workspaceEvents(db).close();
  await app.stop();
  await captures.stop();
  await worker.stop();
  db.close();
  process.exit(0);
}
process.on("SIGINT", () => { void shutdown(); });
process.on("SIGTERM", () => { void shutdown(); });

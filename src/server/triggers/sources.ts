import { readdir, realpath } from "node:fs/promises";
import { basename, join, sep } from "node:path";
import { z } from "zod";
import type { Config } from "../config";
import { PlannerError } from "../planner/store";

function cameras(config: Config) {
  return z.record(z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), z.string().url().refine(value => ["rtsp:", "rtsps:", "http:", "https:"].includes(new URL(value).protocol))).parse(JSON.parse(config.CAMERA_SOURCES));
}
export async function recordingSources(config: Config) {
  const entries = await readdir(config.DEMO_VIDEO_PATH, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  return [...entries.filter(entry => entry.isFile() && /\.(mp4|mov|webm)$/i.test(entry.name)).map(entry => ({ kind: "demo" as const, id: entry.name, label: entry.name })),
    ...Object.keys(cameras(config)).map(id => ({ kind: "camera" as const, id, label: id }))];
}
export async function recordingInput(config: Config, kind: "demo" | "camera", id: string) {
  if (kind === "camera") {
    const url = cameras(config)[id];
    if (!url) throw new PlannerError(400, "This camera is no longer configured.");
    return url;
  }
  if (basename(id) !== id || !/\.(mp4|mov|webm)$/i.test(id)) throw new PlannerError(400, "Choose a demo video from the configured folder.");
  const root = await realpath(config.DEMO_VIDEO_PATH);
  const path = await realpath(join(root, id));
  if (!path.startsWith(root + sep)) throw new PlannerError(400, "Demo video must stay inside its folder.");
  return path;
}

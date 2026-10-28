import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runMediaCommand } from "../src/server/media/process";
import { normalizeVideo, probeVideo } from "../src/server/media/video";
import { LIMITS } from "../src/shared/proof-plan";

let dir: string;
const config = { FFMPEG_PATH: "ffmpeg", FFPROBE_PATH: "ffprobe" };
beforeAll(async () => { dir = await mkdtemp(join(tmpdir(), "proofflow-media-")); });
afterAll(async () => { await rm(dir, { recursive: true, force: true }); });

describe("native media adapters", () => {
  test("validates and normalizes actual video bytes, including paths with spaces", async () => {
    const input = join(dir, "source with spaces.mp4");
    const output = join(dir, "normalized.mp4");
    await runMediaCommand(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=c=blue:s=800x600:r=12:d=1", "-c:v", "libx264", input]);
    expect((await probeVideo(input, config)).width).toBe(800);
    const result = await normalizeVideo(input, output, config);
    expect(result.width).toBe(640);
    expect(result.height).toBe(480);
    expect(result.frameRate).toBe("6/1");
    expect(result.durationMs).toBe(1000);
  });

  test("rejects readable videos longer than the application limit", async () => {
    const input = join(dir, "overlong.mp4");
    await runMediaCommand(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", `color=c=black:s=32x32:r=1:d=${LIMITS.durationMs / 1000 + 1}`, "-c:v", "libx264", input]);
    await expect(probeVideo(input, config)).rejects.toThrow(`${LIMITS.durationMs / 1000} seconds`);
  });

  test("rejects text with a video extension and empty files", async () => {
    const invalid = join(dir, "invalid.mp4");
    await Bun.write(invalid, "not video bytes");
    await expect(probeVideo(invalid, config)).rejects.toThrow();
    const empty = join(dir, "empty.mp4");
    await Bun.write(empty, "");
    await expect(probeVideo(empty, config)).rejects.toThrow("nonempty");
  });
});

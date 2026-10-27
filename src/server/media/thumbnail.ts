import { chmod, rename, rm } from "node:fs/promises";
import type { Config } from "../config";
import { runMediaCommand } from "./process";

export async function createVideoThumbnail(input: string, output: string, config: Pick<Config, "FFMPEG_PATH">) {
  const temporary = `${output}.${crypto.randomUUID()}.pending.jpg`;
  try {
    await runMediaCommand([
      config.FFMPEG_PATH, "-nostdin", "-v", "error", "-y", "-protocol_whitelist", "file,pipe", "-i", input,
      "-map", "0:v:0", "-frames:v", "1", "-vf", "scale=320:180:force_original_aspect_ratio=decrease,pad=320:180:(ow-iw)/2:(oh-ih)/2",
      "-q:v", "3", temporary,
    ]);
    await chmod(temporary, 0o600);
    await rename(temporary, output);
  } finally {
    await rm(temporary, { force: true });
  }
}

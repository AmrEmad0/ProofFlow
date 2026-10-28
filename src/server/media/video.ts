import { z } from "zod";
import { LIMITS } from "../../shared/proof-plan";
import type { Config } from "../config";
import { runMediaCommand } from "./process";

const probeSchema = z.object({
  format: z.object({ duration: z.coerce.number().positive() }),
  streams: z.array(z.object({
    codec_type: z.string(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    avg_frame_rate: z.string().optional(),
    nb_frames: z.string().optional(),
  })),
});

export async function probeVideo(path: string, config: Pick<Config, "FFPROBE_PATH">) {
  const size = Bun.file(path).size;
  if (size === 0 || size > LIMITS.uploadBytes) throw new Error("Video must be nonempty and at most 25 MB.");
  const output = await runMediaCommand([
    config.FFPROBE_PATH, "-v", "error", "-protocol_whitelist", "file,pipe", "-format_whitelist", "mov,matroska,webm",
    "-show_format", "-show_streams", "-of", "json", path,
  ]);
  const probe = probeSchema.parse(JSON.parse(output));
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  if (!video?.width || !video.height) throw new Error("No readable video stream found.");
  const durationMs = Math.round(probe.format.duration * 1000);
  if (probe.format.duration * 1000 > LIMITS.durationMs) throw new Error(`Video must be at most ${LIMITS.durationMs / 1000} seconds.`);
  const frames = Number(video.nb_frames);
  return { durationMs, width: video.width, height: video.height, frameRate: video.avg_frame_rate ?? null,
    frameCount: Number.isInteger(frames) && frames > 0 ? frames : null };
}

// Call only with server-controlled paths. Validate before transcoding; do not
// silently truncate an overlong recording into apparently valid evidence.
export async function normalizeVideo(input: string, output: string, config: Pick<Config, "FFMPEG_PATH" | "FFPROBE_PATH">) {
  await probeVideo(input, config);
  await runMediaCommand([
    config.FFMPEG_PATH, "-nostdin", "-v", "error", "-n", "-protocol_whitelist", "file,pipe", "-format_whitelist", "mov,matroska,webm", "-i", input,
    "-map", "0:v:0", "-vf", "setpts=PTS-STARTPTS,fps=6,scale=w='min(640,iw)':h='min(640,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
    "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", output,
  ]);
  return probeVideo(output, config);
}

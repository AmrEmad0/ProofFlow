import { chmod, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { ANALYSIS_FPS, TRACK_COLORS, type ConceptTrack, type RunDetails } from "../../shared/verification";
import type { Config } from "../config";
import { runMediaCommand } from "./process";

function timestamp(frame: number) {
  // ASS uses centiseconds. Round down so frame N's label is active at N/6,
  // including fractional sample times such as 1/6 and 2/6 seconds.
  const centiseconds = Math.floor(frame * 100 / ANALYSIS_FPS);
  return `${Math.floor(centiseconds / 360000)}:${String(Math.floor(centiseconds / 6000) % 60).padStart(2, "0")}:${String(Math.floor(centiseconds / 100) % 60).padStart(2, "0")}.${String(centiseconds % 100).padStart(2, "0")}`;
}

function labelText(value: string) {
  // Model and plan strings must never become ASS control tags or new events.
  return value.replace(/[\r\n\u2028\u2029]/g, " ").replace(/[\x00-\x1f\x7f]/g, "")
    .replaceAll("\\", "＼").replaceAll("{", "｛").replaceAll("}", "｝");
}

export async function createAnnotatedVideo(input: string, output: string, media: NonNullable<RunDetails["media"]>, tracks: ConceptTrack[], config: Pick<Config, "FFMPEG_PATH">) {
  const directory = dirname(resolve(output));
  const token = crypto.randomUUID();
  const subtitlePath = join(directory, `${token}.ass`);
  const temporary = join(directory, `${token}.pending.mp4`);
  const lines = [
    "[Script Info]", "ScriptType: v4.00+", `PlayResX: ${media.width}`, `PlayResY: ${media.height}`, "WrapStyle: 2", "ScaledBorderAndShadow: yes", "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    "Style: Box,DejaVu Sans,11,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,7,0,0,0,1",
  ];
  const colors = tracks.map((_track, index) => {
    const hex = TRACK_COLORS[index % TRACK_COLORS.length]!.slice(1);
    return `${hex.slice(4, 6)}${hex.slice(2, 4)}${hex.slice(0, 2)}`;
  });
  tracks.forEach((_track, index) => lines.push(`Style: Label${index},DejaVu Sans,11,&H00FFFFFF,&H00FFFFFF,&H00${colors[index]},&H00${colors[index]},0,0,0,0,100,100,0,0,3,2,0,7,0,0,0,1`));
  lines.push("", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text");
  tracks.forEach((track, index) => {
    if (track.outcome !== "completed") return;
    for (const box of track.boxes) {
      if (box.frameIndex >= media.frameCount) continue;
      const left = Math.round(box.left * media.width), top = Math.round(box.top * media.height);
      const right = Math.round(box.right * media.width), bottom = Math.round(box.bottom * media.height);
      const start = timestamp(box.frameIndex), end = timestamp(box.frameIndex + 1);
      const label = labelText(`${track.concept} #${box.objectId}`);
      const labelWidth = Math.min(media.width, label.length * 6.5 + 8);
      const x = Math.max(0, Math.min(left, media.width - labelWidth)), y = Math.max(0, top - 17);
      lines.push(`Dialogue: 0,${start},${end},Box,,0,0,0,,{\\an7\\pos(0,0)\\p1\\1a&HFF&\\3c&H${colors[index]}&}m ${left} ${top} l ${right} ${top} ${right} ${bottom} ${left} ${bottom} ${left} ${top}`);
      lines.push(`Dialogue: 1,${start},${end},Label${index},,0,0,0,,{\\an7\\pos(${x},${y})}${label}`);
    }
  });
  try {
    await Bun.write(subtitlePath, lines.join("\n"), { mode: 0o600 });
    // Only our UUID filename enters the filter expression. Cwd avoids injecting
    // storage paths containing quotes, colons, or backslashes into FFmpeg syntax.
    await runMediaCommand([
      config.FFMPEG_PATH, "-nostdin", "-v", "error", "-y", "-protocol_whitelist", "file,pipe", "-i", resolve(input),
      "-map", "0:v:0", "-vf", `subtitles=filename=${token}.ass`, "-an", "-map_metadata", "-1",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-fps_mode", "passthrough", "-movflags", "+faststart", temporary,
    ], 30_000, directory);
    await chmod(temporary, 0o600);
    await rename(temporary, resolve(output));
  } finally {
    await Promise.all([rm(subtitlePath, { force: true }), rm(temporary, { force: true })]);
  }
}

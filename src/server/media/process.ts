import type { Config } from "../config";

export async function runMediaCommand(args: string[], timeoutMs = 30_000): Promise<string> {
  const child = Bun.spawn(args, { stdout: "pipe", stderr: "pipe", timeout: timeoutMs });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) throw new Error(`Media process failed (${exitCode}): ${stderr.slice(-2000)}`);
  return stdout;
}

export async function mediaReadiness(config: Pick<Config, "FFMPEG_PATH" | "FFPROBE_PATH">) {
  const [ffmpeg, ffprobe] = await Promise.allSettled([
    runMediaCommand([config.FFMPEG_PATH, "-version"], 5000),
    runMediaCommand([config.FFPROBE_PATH, "-version"], 5000),
  ]);
  return { ffmpeg: ffmpeg.status === "fulfilled", ffprobe: ffprobe.status === "fulfilled" };
}

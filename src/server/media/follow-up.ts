import { chmod } from "node:fs/promises";
import { join } from "node:path";
import type { Observation } from "../../shared/observation";
import { ANALYSIS_FPS, type ConceptTrack, type RunDetails } from "../../shared/verification";
import type { ObservationContext } from "../meta/observe";
import type { Config } from "../config";
import { createAnnotatedVideo } from "./annotated-video";
import { runMediaCommand } from "./process";

export async function createFollowUpFrames(input: string, directory: string, media: NonNullable<RunDetails["media"]>, tracks: ConceptTrack[], observation: Observation,
  questions: ObservationContext["questions"], config: Pick<Config, "FFMPEG_PATH">): Promise<ObservationContext["frames"]> {
  const frames = new Set<number>();
  const candidates = observation.candidates.filter(candidate => questions.some(question => question.stepId === candidate.stepId));
  // Round-robin selection gives each unresolved check context within six frame pairs.
  const selections = candidates.map(candidate => [candidate.before?.timestampMs ?? candidate.startMs,
    candidate.after?.timestampMs ?? candidate.endMs, candidate.action?.timestampMs]);
  for (let moment = 0; moment < 3; moment++) for (const selection of selections) {
    const ms = selection[moment];
    if (ms != null && frames.size < 6) frames.add(Math.max(0, Math.min(media.frameCount - 1, Math.round(ms * ANALYSIS_FPS / 1000))));
  }
  if (!frames.size) return [];
  const annotated = join(directory, "follow-up-labelled.mp4");
  await createAnnotatedVideo(input, annotated, media, tracks, config);
  const result: ObservationContext["frames"] = [];
  let bytes = 0;
  for (const frame of [...frames].sort((a, b) => a - b)) {
    const images: string[] = [];
    for (const [index, source] of [input, annotated].entries()) {
      const output = join(directory, `follow-up-${frame}-${index}.jpg`);
      await runMediaCommand([config.FFMPEG_PATH, "-nostdin", "-v", "error", "-y", "-i", source,
        "-vf", `select=eq(n\\,${frame})`, "-frames:v", "1", "-q:v", "3", output]);
      await chmod(output, 0o600);
      const buffer = await Bun.file(output).bytes();
      bytes += buffer.length;
      if (bytes > 3_000_000) throw new Error("Follow-up media exceeds the request budget.");
      images.push(`data:image/jpeg;base64,${Buffer.from(buffer).toString("base64")}`);
    }
    result.push({ timestampMs: Math.round(frame * 1000 / ANALYSIS_FPS), original: images[0]!, overlay: images[1]!,
      objects: tracks.filter(track => track.outcome === "completed").flatMap(track => track.boxes.filter(box => box.frameIndex === frame).map(box => ({ concept: track.concept, objectId: box.objectId }))) });
  }
  return result;
}

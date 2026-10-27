import { join } from "node:path";
import { z } from "zod";
import { conceptTrackSchema, type RunDetails } from "../../shared/verification";
import { observationSchema } from "../../shared/observation";
import { runDiagnosticsSchema, trackingDiagnosticSchema, verificationDiagnosticsSchema } from "../../shared/diagnostics";
import { evaluateEvidence } from "../engine/verify";
import { PlannerError } from "../planner/store";

const trackArtifactSchema = z.object({
  track: conceptTrackSchema, diagnostic: trackingDiagnosticSchema.optional(),
});

export async function readRunDiagnostics(directory: string, run: RunDetails, artifactPaths: string[]) {
  if (run.state !== "completed" && run.state !== "failed") throw new PlannerError(409, "Wait for analysis to finish before inspecting model diagnostics.");
  const artifacts = await Promise.all(artifactPaths.map(async (path) => trackArtifactSchema.parse(await Bun.file(path).json())));
  const muse = Bun.file(join(directory, "muse.json"));
  const observation = await muse.exists() ? observationSchema.parse(await muse.json()) : null;
  const verification = Bun.file(join(directory, "verification.json"));
  const saved = await verification.exists();
  return runDiagnosticsSchema.parse({
    source: saved ? "saved" : "replayed",
    originalRuleVersion: run.receipt?.provenance.verificationRuleVersion ?? null,
    observation,
    verification: saved ? verificationDiagnosticsSchema.parse(await verification.json())
      : observation && run.media ? evaluateEvidence(run.approvedPlan, observation, artifacts.map((artifact) => artifact.track), run.media.frameCount).diagnostics : null,
    tracking: artifacts.flatMap((artifact) => artifact.diagnostic ? [artifact.diagnostic] : []),
  });
}

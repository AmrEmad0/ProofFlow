import type { RunDetails } from "../../shared/verification";

export const verificationStages = ["Preparing", "Visual analysis", "Object tracking", "Confirmation"] as const;

export function verificationStage(run: RunDetails): number {
  if (run.state === "verifying" || run.state === "completed") return 3;
  if (run.state !== "analyzing") return 0;
  const stage = run.activity.map(event => event.stage).filter(Boolean).at(-1);
  // Older runs have no stage field; step proposals are recorded only after visual analysis returns.
  return stage === "tracking" || run.tracks.length > 0 || run.activity.some(event => event.stepId) ? 2 : 1;
}

export function checkProgress(run: RunDetails, stepId: string): string {
  if (run.state === "queued") return "Waiting to start";
  if (run.state === "preprocessing" || run.state === "uploading") return "Waiting for video preparation";
  if (run.state === "verifying") return "Confirming evidence";
  return run.activity.some(event => event.stepId === stepId) ? "Checking object tracks" : "Waiting for visual analysis";
}

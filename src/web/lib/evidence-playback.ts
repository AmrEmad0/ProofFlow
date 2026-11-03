import type { Finding } from "../../shared/receipt";
import type { RunDetails } from "../../shared/verification";

export function initialReviewFinding(run: RunDetails, focusedStepId?: string): Finding | undefined {
  if (run.state !== "completed") return undefined;
  const findings = run.receipt?.findings ?? [];
  if (focusedStepId) return findings.find(finding => finding.stepId === focusedStepId);
  return findings.find(finding => {
    const latestReview = run.manualReviews?.filter(review => review.stepId === finding.stepId).at(-1);
    return finding.status === "uncertain" && (!latestReview || latestReview.decision === "uncertain");
  });
}

export function reviewPlaybackWindow(finding: Finding, durationMs: number) {
  if (finding.startMs === null || finding.endMs === null || durationMs <= 0 || finding.startMs >= durationMs) return null;
  // Include context on either side and the final sampled frame of an evidence window.
  return { start: Math.max(0, finding.startMs / 1000 - 0.75), end: Math.min(durationMs / 1000, finding.endMs / 1000 + 1) };
}

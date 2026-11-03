import { z } from "zod";
import type { Finding } from "./receipt";

export const reviewDecisionSchema = z.enum(["observed", "not_observed", "uncertain"]);
export const manualReviewInputSchema = z.strictObject({
  stepId: z.string().min(1).max(200),
  decision: reviewDecisionSchema,
  timestampMs: z.number().int().nonnegative().nullable(),
  note: z.string().trim().max(1000),
  expectedRevision: z.number().int().nonnegative(),
}).refine(value => value.decision !== "observed" || value.timestampMs !== null, {
  message: "Mark a video moment before confirming visible evidence.", path: ["timestampMs"],
});
export const manualReviewSchema = z.strictObject({
  id: z.number().int().positive(), stepId: z.string(), decision: reviewDecisionSchema,
  timestampMs: z.number().int().nonnegative().nullable(), note: z.string(), reviewedAt: z.string(),
});
export type ManualReview = z.infer<typeof manualReviewSchema>;
export type ManualReviewInput = z.infer<typeof manualReviewInputSchema>;
export const reviewQueueItemSchema = z.strictObject({
  runId: z.uuid(), planId: z.uuid(), planTitle: z.string(), planVersion: z.number(),
  stepId: z.string(), label: z.string(), requirement: z.string(), createdAt: z.string(),
  taskReference: z.string().nullable(), automatedStatus: reviewDecisionSchema,
  latestReview: manualReviewSchema.nullable(),
});
export const reviewQueueSchema = z.array(reviewQueueItemSchema);
export type ReviewQueueItem = z.infer<typeof reviewQueueItemSchema>;

// The evidence engine exposes categorical verdicts, not calibrated probability scores.
export function needsManualReview(finding: Finding): boolean {
  return finding.status !== "observed" || Boolean(finding.relationships?.some(item => item.status !== "observed"));
}

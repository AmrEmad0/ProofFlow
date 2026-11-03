import { z } from "zod";
import { manualReviewSchema } from "./manual-review";
import { findingStatusSchema, runStateSchema } from "./receipt";

const count = z.number().int().nonnegative();
export const outcomeCountsSchema = z.strictObject({ observed: count, not_observed: count, uncertain: count });
const metricsSchema = z.strictObject({
  videos: count, completed: count, failed: count, active: count, analyzedVideos: count,
  checks: count, missingChecks: count, automatedOnly: count, reviewRequired: count,
  pending: count, followUp: count, humanReviewed: count, reviewEvents: count, amendments: count,
  resolvedUncertainty: count, changedDecisive: count,
});
export const reportCheckSchema = z.strictObject({
  stepId: z.string(), label: z.string(), automatedStatus: findingStatusSchema,
  currentStatus: findingStatusSchema, reviewRequired: z.boolean(),
  startMs: count.nullable(), endMs: count.nullable(), latestReview: manualReviewSchema.nullable(),
});
export const reportRecordSchema = z.strictObject({
  runId: z.uuid(), planId: z.uuid(), planTitle: z.string(), planVersion: count,
  approvedVersionId: z.uuid(), createdAt: z.string(), state: runStateSchema,
  taskReference: z.string().nullable(), error: z.string().nullable(), durationMs: count.nullable(), processingMs: z.number().nonnegative().nullable(),
  missingChecks: count, warnings: count, checks: z.array(reportCheckSchema),
});
export const reportSchema = z.strictObject({
  generatedAt: z.string(), from: z.string().nullable(), to: z.string().nullable(),
  plans: z.array(z.strictObject({ id: z.uuid(), title: z.string() })),
  totals: metricsSchema, automated: outcomeCountsSchema, current: outcomeCountsSchema, manual: outcomeCountsSchema,
  processing: z.strictObject({ medianMs: z.number().nonnegative().nullable(), samples: count }),
  reviewDelay: z.strictObject({ medianMs: z.number().nonnegative().nullable(), samples: count }),
  days: z.array(z.strictObject({ date: z.string(), videos: count, observed: count, not_observed: count, uncertain: count })),
  byPlan: z.array(z.strictObject({ planId: z.uuid(), title: z.string(), versions: z.array(count), metrics: metricsSchema })),
  byCheck: z.array(z.strictObject({ planId: z.uuid(), approvedVersionId: z.uuid(), planVersion: count, planTitle: z.string(), stepId: z.string(), label: z.string(), checks: count, reviewRequired: count, pending: count, followUp: count, humanReviewed: count, observed: count, not_observed: count, uncertain: count })),
  records: z.array(reportRecordSchema),
});
export type Report = z.infer<typeof reportSchema>;
export type ReportMetrics = Report["totals"];
export type ReportRecord = z.infer<typeof reportRecordSchema>;
export type ReportCheck = z.infer<typeof reportCheckSchema>;
export type OutcomeCounts = z.infer<typeof outcomeCountsSchema>;
export type ReportFilters = { planId?: string; from?: string; to?: string };

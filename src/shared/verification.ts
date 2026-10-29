import { z } from "zod";
import { LIMITS, approvedPlanSchema } from "./proof-plan";
import { findingSchema, receiptSchema, runStateSchema } from "./receipt";

export const ANALYSIS_FPS = 6;
export const TRACK_COLORS = ["#c2410c", "#0369a1", "#047857", "#7c3aed"] as const;

export const trackBoxSchema = z.strictObject({
  objectId: z.string().min(1), frameIndex: z.number().int().nonnegative(),
  confidence: z.number().min(0).max(1).optional(),
  left: z.number().min(0).max(1), top: z.number().min(0).max(1),
  right: z.number().min(0).max(1), bottom: z.number().min(0).max(1),
}).refine((box) => box.right > box.left && box.bottom > box.top, "Invalid tracked box");
export const conceptTrackSchema = z.strictObject({
  concept: z.string().min(1), outcome: z.enum(["completed", "failed"]), boxes: z.array(trackBoxSchema),
});
export const runSummarySchema = z.strictObject({
  recordingKind: z.enum(["demo", "camera"]).nullable().optional(),
  taskSessionId: z.uuid().nullable().default(null), taskReference: z.string().nullable().default(null),
  id: z.uuid(), approvedVersionId: z.uuid(), planVersion: z.number().int().positive(), state: runStateSchema,
  createdAt: z.string(), completedAt: z.string().nullable(),
  error: z.string().nullable(), durationMs: z.number().int().positive().nullable(),
});
export const verificationActivitySchema = z.strictObject({
  at: z.iso.datetime(),
  message: z.string().min(1).max(1000),
  kind: z.enum(["progress", "warning"]),
  stage: z.enum(["preparing", "visual", "tracking", "confirming"]).optional(),
  stepId: z.string().min(1).optional(),
});
export type VerificationActivity = z.infer<typeof verificationActivitySchema>;

export const runDetailsSchema = runSummarySchema.safeExtend({
  approvedPlan: approvedPlanSchema,
  receipt: receiptSchema.nullable(),
  partialFindings: z.array(findingSchema).max(LIMITS.steps).default([]),
  media: z.strictObject({
    width: z.number().int().positive(), height: z.number().int().positive(),
    frameCount: z.number().int().positive(), fps: z.literal(ANALYSIS_FPS),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).nullable(),
  tracks: z.array(conceptTrackSchema).max(4),
  activity: z.array(verificationActivitySchema).max(64).default([]),
  warnings: z.array(z.string()),
  timings: z.record(z.string(), z.number().nonnegative()),
});
export type TrackBox = z.infer<typeof trackBoxSchema>;
export type ConceptTrack = z.infer<typeof conceptTrackSchema>;
export type RunSummary = z.infer<typeof runSummarySchema>;
export type RunDetails = z.infer<typeof runDetailsSchema>;

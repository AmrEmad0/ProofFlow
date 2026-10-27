import { z } from "zod";
import { approvedPlanSchema } from "./proof-plan";
import { receiptSchema, runStateSchema } from "./receipt";

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
  id: z.uuid(), approvedVersionId: z.uuid(), state: runStateSchema,
  createdAt: z.string(), completedAt: z.string().nullable(), expiresAt: z.string(),
  error: z.string().nullable(), durationMs: z.number().int().positive().nullable(),
});
export const runDetailsSchema = runSummarySchema.safeExtend({
  approvedPlan: approvedPlanSchema,
  receipt: receiptSchema.nullable(),
  media: z.strictObject({
    width: z.number().int().positive(), height: z.number().int().positive(),
    frameCount: z.number().int().positive(), fps: z.literal(ANALYSIS_FPS),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).nullable(),
  tracks: z.array(conceptTrackSchema).max(4),
  warnings: z.array(z.string()),
  timings: z.record(z.string(), z.number().nonnegative()),
});
export type TrackBox = z.infer<typeof trackBoxSchema>;
export type ConceptTrack = z.infer<typeof conceptTrackSchema>;
export type RunSummary = z.infer<typeof runSummarySchema>;
export type RunDetails = z.infer<typeof runDetailsSchema>;

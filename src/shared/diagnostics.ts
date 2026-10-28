import { z } from "zod";
import { findingSchema } from "./receipt";
import { observationSchema } from "./observation";

const frame = z.number().int().nonnegative();
export const trackWindowSchema = z.strictObject({
  concept: z.string(), outcome: z.enum(["completed", "failed", "missing"]),
  selectedObjectId: z.string().nullable(),
  missingFrames: z.array(frame), multipleFrames: z.array(frame),
  objects: z.array(z.strictObject({
    objectId: z.string(), frames: frame,
    firstFrame: frame, lastFrame: frame,
    missingFrames: z.array(frame), duplicateFrames: z.array(frame),
  })),
});

export const stepCheckSchema = z.strictObject({
  stepId: z.string(), firstFrame: frame.nullable(), lastFrame: frame.nullable(),
  subject: trackWindowSchema.nullable(), target: trackWindowSchema.nullable(),
  regionCandidates: z.array(z.strictObject({
    objectId: z.string(), outsideFrame: frame.nullable(), qualifies: z.boolean(),
    subjectObjectId: z.string().optional(), endFrame: frame.nullable().optional(),
    containment: z.array(z.strictObject({ frameIndex: frame, ratio: z.number().min(0).max(1) })),
  })),
  decision: z.enum(["no_window", "contradictory_proposal", "ambiguous_proposal", "subject_track", "final_presence", "state_change", "target_track", "entry_geometry", "step_order"]),
  finding: findingSchema,
});

export const verificationDiagnosticsSchema = z.strictObject({
  ruleVersion: z.string(), checks: z.array(stepCheckSchema).max(3),
});

export const trackingDiagnosticSchema = z.strictObject({
  concept: z.string(), receivedBoxes: frame, retainedBoxes: frame, lowConfidenceBoxes: frame,
  confidenceThreshold: z.number(),
  issue: z.enum(["model_request", "incomplete_output", "parser_diagnostics", "invalid_geometry"]).nullable(),
});

export const runDiagnosticsSchema = z.strictObject({
  source: z.enum(["saved", "replayed"]), originalRuleVersion: z.string().nullable(),
  observation: observationSchema.nullable(),
  verification: verificationDiagnosticsSchema.nullable(),
  tracking: z.array(trackingDiagnosticSchema).max(4),
});

export type TrackWindow = z.infer<typeof trackWindowSchema>;
export type StepCheck = z.infer<typeof stepCheckSchema>;
export type VerificationDiagnostics = z.infer<typeof verificationDiagnosticsSchema>;
export type TrackingDiagnostic = z.infer<typeof trackingDiagnosticSchema>;
export type RunDiagnostics = z.infer<typeof runDiagnosticsSchema>;

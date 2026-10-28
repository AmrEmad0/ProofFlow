import { z } from "zod";
import { LIMITS } from "./proof-plan";

export const findingStatusSchema = z.enum(["observed", "not_observed", "uncertain"]);
export const runStateSchema = z.enum([
  "queued", "preprocessing", "uploading", "analyzing", "verifying", "completed", "failed",
]);
export type FindingStatus = z.infer<typeof findingStatusSchema>;
export type RunState = z.infer<typeof runStateSchema>;

export const findingSchema = z.strictObject({
  stepId: z.string().min(1),
  status: findingStatusSchema,
  startMs: z.number().int().nonnegative().nullable(),
  endMs: z.number().int().nonnegative().nullable(),
  explanation: z.string().min(1),
  satisfiedRequirementIds: z.array(z.string()).optional(),
  relationships: z.array(z.strictObject({
    id: z.string(), description: z.string(), status: findingStatusSchema,
  })).optional(),
  moments: z.array(z.strictObject({
    phase: z.enum(["before", "action", "after"]), timestampMs: z.number().int().nonnegative(),
    description: z.string().min(1),
  })).max(3).optional(),
  evidence: z.array(z.strictObject({
    concept: z.string().min(1),
    objectId: z.string().min(1),
    frameIndex: z.number().int().nonnegative(),
  })),
}).superRefine((finding, ctx) => {
  if ((finding.startMs === null) !== (finding.endMs === null)
    || (finding.startMs !== null && finding.endMs !== null && finding.endMs < finding.startMs)) {
    ctx.addIssue({ code: "custom", path: ["endMs"], message: "Evidence needs a complete, ordered time window." });
  }
  if (finding.status === "observed" && (finding.startMs === null || finding.endMs === null || new Set(finding.evidence.map((item) => item.frameIndex)).size < 2)) {
    ctx.addIssue({ code: "custom", path: ["evidence"], message: "An observed finding needs a time window and inspectable evidence from multiple frames." });
  }
});

export const receiptSchema = z.strictObject({
  runId: z.uuid(),
  approvedVersionId: z.uuid(),
  contractHash: z.string().regex(/^[a-f0-9]{64}$/),
  findings: z.array(findingSchema).min(1).max(LIMITS.steps),
  provenance: z.strictObject({
    museModel: z.literal("muse-spark-1.3-contributor"),
    samModel: z.literal("sam-3.1"),
    promptVersion: z.string().min(1),
    verificationRuleVersion: z.string().min(1),
    createdAt: z.iso.datetime(),
  }),
});
export type Finding = z.infer<typeof findingSchema>;
export type Receipt = z.infer<typeof receiptSchema>;

export function isActiveRun(state: RunState): boolean {
  return state !== "completed" && state !== "failed";
}

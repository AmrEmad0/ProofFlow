import { z } from "zod";
import { LIMITS } from "./proof-plan";

const candidateSchema = z.strictObject({
  stepId: z.string().min(1),
  startMs: z.number().int().min(0).max(LIMITS.durationMs).nullable(),
  endMs: z.number().int().min(0).max(LIMITS.durationMs).nullable(),
  visibleBefore: z.string(), visibleAfter: z.string(), observation: z.string(),
  ambiguities: z.array(z.string()),
});

export const museAnalysisSchema = z.strictObject({
  candidates: z.array(candidateSchema).max(LIMITS.steps), omissions: z.array(z.string()),
});

export const legacyObservationSchema = museAnalysisSchema.extend({
  candidates: z.array(candidateSchema.extend({
    actionVisible: z.boolean(), beforeMatches: z.boolean(), afterMatches: z.boolean(),
    visibility: z.enum(["clear", "occluded", "unclear"]),
    nonOccurrenceVisible: z.boolean(), searchComplete: z.boolean(),
  })).max(LIMITS.steps),
});

const momentSchema = z.strictObject({
  timestampMs: z.number().int().min(0).max(LIMITS.durationMs),
  description: z.string().trim().min(1).max(600),
  visible: z.boolean(), matchesRequirement: z.boolean(),
});
const objectSchema = z.strictObject({ concept: z.string().trim().min(1).max(120), description: z.string().trim().min(1).max(120) });
const groundingSchema = z.strictObject({
  concept: z.string().min(1), objectId: z.string().min(1).describe("Exact raw SAM objectId from the allowed references; never the full display label"), timestampMs: z.number().int().min(0).max(LIMITS.durationMs),
});
export const objectAssessmentSchema = groundingSchema.extend({
  matchesIntendedObject: z.boolean(), decisiveDetailsVisible: z.boolean(),
  description: z.string().trim().min(1).max(600),
});
export const requirementAssessmentSchema = z.strictObject({
  requirementId: z.string().min(1), timestampMs: z.number().int().min(0).max(LIMITS.durationMs),
  visible: z.boolean(), matchesRequirement: z.boolean(), decisiveDetailsVisible: z.boolean(),
  description: z.string().trim().min(1).max(600),
});
export const actionIntervalSchema = z.strictObject({
  startMs: z.number().int().min(0).max(LIMITS.durationMs), endMs: z.number().int().min(0).max(LIMITS.durationMs),
  boundariesVisible: z.boolean(),
});
export const evidenceCandidateSchema = legacyObservationSchema.shape.candidates.element.extend({
  requirementAssessments: z.array(requirementAssessmentSchema).max(3),
  actionInterval: actionIntervalSchema.nullable(),
  before: momentSchema.nullable(), action: momentSchema.nullable(), after: momentSchema.nullable(),
  subject: objectSchema, target: objectSchema.nullable(),
  contradictions: z.array(z.string().min(1).max(600)).max(10),
  grounding: z.array(groundingSchema).max(12),
  objectAssessments: z.array(objectAssessmentSchema).max(48).default([]),
});
export const currentObservationSchema = z.strictObject({
  schemaVersion: z.literal(2), candidates: z.array(evidenceCandidateSchema).max(LIMITS.steps),
  omissions: z.array(z.string()).max(10),
});
// Saved observations remain readable; only the current shape is requested from models.
export const observationSchema = legacyObservationSchema.extend({
  schemaVersion: z.literal(2).optional(),
  candidates: z.array(legacyObservationSchema.shape.candidates.element.extend({
    requirementAssessments: z.array(requirementAssessmentSchema).max(3).optional(),
    actionInterval: actionIntervalSchema.nullable().optional(),
    before: momentSchema.nullable().optional(), action: momentSchema.nullable().optional(), after: momentSchema.nullable().optional(),
    subject: objectSchema.optional(), target: objectSchema.nullable().optional(),
    objectAssessments: z.array(objectAssessmentSchema).max(48).optional(),
    contradictions: z.array(z.string()).optional(), grounding: z.array(groundingSchema).optional(),
  })).max(LIMITS.steps),
});

export type Observation = z.infer<typeof observationSchema>;

export function structuredConflicts(candidate: Observation["candidates"][number]): string[] {
  const conflicts = [...candidate.contradictions ?? []];
  const moments = [candidate.before, candidate.action, candidate.after].filter(moment => moment != null);
  if (moments.some((moment, index) => index > 0 && moment.timestampMs < moments[index - 1]!.timestampMs)) conflicts.push("Evidence timestamps conflict with before/action/after order.");
  if (candidate.actionVisible && candidate.nonOccurrenceVisible) conflicts.push("Action and non-occurrence are both asserted.");
  for (const [phase, matches] of [["before", candidate.beforeMatches], ["action", candidate.actionVisible], ["after", candidate.afterMatches]] as const) {
    const moment = candidate[phase];
    if (matches && moment && (!moment.visible || !moment.matchesRequirement)) conflicts.push(`The ${phase} assertion conflicts with its timestamped evidence.`);
  }
  return conflicts;
}

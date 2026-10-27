import { z } from "zod";

const candidateSchema = z.strictObject({
  stepId: z.string().min(1),
  startMs: z.number().int().min(0).max(20_000).nullable(),
  endMs: z.number().int().min(0).max(20_000).nullable(),
  visibleBefore: z.string(), visibleAfter: z.string(), observation: z.string(),
  ambiguities: z.array(z.string()),
});

export const museAnalysisSchema = z.strictObject({
  candidates: z.array(candidateSchema).max(3), omissions: z.array(z.string()),
});

export const observationSchema = museAnalysisSchema.extend({
  candidates: z.array(candidateSchema.extend({
    actionVisible: z.boolean(), beforeMatches: z.boolean(), afterMatches: z.boolean(),
    visibility: z.enum(["clear", "occluded", "unclear"]),
    nonOccurrenceVisible: z.boolean(), searchComplete: z.boolean(),
  })).max(3),
});

export type Observation = z.infer<typeof observationSchema>;

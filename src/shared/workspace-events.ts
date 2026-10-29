import { z } from "zod";

export const verificationReadinessSchema = z.object({ available: z.boolean(), retentionHours: z.number() });
export const workspaceEventSchema = z.discriminatedUnion("type", [
  verificationReadinessSchema.extend({ type: z.literal("ready") }),
  verificationReadinessSchema.extend({ type: z.literal("heartbeat") }),
  z.object({ type: z.literal("run.updated"), planId: z.uuid(), runId: z.uuid() }),
  z.object({ type: z.literal("triggers.updated"), planId: z.uuid() }),
]);
export type WorkspaceEvent = z.infer<typeof workspaceEventSchema>;

import { z } from "zod";

export const DEMO_FEED_STOPPED = "Stopped with the demo feed.";
export const DEMO_FEED_ID = "__demo_feed__";
export const triggerSourceSchema = z.enum(["manual", "scanner", "api"]);
export const triggerSettingsSchema = z.strictObject({
  start: triggerSourceSchema,
  finish: z.enum(["manual", "api", "clip"]),
  recording: z.strictObject({ kind: z.enum(["demo", "camera"]), id: z.string().min(1).max(200), seconds: z.number().int().min(1).max(30) }).optional(),
});
export const defaultTriggerSettings = { start: "manual", finish: "manual" } as const;
export const triggerConfigurationSchema = z.strictObject({
  revision: z.number().int().nonnegative(),
  settings: triggerSettingsSchema,
  apiKeyConfigured: z.boolean(),
  links: z.strictObject({ start: z.string().nullable(), finish: z.string().nullable() }),
});
export const triggerEventSchema = z.strictObject({
  eventId: z.uuid(),
  action: z.enum(["start", "finish", "cancel"]),
  reference: z.string().trim().min(1).max(120).optional(),
  sessionId: z.uuid().optional(),
});
export const taskSessionSchema = z.strictObject({
  id: z.uuid(), planId: z.uuid(), approvedVersionId: z.uuid(),
  contractHash: z.string().regex(/^[a-f0-9]{64}$/),
  configurationRevision: z.number().int().nonnegative(), settings: triggerSettingsSchema,
  reference: z.string().nullable(), source: triggerSourceSchema,
  state: z.enum(["active", "finished", "cancelled"]),
  captureState: z.enum(["queued", "capturing", "captured", "done", "failed"]).nullable().optional(),
  demoFilename: z.string().nullable().optional(),
  captureError: z.string().nullable().optional(),
  startedAt: z.string(), endedAt: z.string().nullable(), runId: z.uuid().nullable(),
});
export const triggerOverviewSchema = z.strictObject({
  configuration: triggerConfigurationSchema,
  sessions: z.array(taskSessionSchema),
  feed: z.strictObject({ running: z.boolean(), position: z.number().int().nonnegative(), error: z.string().nullable() }).nullable().optional(),
});
export type TriggerSettings = z.infer<typeof triggerSettingsSchema>;
export type TriggerEvent = z.infer<typeof triggerEventSchema>;
export type TriggerSource = z.infer<typeof triggerSourceSchema>;
export type TaskSession = z.infer<typeof taskSessionSchema>;

export const recordingSourcesSchema = z.array(z.strictObject({ kind: z.enum(["demo", "camera"]), id: z.string(), label: z.string() }));

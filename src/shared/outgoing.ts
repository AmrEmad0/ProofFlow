import { z } from "zod";
import { findingStatusSchema } from "./receipt";
import type { RunDetails } from "./verification";

export const outgoingSettingsSchema = z.strictObject({
  endpoint: z.string().trim().max(2048).url().nullable(),
});
export const outgoingPayloadSchema = z.strictObject({
  runId: z.uuid(), reference: z.string().optional(),
  tasks: z.array(z.strictObject({ id: z.string(), label: z.string(), status: findingStatusSchema })),
});
export type OutgoingPayload = z.infer<typeof outgoingPayloadSchema>;
export const outgoingDeliverySchema = z.strictObject({
  state: z.enum(["pending", "sending", "delivered", "failed"]), attempts: z.number(),
  httpStatus: z.number().nullable(), error: z.string().nullable(), deliveredAt: z.string().nullable(),
});
export const outgoingOverviewSchema = z.strictObject({
  endpoint: z.string().nullable(), delivery: outgoingDeliverySchema.nullable(),
});

export function outgoingPayload(run: RunDetails): OutgoingPayload {
  if (run.state !== "completed" || !run.receipt || !run.completedAt) throw new Error("Wait for completed video evidence before reporting.");
  return outgoingPayloadSchema.parse({
    runId: run.id,
    ...(run.taskReference ? { reference: run.taskReference } : {}),
    tasks: run.approvedPlan.steps.map(step => {
      const finding = run.receipt!.findings.find(item => item.stepId === step.id);
      if (!finding) throw new Error("Completed evidence is missing a task verdict.");
      return { id: step.id, label: step.label, status: finding.status };
    }),
  });
}

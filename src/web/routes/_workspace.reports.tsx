import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const reportSearchSchema = z.object({ planId: z.uuid().optional(), from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });
export const Route = createFileRoute("/_workspace/reports")({ validateSearch: reportSearchSchema });

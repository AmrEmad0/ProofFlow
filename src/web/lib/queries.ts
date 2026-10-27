import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "./eden";
import { savedPlanSchema } from "../../shared/planner";
import { runDetailsSchema, runSummarySchema } from "../../shared/verification";
import { isActiveRun } from "../../shared/receipt";

const healthStatusSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  services: z.object({ database: z.boolean(), ffmpeg: z.boolean(), ffprobe: z.boolean() }),
  models: z.object({ configured: z.boolean() }),
  capabilities: z.object({ templates: z.boolean(), planning: z.boolean(), approval: z.boolean(), videoAnalysis: z.boolean() }),
});

export const healthQuery = queryOptions({
  queryKey: ["health"],
  queryFn: async () => {
    const { data, error } = await api.api.health.get();
    const result = healthStatusSchema.safeParse(data ?? error?.value);
    if (!result.success) throw new Error("Service readiness check failed. Check the API connection.");
    return result.data;
  },
  refetchInterval: 30_000,
});

export const verificationStatusQuery = queryOptions({
  queryKey: ["verification-status"],
  queryFn: async () => {
    const { data, error } = await api.api.verification.status.get();
    if (error) throw apiError(error.value, "Video verification could not be reached.");
    return z.object({ available: z.boolean(), retentionHours: z.number() }).parse(data);
  },
  refetchInterval: 30_000,
});

export const packproofQuery = queryOptions({
  queryKey: ["templates", "packproof"],
  queryFn: async () => {
    const { data, error } = await api.api.templates.packproof.get();
    if (error) throw new Error("PackProof could not be loaded. Check the API connection.");
    return data;
  },
  staleTime: Infinity,
});

export function apiError(value: unknown, fallback: string): Error {
  if (value && typeof value === "object" && "error" in value && typeof value.error === "string") return new Error(value.error);
  return new Error(fallback);
}

export const plansQuery = queryOptions({
  queryKey: ["plans"],
  queryFn: async () => {
    const { data, error } = await api.api.plans.get();
    if (error) throw apiError(error.value, "Your templates could not be loaded.");
    return z.array(z.object({ id: z.uuid(), title: z.string(), status: z.enum(["draft", "approved"]) })).parse(data);
  },
});

export const plannerStatusQuery = queryOptions({
  queryKey: ["planner-status"],
  queryFn: async () => {
    const { data, error } = await api.api.planner.status.get();
    if (error) throw new Error("The planning service could not be reached.");
    return z.object({ configured: z.boolean(), model: z.string() }).parse(data);
  },
  refetchInterval: 30_000,
});

export function savedPlanQuery(id: string | null) {
  return queryOptions({
    queryKey: ["plans", id],
    queryFn: async () => {
      if (!id) throw new Error("Choose a template to continue.");
      const { data, error } = await api.api.plans({ id }).get();
      if (error) throw apiError(error.value, "This template could not be loaded.");
      return savedPlanSchema.parse(data);
    },
    enabled: Boolean(id),
    retry: false,
  });
}

export function planRunsQuery(versionId: string | null) {
  return queryOptions({
    queryKey: ["runs", versionId],
    queryFn: async () => {
      if (!versionId) throw new Error("Choose an approved plan to view its videos.");
      const result = await api.api.runs.get({ query: { approvedVersionId: versionId } });
      if (result.error) throw apiError(result.error.value, "Saved video runs could not be loaded.");
      return z.array(runSummarySchema).parse(result.data);
    },
    enabled: Boolean(versionId),
    retry: false,
    refetchInterval: (query) => query.state.data?.some((run) => isActiveRun(run.state)) ? 2000 : false,
  });
}

export function runDetailsQuery(id: string | null) {
  return queryOptions({
    queryKey: ["run", id],
    enabled: Boolean(id),
    queryFn: async () => {
      if (!id) throw new Error("Choose a video run.");
      const { data, error } = await api.api.runs({ id }).get();
      if (error) throw Object.assign(apiError(error.value, "This video run could not be loaded."), { status: error.status });
      return runDetailsSchema.parse(data);
    },
    retry: false,
    refetchInterval: (query) => {
      const error = query.state.error;
      if (error && "status" in error && (error.status === 404 || error.status === 403)) return false;
      if (query.state.data && !isActiveRun(query.state.data.state)) return false;
      return query.state.error ? 5000 : 1000;
    },
  });
}

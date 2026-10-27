import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "./eden";
import { savedPlanSchema } from "../../shared/planner";

export const healthQuery = queryOptions({
  queryKey: ["health"],
  queryFn: async () => {
    const { data, error } = await api.api.health.get();
    if (error) throw new Error("Service readiness check failed. Check the API and FFmpeg installation.");
    return data;
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

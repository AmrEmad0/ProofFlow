import { queryOptions } from "@tanstack/react-query";
import { api } from "./eden";

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

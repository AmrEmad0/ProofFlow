import OpenAI from "openai";
import type { Config } from "../config";

export const MODELS = { muse: "muse-spark-1.3", sam: "sam-3.1" } as const;
export const PROMPT_VERSION = "2026-10-29.3";

// Lazy creation keeps health/template routes available without credentials.
export function createMetaClient(config: Config): OpenAI {
  if (!config.modelConfigured) throw new Error("MODEL_API_KEY is not configured");
  return new OpenAI({
    apiKey: config.MODEL_API_KEY,
    baseURL: config.META_API_BASE_URL,
    timeout: 120_000,
    maxRetries: 1,
  });
}

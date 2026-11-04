import OpenAI from "openai";
import type { Config } from "../config";

export const MODELS = { muse: "muse-spark-1.3", sam: "sam-3.1" } as const;
export const PROMPT_VERSION = "2026-10-29.3";

// Lazy creation keeps health/template routes available without credentials.
export function createMetaClient(config: Config): OpenAI {
  if (!config.modelConfigured) throw new Error("MODEL_API_KEY is not configured");
  const configured = new URL(config.META_API_BASE_URL);
  const target = configured.searchParams.get("url");
  let baseURL = config.META_API_BASE_URL;
  let proxyFetch: ((input: string | URL | Request, init?: RequestInit) => Promise<Response>) | undefined;
  if (target !== null) {
    const upstream = new URL(target);
    if (configured.protocol !== "https:" || upstream.origin !== "https://api.meta.ai"
      || upstream.pathname.replace(/\/+$/, "") !== "/v1" || upstream.search || upstream.hash || upstream.username || upstream.password) {
      throw new Error("The Meta query proxy requires HTTPS and the Meta API v1 upstream.");
    }
    baseURL = upstream.href.replace(/\/+$/, "");
    proxyFetch = (input, init) => {
      const request = new Request(input, init);
      const destination = new URL(request.url);
      if (destination.origin !== upstream.origin || !destination.pathname.startsWith("/v1/")) {
        throw new Error("The Meta query proxy cannot forward this destination.");
      }
      // Append SDK paths to the upstream query value; preserve multipart bodies and SSE.
      const proxy = new URL(configured);
      proxy.searchParams.set("url", destination.href);
      return fetch(new Request(proxy, request), { redirect: "error" });
    };
  }
  return new OpenAI({
    apiKey: config.MODEL_API_KEY,
    baseURL,
    ...(proxyFetch ? { fetch: proxyFetch } : {}),
    timeout: config.META_REQUEST_TIMEOUT_MS,
    maxRetries: 1,
  });
}

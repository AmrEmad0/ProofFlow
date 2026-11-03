import OpenAI from "openai";
import { ZodError } from "zod";

const observationErrors = new Set([
  "Muse returned unknown or duplicate step IDs.",
  "Muse returned an invalid event window.",
  "Muse returned an unknown or duplicate evidence requirement.",
  "Muse returned requirement evidence outside the clip.",
  "Muse returned an invalid action interval.",
  "Muse returned evidence outside the clip.",
  "Muse changed an approved concept.",
  "Muse omitted an approved target.",
  "Muse returned an invalid grounding reference.",
  "Muse referenced an object outside the supplied grounding frames.",
  "Incomplete or ambiguous SAM output.",
  "SAM coordinate dimensions do not match the analysis copy.",
  "SAM frame outside the analysis copy.",
  "MODEL_API_KEY is not configured",
  "Per-video model request budget exhausted.",
  "Verification worker lease lost.",
  "Verification run is no longer active.",
  "Track artifacts could not be saved.",
  "Invalid normalized frame timing.",
]);

export function verificationError(error: unknown, secret?: string) {
  function identifier(value: unknown): string | undefined {
    if (typeof value !== "string" || !/^[a-zA-Z0-9_.:[\]-]{1,128}$/.test(value)
      || /^(LLM_|sk-|Bearer)/i.test(value) || (secret && value.includes(secret))) return undefined;
    return value;
  }
  // SDK messages, bodies, headers and stacks can contain credentials or submitted content.
  if (error instanceof OpenAI.APIError) {
    return {
      kind: error instanceof OpenAI.APIConnectionTimeoutError ? "timeout"
        : error instanceof OpenAI.APIConnectionError ? "connection" : "api",
      status: error.status,
      code: identifier(error.code),
      type: identifier(error.type),
      parameter: identifier(error.param),
      requestId: identifier(error.requestID),
    };
  }
  if (error instanceof ZodError) return { kind: "invalid_model_data", issues: error.issues.map(issue => issue.code).slice(0, 20) };
  if (error instanceof SyntaxError) return { kind: "invalid_model_json" };
  if (error instanceof Error && observationErrors.has(error.message)) return { kind: "validation", reason: error.message };
  if (error instanceof Error && /^Muse video observation did not complete \((incomplete|failed|cancelled|queued|in_progress): (max_output_tokens|content_filter|no completion reason)\)\.$/.test(error.message)) {
    return { kind: "incomplete_model_response", reason: error.message };
  }
  return { kind: "internal" };
}

export type VerificationError = ReturnType<typeof verificationError>;

export function verificationFailureHint(error: VerificationError): string {
  if (error.kind === "api") {
    if (error.status === 401) return "Meta rejected authentication. Check the server API key.";
    if (error.status === 402) return "Meta reported a billing issue. Check the API account billing status.";
    if (error.status === 403) return "Meta denied this request. Check model access and account permissions.";
    if (error.status === 429) return "Meta reported a rate or quota limit. Check account limits before retrying.";
    if (error.status !== undefined && error.status >= 500) return `Meta's service failed (HTTP ${error.status}). Try a new run later.`;
    return `Meta rejected the model request${error.status ? ` (HTTP ${error.status})` : ""}. Check the server diagnostics before retrying.`;
  }
  if (error.kind === "timeout" || error.kind === "connection") return "The server could not reach Meta reliably. Check outbound connectivity before retrying.";
  if (error.kind === "invalid_model_data" || error.kind === "invalid_model_json" || error.kind === "validation") return "The analysis could not pass validation. Check the server diagnostics before retrying.";
  if (error.kind === "incomplete_model_response") return "Meta did not complete the analysis. Check the server diagnostics before retrying.";
  return "Check the server diagnostics and Meta model access before retrying.";
}

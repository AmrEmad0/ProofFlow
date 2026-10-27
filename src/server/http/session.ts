import { createHash } from "node:crypto";
import { PlannerError } from "../planner/store";
import type { Config } from "../config";

export function sessionToken(request: Request): string | null {
  const token = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith("proofflow_session="))?.slice("proofflow_session=".length);
  return token && /^[a-f0-9]{64}$/.test(token) ? token : null;
}

export function sessionHash(request: Request): string {
  const token = sessionToken(request);
  if (!token) throw new PlannerError(404, "This item could not be found in your workspace.");
  return createHash("sha256").update(token).digest("hex");
}

export function workspaceOrigins(config: Config): string[] {
  const configured = new URL(config.WEB_ORIGIN);
  const origins = new Set([configured.origin]);
  const loopbackHosts = ["localhost", "127.0.0.1", "[::1]"];
  if (config.NODE_ENV === "development" && loopbackHosts.includes(configured.hostname)) {
    for (const hostname of loopbackHosts) {
      const alias = new URL(configured.origin);
      alias.hostname = hostname;
      origins.add(alias.origin);
    }
  }
  return [...origins];
}

export function requireWorkspaceOrigin(request: Request, config: Config): void {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin && !(config.NODE_ENV === "development" && workspaceOrigins(config).includes(origin))) {
    throw new PlannerError(403, "This request must come from your ProofFlow workspace.");
  }
}

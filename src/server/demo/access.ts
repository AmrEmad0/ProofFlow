import { PACK_DEMO, demoVideo } from "../../shared/demo";

export const DEMO_OWNER = "public-pack-order-demo";

export function isDemoRead(request: Request): boolean {
  const url = new URL(request.url);
  const runId = url.pathname.split("/")[3] ?? "";
  const publicRun = url.pathname.startsWith("/api/runs/") && Boolean(demoVideo(runId));
  if (request.method === "POST" && publicRun && url.pathname === `/api/runs/${runId}/messages`) return true;
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  return url.pathname === `/api/plans/${PACK_DEMO.planId}` || url.pathname.startsWith(`/api/plans/${PACK_DEMO.planId}/`)
    || publicRun
    || (url.pathname === "/api/runs" && (url.searchParams.get("planId") === PACK_DEMO.planId || url.searchParams.get("approvedVersionId") === PACK_DEMO.versionId))
    || (url.pathname === "/api/reports" && url.searchParams.get("planId") === PACK_DEMO.planId);
}

export function isDemoMutation(request: Request): boolean {
  if (request.method === "GET" || request.method === "HEAD") return false;
  const path = new URL(request.url).pathname;
  const runId = path.split("/")[3] ?? "";
  const publicRun = path.startsWith("/api/runs/") && Boolean(demoVideo(runId));
  if (request.method === "POST" && publicRun && path === `/api/runs/${runId}/messages`) return false;
  if (request.method === "POST" && path === `/api/plans/${PACK_DEMO.planId}/copy`) return false;
  return path === `/api/plans/${PACK_DEMO.planId}` || path.startsWith(`/api/plans/${PACK_DEMO.planId}/`) || publicRun;
}

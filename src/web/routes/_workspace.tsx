import { createFileRoute, useParams, useRouterState } from "@tanstack/react-router";
import { PlannerWorkspace } from "@/components/planner/planner-workspace";

export const Route = createFileRoute("/_workspace")({ component: WorkspaceLayout });

function WorkspaceLayout() {
  const planId = useParams({ strict: false, select: (params) => params.planId ?? null });
  const initialStarter = useRouterState({ select: (state) => state.location.pathname === "/packproof" });
  const reviewMode = useRouterState({ select: (state) => state.location.pathname === "/review" });
  const reportsMode = useRouterState({ select: (state) => state.location.pathname === "/reports" });
  return <PlannerWorkspace reportsMode={reportsMode} reviewMode={reviewMode} planId={planId} initialStarter={initialStarter} />;
}

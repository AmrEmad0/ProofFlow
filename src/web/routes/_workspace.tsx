import { createFileRoute, useParams, useRouterState } from "@tanstack/react-router";
import { PlannerWorkspace } from "@/components/planner/planner-workspace";

export const Route = createFileRoute("/_workspace")({ component: WorkspaceLayout });

function WorkspaceLayout() {
  const planId = useParams({ strict: false, select: (params) => params.planId ?? null });
  const initialStarter = useRouterState({ select: (state) => state.location.pathname === "/packproof" });
  return <PlannerWorkspace planId={planId} initialStarter={initialStarter} />;
}

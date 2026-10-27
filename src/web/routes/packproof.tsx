import { createFileRoute } from "@tanstack/react-router";
import { PlannerWorkspace } from "@/components/planner/planner-workspace";

export const Route = createFileRoute("/packproof")({ component: () => <PlannerWorkspace initialStarter /> });

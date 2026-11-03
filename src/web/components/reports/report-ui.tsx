import type { FindingStatus } from "../../../shared/receipt";
import { outcomeLabels } from "./report-charts";

export const reportControl = "min-h-10 min-w-0 rounded-lg border bg-background px-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-primary";

export function Verdict({ status }: { status: FindingStatus }) {
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-medium ${status === "observed" ? "bg-emerald-700/10 text-emerald-800 dark:text-emerald-300" : status === "uncertain" ? "bg-amber-600/10 text-amber-900 dark:text-amber-300" : "bg-muted text-foreground"}`}><span className={`size-1.5 rounded-full ${status === "observed" ? "bg-emerald-700" : status === "uncertain" ? "bg-amber-700" : "bg-slate-500"}`} />{outcomeLabels[status]}</span>;
}


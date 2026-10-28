import { CircleAlert, LoaderCircle, Check } from "lucide-react";
import { isActiveRun, type RunState } from "../../../shared/receipt";
import type { RunDetails } from "../../../shared/verification";

const headings: Record<RunState, string> = {
  queued: "Waiting to start", preprocessing: "Preparing video", uploading: "Sending video",
  analyzing: "Finding evidence", verifying: "Confirming findings", completed: "Ready for review", failed: "Video check failed",
};

export function VerificationStatus({ run }: { run: RunDetails }) {
  const active = isActiveRun(run.state);
  const findings = run.state === "completed" ? run.receipt?.findings ?? [] : active ? run.partialFindings : [];
  const Icon = active ? LoaderCircle : run.state === "failed" ? CircleAlert : Check;
  return <section className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-1 py-1.5" aria-label="Verification status">
    <div className="flex min-w-0 items-center gap-2.5">
      <Icon className={`size-4 shrink-0 ${active ? "animate-spin text-primary" : run.state === "failed" ? "text-destructive" : "text-emerald-700"}`} aria-hidden="true" />
      <div className="min-w-0"><h3 className="text-[13px] font-medium" aria-live="polite">{headings[run.state]}{active && ` · ${findings.length}/${run.approvedPlan.steps.length} checks updated`}</h3>
        {active && <p className="sr-only">Checks update as evidence arrives. Early results may change during confirmation.</p>}
        {run.state === "failed" && <p className="text-sm text-destructive">{run.error ?? "No verdict was produced. Choose another recording."}</p>}
      </div>
    </div>
    {run.state === "completed" && <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]" aria-label="Check result summary">
      <span className="font-medium text-emerald-700">{findings.filter(item => item.status === "observed").length} observed</span>
      <span className="text-muted-foreground">{findings.filter(item => item.status === "not_observed").length} not observed</span>
      <span className="text-amber-800">{findings.filter(item => item.status === "uncertain").length} uncertain</span>
    </div>}
  </section>;
}

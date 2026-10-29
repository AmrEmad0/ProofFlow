import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { CircleAlert, LoaderCircle, Check, ChevronDown } from "lucide-react";
import { subscribeWorkspaceConnection, workspaceStreamConnected } from "@/lib/workspace-events";
import { verificationStage, verificationStages } from "@/lib/verification-progress";
import { DEMO_FEED_STOPPED } from "../../../shared/triggers";
import { isActiveRun, type RunState } from "../../../shared/receipt";
import type { RunDetails } from "../../../shared/verification";

const headings: Record<RunState, string> = {
  queued: "Waiting to start", preprocessing: "Preparing video", uploading: "Sending video",
  analyzing: "Finding evidence", verifying: "Confirming findings", completed: "Ready for review", failed: "Video check failed",
};

export function VerificationStatus({ run }: { run: RunDetails }) {
  const active = isActiveRun(run.state);
  const activityId = useId();
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const activityOpen = expandedRunId === run.id;
  const connected = useSyncExternalStore(subscribeWorkspaceConnection, workspaceStreamConnected, () => false);
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active, run.id]);
  const elapsed = Math.max(0, Math.floor((now - Date.parse(run.createdAt)) / 1000));
  const stage = verificationStage(run);
  const latest = run.activity.at(-1);
  const findings = run.state === "completed" ? run.receipt?.findings ?? [] : active ? run.partialFindings : [];
  const unresolvedRelationships = new Set(findings.flatMap(item => item.relationships?.filter(rel => rel.status !== "observed").map(rel => rel.id) ?? [])).size;
  const Icon = active ? LoaderCircle : run.state === "failed" ? CircleAlert : Check;
  return <section className="flex flex-col gap-2 px-1 py-1.5" aria-label="Verification status">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex min-w-0 items-center gap-2.5">
        <Icon className={`size-4 shrink-0 ${active ? "animate-spin text-primary" : run.state === "failed" ? "text-destructive" : "text-emerald-700"}`} aria-hidden="true" />
        <div className="min-w-0"><h3 className="text-[13px] font-medium" aria-live="polite">{run.error === DEMO_FEED_STOPPED ? "Demo recording stopped" : headings[run.state]}{active && ` · ${findings.length}/${run.approvedPlan.steps.length} preliminary findings ready`}</h3>
          {run.state === "failed" && <p className="text-sm text-destructive">{run.error ?? "No verdict was produced. Choose another recording."}</p>}
        </div>
      </div>
      {run.state === "completed" && <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] sm:border-l sm:pl-4" aria-label="Check result summary">
        <span className="font-medium text-emerald-700">{findings.filter(item => item.status === "observed").length} observed</span>
        <span className="text-muted-foreground">{findings.filter(item => item.status === "not_observed").length} not observed</span>
        <span className={findings.some(item => item.status === "uncertain") ? "text-amber-800" : "text-muted-foreground"}>{findings.filter(item => item.status === "uncertain").length} uncertain</span>
        {run.approvedPlan.schemaVersion === 2 && unresolvedRelationships > 0 && <span className="text-amber-800">{unresolvedRelationships} relationships unresolved or contradicted</span>}
      </div>}
      {active && <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        <span className="tabular-nums" aria-label="Elapsed time">Elapsed {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}</span>
        <span role="status" title={connected ? "Progress updates arrive automatically as analysis milestones finish." : "Reconnecting to live updates. Active recordings refresh every 15 seconds."} className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`size-1.5 rounded-full ${connected ? "bg-emerald-600" : "bg-amber-600"}`} />{connected ? "Live updates connected" : "Reconnecting · refreshing every 15s"}</span>
      </div>}
      {run.activity.length > 0 && <button type="button" aria-expanded={activityOpen} aria-controls={activityId} onClick={() => setExpandedRunId(activityOpen ? null : run.id)} className={`inline-flex shrink-0 items-center gap-1 rounded py-1 text-[11px] text-muted-foreground hover:text-foreground ${active ? "" : "ml-auto"}`}>
        Analysis activity<ChevronDown className={`size-3 transition-transform ${activityOpen ? "rotate-180" : ""}`} aria-hidden="true" />
      </button>}
    </div>
    {active && <p role="status" className={`text-[11px] leading-5 sm:pl-[26px] ${latest?.kind === "warning" ? "text-amber-800" : "text-muted-foreground"}`}>{latest?.message ?? (run.state === "queued" ? "Your video is queued. Analysis will start when the worker is available." : headings[run.state])}</p>}
    {active && <p className="sr-only">Preliminary results may change during confirmation.</p>}
    {run.activity.length > 0 && <div id={activityId} hidden={!activityOpen} className="rounded-lg border bg-card p-3">
      {active && <div className="mb-3">
      <ol className="flex flex-wrap gap-x-5 gap-y-2 text-[11px]" aria-label="Analysis stages">{verificationStages.map((label, index) => <li key={label} aria-current={run.state !== "queued" && index === stage ? "step" : undefined} className={`flex items-center gap-1.5 ${index === stage ? "font-medium text-primary" : "text-muted-foreground"}`}>
        {index < stage ? <Check className="size-3" aria-hidden="true" /> : <span aria-hidden="true" className={`flex size-4 items-center justify-center rounded-full border text-[9px] ${index === stage ? "border-primary/40 bg-primary/5" : ""}`}>{index + 1}</span>}{label}
      </li>)}</ol>
      </div>}
      <ol className="max-h-48 space-y-2 overflow-y-auto text-[11px] text-muted-foreground" aria-label="Analysis activity history">{run.activity.map((event, index) => <li key={`${event.at}-${index}`} className={`flex items-start gap-3 leading-5 ${event.kind === "warning" ? "text-amber-800" : ""}`}>
        <time dateTime={event.at} className="shrink-0 tabular-nums">{new Date(event.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</time><span>{event.message}</span>
      </li>)}</ol>
    </div>}
  </section>;
}

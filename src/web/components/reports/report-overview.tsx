import { ArrowRight, CircleCheck } from "lucide-react";
import type { Report } from "../../../shared/reports";
import { percent, outcomes, outcomeLabels } from "./report-charts";
import { Verdict } from "./report-ui";

export function ReportOverview({ data, onInspect }: { data: Report; onInspect: (filter: string) => void }) {
  const { totals } = data;
  const actions = [
    { count: totals.pending, title: "Awaiting first review", detail: "Inspect the footage and record a human decision.", filter: "pending", unit: "checks", action: "Review checks" },
    { count: totals.followUp, title: "Review still uncertain", detail: "Revisit the review note and footage; clearer footage may be needed.", filter: "followup", unit: "checks", action: "Inspect follow-ups" },
    { count: totals.failed, title: "Processing failed", detail: "Open the affected videos to inspect errors before retrying.", filter: "failed", unit: "videos", action: "Inspect failed videos" },
    { count: totals.missingChecks, title: "Findings missing", detail: "Expected checks have no final result. Inspect these runs before relying on their reports.", filter: "missing", unit: "checks", action: "Inspect incomplete results" },
    { count: totals.active, title: "Verification in progress", detail: "These videos have no final outcome yet. Open the plan to follow progress.", filter: "active", unit: "videos", action: "See processing videos" },
  ].filter(action => action.count > 0);
  const metrics = [
    { label: "Videos received", value: totals.videos, detail: `${totals.completed} completed · ${totals.active} processing · ${totals.failed} failed` },
    { label: "Analyzed checks", value: totals.checks, detail: `${totals.missingChecks} expected checks missing a final finding` },
    { label: "Human-reviewed checks", value: totals.humanReviewed, detail: `${data.manual.observed + data.manual.not_observed} decisive · ${data.manual.uncertain} still uncertain` },
    { label: "Checks needing attention", value: totals.pending + totals.followUp, detail: `${totals.pending} awaiting first review · ${totals.followUp} need follow up` },
  ];
  return <>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(({ label, value, detail }) => <section key={label} className="rounded-xl border bg-card p-4"><h2 className="text-xs font-medium text-muted-foreground">{label}</h2><p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{value.toLocaleString()}</p><p className="mt-2 text-[11px] leading-5 text-muted-foreground">{detail}</p></section>)}</div>
    <section aria-label="Recommended next actions" className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b p-5"><h2 className="text-base font-semibold">Your next steps</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{actions.length ? "Start with unresolved work. Each action opens the affected records in this report." : "No pending reviews, failed videos, missing findings, or processing videos in this report."}</p></div>
      {actions.length ? <ul className="divide-y">{actions.map(action => <li key={action.filter}><button type="button" onClick={() => onInspect(action.filter)} className="flex w-full flex-wrap items-center gap-4 px-5 py-4 text-left hover:bg-muted/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"><span className="min-w-12 rounded-lg bg-muted px-2 py-2 text-center text-lg font-semibold tabular-nums">{action.count}<span className="block text-[10px] font-normal text-muted-foreground">{action.unit}</span></span><span className="min-w-40 flex-1"><span className="block text-sm font-medium">{action.title}</span><span className="mt-1 block text-xs leading-5 text-muted-foreground">{action.detail}</span></span><span className="flex items-center gap-2 text-xs font-medium">{action.action}<ArrowRight className="size-3.5" /></span></button></li>)}</ul> : <div className="flex items-start gap-3 p-5"><CircleCheck className="mt-0.5 size-5 text-muted-foreground" /><div><p className="text-sm font-medium">No outstanding work</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Inspect current outcomes below. A completed review does not mean every action was observed.</p></div></div>}
    </section>
    <section aria-label="Current evidence outcomes" className="rounded-xl border bg-card p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-base font-semibold">What does the evidence show?</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Latest human decision where available; automated evidence otherwise. Select an outcome to inspect the footage.</p></div><span className="text-xs text-muted-foreground">{totals.checks} final checks</span></div>
      <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-muted" role="img" aria-label={outcomes.map(status => `${data.current[status]} ${outcomeLabels[status].toLowerCase()}`).join(", ")}>{outcomes.map(status => <span key={status} style={{ width: `${totals.checks ? data.current[status] / totals.checks * 100 : 0}%` }} className={status === "observed" ? "bg-emerald-700" : status === "uncertain" ? "bg-amber-700" : "bg-slate-500"} />)}</div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">{outcomes.map(status => <button key={status} type="button" onClick={() => onInspect(`current_${status}`)} className="rounded-lg border p-3 text-left hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-primary"><Verdict status={status} /><span className="mt-3 flex items-baseline gap-2"><strong className="text-2xl tabular-nums">{data.current[status]}</strong><span className="text-xs text-muted-foreground">{percent(data.current[status], totals.checks)}</span><ArrowRight className="ml-auto size-3.5" /></span></button>)}</div>
      <p className="mt-4 text-[11px] leading-5 text-muted-foreground">“Not observed” means not visible in this footage. Uncertainty needs inspection; hidden outcomes cannot be certified.</p>
    </section>
  </>;
}

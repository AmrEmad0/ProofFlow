import { reportControl as control } from "./report-ui";
import { ReportOverview } from "./report-overview";
import { EvidenceLedger } from "./report-ledger";
import { PlanComparison, CheckBreakdown } from "./report-breakdowns";
import { useEffect, useId, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ChartNoAxesCombined, Download, RefreshCw, Timer } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { reportQuery } from "@/lib/queries";
import { downloadReportCsv } from "@/lib/report-export";
import { FindingsTrend, OutcomeChart, percent } from "./report-charts";
import type { ReportFilters } from "../../../shared/reports";

const today = () => new Date().toISOString().slice(0, 10);
function daysAgo(days: number) { const date = new Date(`${today()}T00:00:00Z`); date.setUTCDate(date.getUTCDate() - days); return date.toISOString().slice(0, 10); }
function elapsed(ms: number | null) {
  if (ms === null) return "—";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)}h`;
  return `${(ms / 86_400_000).toFixed(1)}d`;
}
export function ReportsPage() {
  const planId = useId();
  const periodId = useId();
  const filters = useSearch({ from: "/_workspace/reports" });
  const navigate = useNavigate();
  const report = useQuery(reportQuery(filters));
  const [period, setPeriod] = useState(filters.from || filters.to ? "custom" : "all");
  const [from, setFrom] = useState(filters.from ?? daysAgo(29));
  const [to, setTo] = useState(filters.to ?? today());
  const [dateError, setDateError] = useState("");
  const [ledgerFilter, setLedgerFilter] = useState("all");
  const [view, setView] = useState<"overview" | "evidence" | "insights">("overview");
  const data = report.data;
  const selectedPlan = data?.plans.find(plan => plan.id === filters.planId);
  const planOptions = [
    { value: "all", label: "All plans" },
    ...(data?.plans.map(plan => ({ value: plan.id, label: plan.title })) ?? []),
    ...(filters.planId && !selectedPlan ? [{ value: filters.planId, label: "Selected plan" }] : []),
  ];
  const periodOptions = [{ value: "all", label: "All time" }, { value: "7", label: "Last 7 days" }, { value: "30", label: "Last 30 days" }, { value: "custom", label: "Custom range" }];
  useEffect(() => { setLedgerFilter("all"); }, [filters.planId, filters.from, filters.to]);
  useEffect(() => {
    setFrom(filters.from ?? daysAgo(29)); setTo(filters.to ?? today());
    setPeriod(!filters.from && !filters.to ? "all" : filters.to === today() && filters.from === daysAgo(6) ? "7" : filters.to === today() && filters.from === daysAgo(29) ? "30" : "custom");
  }, [filters.from, filters.to]);
  function change(next: ReportFilters) { void navigate({ to: "/reports", search: next }); }
  function filterLedger(value: string) {
    setLedgerFilter(value);
    setView("evidence");
  }
  const totals = data?.totals;
  return <div className="mx-auto max-w-[1200px] space-y-5">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><p className="mb-2 flex items-center gap-2 text-[11px] font-semibold tracking-widest text-muted-foreground"><ChartNoAxesCombined className="size-3.5" />REPORTS</p><h1 className="text-2xl font-semibold tracking-tight">{selectedPlan ? `${selectedPlan.title} · Report` : "Workspace reports"}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">See what needs attention, inspect the evidence, and improve your verification process.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" disabled={report.isFetching} onClick={() => void report.refetch()}><RefreshCw className={report.isFetching ? "animate-spin" : ""} />Refresh</Button><Button variant="outline" size="sm" title="Export all records in the selected plan and date range" disabled={!data || !data.records.length || report.isFetching} onClick={() => data && downloadReportCsv(data)}><Download />Export report CSV</Button></div></header>
    <section aria-label="Report filters" className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4">
      <div className="flex min-w-44 flex-1 flex-col gap-1.5 text-[11px] font-medium text-muted-foreground">
        <label htmlFor={planId}>Plan</label>
        <Select items={planOptions} value={filters.planId ?? "all"} onValueChange={value => { if (value) change({ ...filters, planId: value === "all" ? undefined : value }); }}>
          <SelectTrigger id={planId} aria-label="Report plan" className="w-full min-w-0 rounded-lg bg-background px-3 text-foreground data-[size=default]:h-10"><SelectValue className="min-w-0 truncate" /></SelectTrigger>
          <SelectContent alignItemWithTrigger={false} className="max-h-80 max-w-[calc(100vw-2rem)]">{planOptions.map(option => <SelectItem key={option.value} value={option.value} className="py-2 pr-8">{option.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5 text-[11px] font-medium text-muted-foreground">
        <label htmlFor={periodId}>Recording dates (UTC)</label>
        <Select items={periodOptions} value={period} onValueChange={value => {
          if (!value) return;
          setPeriod(value); setDateError("");
          if (value === "all") change({ planId: filters.planId });
          else if (value !== "custom") { const first = daysAgo(Number(value) - 1); setFrom(first); setTo(today()); change({ planId: filters.planId, from: first, to: today() }); }
        }}>
          <SelectTrigger id={periodId} aria-label="Report date range" className="min-w-36 rounded-lg bg-background px-3 text-foreground data-[size=default]:h-10"><SelectValue /></SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>{periodOptions.map(option => <SelectItem key={option.value} value={option.value} className="py-2 pr-8">{option.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {period === "custom" && <form className="flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); if (!from || !to || from > to) { setDateError("Choose a valid start and end date."); return; } setDateError(""); change({ planId: filters.planId, from, to }); }}><label className="flex flex-col gap-1.5 text-[11px] text-muted-foreground">From<input aria-label="Report start date" type="date" required className={control} value={from} onChange={event => setFrom(event.target.value)} /></label><label className="flex flex-col gap-1.5 text-[11px] text-muted-foreground">Through<input aria-label="Report end date" type="date" required className={control} value={to} onChange={event => setTo(event.target.value)} /></label><Button variant="outline" size="sm" type="submit">Apply</Button></form>}
      {selectedPlan && <Link to="/plans/$planId" params={{ planId: selectedPlan.id }} className="inline-flex min-h-10 items-center gap-1 text-xs font-medium hover:underline">Open plan<ArrowUpRight className="size-3.5" /></Link>}
      {dateError && <p role="alert" className="w-full text-xs text-destructive">{dateError}</p>}
    </section>
    {report.isPending ? <p role="status" className="flex min-h-80 items-center justify-center rounded-xl border bg-card text-sm text-muted-foreground">Building your report…</p> : report.error ? <div role="alert" className="rounded-xl border border-destructive/25 p-5 text-sm text-destructive">{report.error.message}<Button variant="outline" className="ml-3" size="sm" onClick={() => void report.refetch()}>Retry</Button></div> : data && totals && <>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground"><p>{filters.from || "First recording"} → {filters.to || "Now"} · Latest human decisions included for these recordings</p><p>Updated {new Date(data.generatedAt).toLocaleString()}</p></div>
      {!totals.videos && <div className="rounded-xl border border-dashed bg-card p-6"><h2 className="font-semibold">No recordings in this report yet</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Choose another date range or verify a video with an approved plan. Charts will use the saved evidence and review history.</p></div>}
      {totals.videos > 0 && <>
      <nav aria-label="Report sections" className="flex flex-wrap gap-1 rounded-xl border bg-card p-1.5">
        {([ ["overview", "Overview", "Priorities & outcomes"], ["evidence", "Evidence", "Find & inspect records"], ["insights", "Insights", "Trends & review impact"] ] as const).map(([key, label, description]) => <button key={key} type="button" aria-current={view === key ? "page" : undefined} onClick={() => setView(key)} className={`min-w-0 flex-1 rounded-lg px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-primary ${view === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}><span className="block text-sm font-semibold">{label}</span><span className="mt-0.5 hidden text-[11px] sm:block">{description}</span></button>)}
      </nav>
      <div hidden={view !== "overview"} className="space-y-4"><ReportOverview data={data} onInspect={filterLedger} /></div>
      {view === "evidence" && <EvidenceLedger data={data} filter={ledgerFilter} onFilter={setLedgerFilter} />}
      <div hidden={view !== "insights"} className="space-y-4">
      <div><h2 className="text-lg font-semibold">Improve your verification process</h2><p className="mt-1 text-sm text-muted-foreground">Find recurring uncertainty, compare plans, and understand where human review helps. Select a result to inspect its evidence.</p></div>
      {!filters.planId && <PlanComparison data={data} filters={filters} />}
      <CheckBreakdown data={data} onAttention={() => filterLedger("attention")} onCheck={key => filterLedger(`check_${key}`)} />
      <div className="grid gap-4 xl:grid-cols-2"><OutcomeChart title="What automated verification found" description="Muse Spark proposals + SAM geometry + evidence rules. Select an outcome to inspect its checks." counts={data.automated} onFilter={status => filterLedger(`ai_${status}`)} /><OutcomeChart title="What human reviewers decided" description="Latest decision per reviewed check. Revisions do not inflate the counts." counts={data.manual} onFilter={status => filterLedger(`human_${status}`)} /></div>
      <FindingsTrend days={data.days} />
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]"><section className="rounded-xl border bg-card p-5"><h2 className="text-sm font-semibold">How human review changed the picture</h2><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-lg bg-muted/40 p-4"><strong className="text-2xl tabular-nums">{totals.resolvedUncertainty}</strong><p className="mt-2 text-xs leading-5 text-muted-foreground">Originally uncertain checks given a decisive human answer</p></div><div className="rounded-lg bg-muted/40 p-4"><strong className="text-2xl tabular-nums">{totals.changedDecisive}</strong><p className="mt-2 text-xs leading-5 text-muted-foreground">Human answers that differ from an automated observed / not-observed finding</p></div></div><p className="mt-4 text-[11px] leading-5 text-muted-foreground">{totals.reviewEvents} saved review events across {totals.humanReviewed} checks. Differences indicate a review outcome, not measured model accuracy.</p></section><section className="rounded-xl border bg-card p-5"><h2 className="flex items-center gap-2 text-sm font-semibold"><Timer className="size-4" />Processing & review turnaround</h2><dl className="mt-4 divide-y"><div className="flex justify-between gap-3 pb-3"><dt className="text-xs font-medium">Median processing time<span className="mt-1 block text-[11px] font-normal leading-5 text-muted-foreground">{data.processing.samples} completed videos with saved worker timings · excludes queue wait</span></dt><dd className="text-xl font-semibold tabular-nums">{elapsed(data.processing.medianMs)}</dd></div><div className="flex justify-between gap-3 pt-3"><dt className="text-xs font-medium">Median time to first human review<span className="mt-1 block text-[11px] font-normal leading-5 text-muted-foreground">{data.reviewDelay.samples} videos · elapsed since verification completed, including idle time</span></dt><dd className="text-xl font-semibold tabular-nums">{elapsed(data.reviewDelay.medianMs)}</dd></div></dl></section></div>
      <p className="text-xs leading-6 text-muted-foreground">{percent(totals.automatedOnly, totals.checks)} of analyzed checks needed no human decision ({totals.automatedOnly} of {totals.checks}). {totals.amendments} review amendments saved.</p>
      </div>
      </>}
      <details className="rounded-lg bg-muted/30 p-4 text-xs leading-6 text-muted-foreground"><summary className="w-fit cursor-pointer font-medium text-foreground">How to read this report</summary><p className="mt-2"> Dates select videos by their creation date in UTC; human decisions use the latest saved review, even if reviewed later. Finding rates include only final findings from completed runs. Failed, active, and missing checks are counted separately. Approved versions remain separate in check comparisons. “Not observed” means not visible in the footage; hidden outcomes are not certified. Current outcomes use the latest human decision where present, and keep unresolved relationships uncertain. Deleted plans and recordings are excluded.</p></details>
    </>}
  </div>;
}

import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpRight, Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import type { Report, ReportCheck, ReportRecord } from "../../../shared/reports";
import type { FindingStatus } from "../../../shared/receipt";
import { outcomeLabels } from "./report-charts";
import { reportControl as control, Verdict } from "./report-ui";

type LedgerRow = { run: ReportRecord; check: ReportCheck | null };
function matches(row: LedgerRow, filter: string) {
  const { run, check } = row;
  if (filter === "all") return true;
  if (filter === "failed") return run.state === "failed";
  if (filter === "missing") return run.missingChecks > 0;
  if (filter === "active") return run.state !== "completed" && run.state !== "failed";
  if (!check) return false;
  if (filter === "attention") return (check.reviewRequired && !check.latestReview) || check.latestReview?.decision === "uncertain";
  if (filter === "pending") return check.reviewRequired && !check.latestReview;
  if (filter === "followup") return check.latestReview?.decision === "uncertain";
  if (filter === "reviewed") return Boolean(check.latestReview);
  if (filter.startsWith("check_")) return `${run.approvedVersionId}:${check.stepId}` === filter.slice(6);
  if (filter.startsWith("current_")) return check.currentStatus === filter.slice(8);
  if (filter.startsWith("ai_")) return check.automatedStatus === filter.slice(3);
  if (filter.startsWith("human_")) return check.latestReview?.decision === filter.slice(6);
  return true;
}
export function EvidenceLedger({ data, filter, onFilter }: { data: Report; filter: string; onFilter: (value: string) => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  useEffect(() => setPage(0), [filter, search, data]);
  const term = search.toLowerCase().trim();
  const rows = data.records.flatMap<LedgerRow>(run => run.checks.length ? run.checks.map(check => ({ run, check })) : [{ run, check: null }]).filter(row => matches(row, filter) && (!term || [row.run.planTitle, row.run.taskReference, row.check?.label, row.check?.latestReview?.note].some(value => value?.toLowerCase().includes(term))));
  const filterOptions = [
    { value: "all", label: "All records" },
    ...(filter.startsWith("check_") ? [{ value: filter, label: "Selected check & version" }] : []),
    ...(filter.startsWith("current_") ? [{ value: filter, label: `Current: ${outcomeLabels[filter.slice(8) as FindingStatus]}` }] : []),
    { value: "attention", label: "Still needs attention" },
    { value: "pending", label: "Awaiting first review" },
    { value: "followup", label: "Human: can’t tell" },
    { value: "reviewed", label: "Human reviewed" },
    { value: "failed", label: "Failed videos" },
    { value: "missing", label: "Missing final findings" },
    { value: "active", label: "Processing videos" },
    ...(["observed", "not_observed", "uncertain"] as const).map(status => ({ value: `ai_${status}`, label: `Automated: ${outcomeLabels[status]}` })),
    { value: "human_observed", label: "Human: observed" },
    { value: "human_not_observed", label: "Human: not observed" },
    { value: "human_uncertain", label: "Human: uncertain" },
  ];
  const pageCount = Math.max(1, Math.ceil(rows.length / 20));
  const currentPage = Math.min(page, pageCount - 1);
  return <div className="overflow-hidden rounded-xl border bg-card"><div className="space-y-4 p-5"><div><h2 ref={heading} tabIndex={-1} className="text-sm font-semibold outline-none">Find evidence & decisions</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Search within the selected plan and recording dates. Open footage to inspect a finding, or open the plan to review its videos.</p></div><div className="flex flex-wrap gap-2"><label className="relative min-w-48 flex-1"><span className="sr-only">Search report evidence</span><Search className="absolute top-3 left-3 size-3.5 text-muted-foreground" /><input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Find a check, plan, reference, or note…" className={`${control} w-full pl-9`} /></label><Select items={filterOptions} value={filter} onValueChange={value => { if (value) onFilter(value); }}>
    <SelectTrigger aria-label="Evidence ledger filter" className="w-full min-w-0 rounded-lg bg-background px-3 data-[size=default]:h-10 sm:w-56"><SelectValue className="min-w-0 truncate" /></SelectTrigger>
    <SelectContent alignItemWithTrigger={false} className="max-h-80 max-w-[calc(100vw-2rem)]">{filterOptions.map(option => <SelectItem key={option.value} value={option.value} className="py-2 pr-8">{option.label}</SelectItem>)}</SelectContent>
  </Select></div></div><div className="overflow-x-auto"><table className="w-full text-left text-xs"><caption className="sr-only">Evidence and human decision audit records</caption><thead className="border-y bg-muted/30 text-muted-foreground"><tr>{["Recording & check", "Automated", "Human review", "Current outcome", "Footage"].map(label => <th key={label} scope="col" className="px-5 py-3 font-medium dark:text-neutral-400">{label}</th>)}</tr></thead><tbody className="divide-y">{rows.slice(currentPage * 20, (currentPage + 1) * 20).map(({ run, check }) => <tr key={`${run.runId}:${check?.stepId ?? "run"}`}><th scope="row" className="min-w-60 max-w-sm px-5 py-4 font-medium"><span className="block">{check?.label ?? (run.state === "failed" ? "Video processing failed" : run.state === "completed" ? "No final findings" : "Video processing in progress")}</span><p className="mt-1 text-[11px] font-normal leading-5 text-muted-foreground">{run.planTitle} · v{run.planVersion}{run.taskReference ? ` · ${run.taskReference}` : ""}<br />{new Date(run.createdAt).toLocaleString()} · Run {run.runId.slice(0, 8)}</p>{run.error && <p className="mt-1 max-w-sm text-[11px] font-normal leading-5 text-destructive">{run.error}</p>}{run.missingChecks > 0 && <p className="mt-1 text-[11px] font-normal text-muted-foreground">{run.missingChecks} expected checks missing a final finding</p>}{run.warnings > 0 && <p className="mt-1 text-[11px] font-normal text-muted-foreground">{run.warnings} run warnings · inspect the recording</p>}</th><td className="px-5 py-4">{check ? <Verdict status={check.automatedStatus} /> : <span className="text-muted-foreground">Not evaluated</span>}</td><td className="min-w-48 px-5 py-4">{check?.latestReview ? <><Verdict status={check.latestReview.decision} /><p className="mt-1 text-[10px] text-muted-foreground">{new Date(check.latestReview.reviewedAt).toLocaleString()}</p>{check.latestReview.note && <details className="mt-1"><summary className="cursor-pointer py-1 text-[11px] text-muted-foreground">Review note</summary><p className="max-w-60 break-words text-xs leading-5">{check.latestReview.note}</p></details>}</> : check ? <span className="text-muted-foreground">{check.reviewRequired ? "Awaiting review" : "Not required"}</span> : "—"}</td><td className="px-5 py-4">{check ? <><Verdict status={check.currentStatus} /><p className="mt-1 text-[10px] text-muted-foreground">{check.latestReview ? "Human decision" : "Automated evidence"}</p></> : "—"}</td><td className="min-w-36 px-5 py-4">{run.state === "completed" && check && <><a className="inline-flex min-h-9 items-center gap-1 font-medium underline underline-offset-4" href={`/api/runs/${run.runId}/video#t=${(check.latestReview?.timestampMs ?? check.startMs ?? 0) / 1000}`} target="_blank" rel="noreferrer">Open footage<ArrowUpRight className="size-3" /></a><p className="text-[10px] text-muted-foreground">{check.latestReview?.timestampMs !== null && check.latestReview?.timestampMs !== undefined ? "Human-marked moment" : check.startMs !== null ? "Automated evidence window" : "Whole recording"}</p></>}<Link to="/plans/$planId" params={{ planId: run.planId }} className="block min-h-8 py-2 text-[11px] text-muted-foreground underline">Open plan videos</Link></td></tr>)}{!rows.length && <tr><td colSpan={5} className="p-6 text-sm text-muted-foreground">No records match these filters.<button type="button" className="ml-2 min-h-9 underline" onClick={() => { setSearch(""); onFilter("all"); }}>Clear evidence filters</button></td></tr>}</tbody></table></div><div className="flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3"><p className="text-[11px] tabular-nums text-muted-foreground">{rows.length} records · Page {currentPage + 1} of {pageCount}</p><div className="flex gap-2"><Button variant="outline" size="sm" disabled={!currentPage} onClick={() => setPage(currentPage - 1)}>Previous</Button><Button variant="outline" size="sm" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</Button></div></div></div>;
}

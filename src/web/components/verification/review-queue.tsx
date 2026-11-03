import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CheckCheck, ChevronDown, ListVideo, RefreshCw, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { reviewQueueQuery, runDetailsQuery } from "@/lib/queries";
import { EvidencePlayer } from "./evidence-player";
import type { ManualReview, ReviewQueueItem } from "../../../shared/manual-review";

const itemKey = (item: ReviewQueueItem) => `${item.runId}:${item.stepId}`;
type Filter = "pending" | "uncertain" | "reviewed";
const decisionLabels = { observed: "Yes, visible", not_observed: "No, not visible", uncertain: "Can’t tell" };

export function ReviewQueue() {
  const queue = useQuery(reviewQueueQuery);
  const [filter, setFilter] = useState<Filter>("pending");
  const [selected, setSelected] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const [queueOpen, setQueueOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lastReviewed, setLastReviewed] = useState<{ item: ReviewQueueItem; review: ManualReview } | null>(null);
  const items = queue.data ?? [];
  const pending = items.filter(item => !item.latestReview);
  const uncertain = items.filter(item => item.latestReview?.decision === "uncertain");
  const reviewed = items.filter(item => item.latestReview && item.latestReview.decision !== "uncertain");
  const filtered = filter === "pending" ? pending : filter === "uncertain" ? uncertain : reviewed;
  const remaining = filtered.filter(item => !skipped.includes(itemKey(item)));
  const current = remaining.find(item => itemKey(item) === selected) ?? remaining[0];
  const upcoming = current ? remaining[remaining.indexOf(current) + 1] : undefined;
  const details = useQuery(runDetailsQuery(current?.runId ?? null));
  const pendingVideoCount = new Set(pending.map(item => item.runId)).size;
  const progress = items.length ? Math.round(reviewed.length / items.length * 100) : 0;

  function next(message: string) {
    if (current) setSkipped(previous => [...previous, itemKey(current)]);
    setSelected(null); setNotice(message);
  }
  function saved(review: ManualReview) {
    if (current) setLastReviewed({ item: current, review });
    next(`Saved: ${decisionLabels[review.decision]}. ${review.decision === "uncertain" ? "Moved to follow up." : "Ready for the next check."}`);
  }
  function editLastReview() {
    if (!lastReviewed) return;
    const key = itemKey(lastReviewed.item);
    setFilter(lastReviewed.review.decision === "uncertain" ? "uncertain" : "reviewed");
    setSkipped(previous => previous.filter(item => item !== key));
    setSelected(key); setNotice("Opened your last review. Choose Change decision to revise it.");
  }

  return <div className="mx-auto max-w-[1600px] space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold tracking-tight">Manual review</h1><p className="mt-1 text-xs leading-5 text-muted-foreground">{pending.length} {pending.length === 1 ? "check" : "checks"} awaiting a decision · {pendingVideoCount} {pendingVideoCount === 1 ? "video" : "videos"}</p></div><div className="flex items-center gap-2 sm:gap-3"><Button variant={queueOpen ? "secondary" : "ghost"} size="sm" aria-label="Browse queue" aria-expanded={queueOpen} aria-controls="manual-review-queue" disabled={busy} onClick={() => setQueueOpen(previous => !previous)}><ListVideo /><span className="hidden sm:inline">Browse queue</span><ChevronDown className={`hidden transition-transform sm:block ${queueOpen ? "rotate-180" : ""}`} /></Button><div className="hidden w-32 space-y-1.5 sm:block"><p className="text-right text-[11px] tabular-nums text-muted-foreground">{reviewed.length} of {items.length} resolved</p><div role="progressbar" aria-label="Review completion" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-700 transition-[width]" style={{ width: `${progress}%` }} /></div></div><Button variant="ghost" size="sm" aria-label="Refresh review queue" disabled={queue.isFetching || busy} onClick={() => { void queue.refetch(); if (current) void details.refetch(); }}><RefreshCw className={queue.isFetching ? "animate-spin" : ""} /><span className="hidden sm:inline">Refresh</span></Button></div></div>
    <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2"><div className="flex flex-wrap gap-1" aria-label="Review views">{([{ value: "pending", label: "To review", count: pending.length }, { value: "uncertain", label: "Can’t tell · follow up", count: uncertain.length }, { value: "reviewed", label: "Reviewed", count: reviewed.length }] as const).map(tab => <button type="button" key={tab.value} disabled={busy} aria-label={`${tab.label} ${tab.count}`} aria-pressed={filter === tab.value} onClick={() => { setFilter(tab.value); setSelected(null); setSkipped([]); setNotice(""); }} className={`flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-50 ${filter === tab.value ? "bg-primary/10 text-orange-900 dark:text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{tab.value === "uncertain" ? <><span className={`sm:hidden ${filter === tab.value ? "dark:text-primary" : "dark:text-neutral-400"}`}>Follow up</span><span className={`hidden sm:inline ${filter === tab.value ? "dark:text-primary" : "dark:text-neutral-400"}`}>{tab.label}</span></> : tab.label}<span className={`rounded-md px-1.5 py-0.5 text-[10px] tabular-nums ${filter === tab.value ? "bg-primary/10" : "bg-muted"}`}>{tab.count}</span></button>)}</div></div>
    {queueOpen && <nav id="manual-review-queue" aria-label="Review queue" className="grid max-h-64 gap-1 overflow-y-auto rounded-xl border bg-card p-2 sm:grid-cols-2 xl:grid-cols-3">{remaining.map((item, index) => <button key={itemKey(item)} type="button" disabled={busy} aria-current={current && itemKey(item) === itemKey(current) ? "step" : undefined} onClick={() => { setSelected(itemKey(item)); setQueueOpen(false); setNotice(""); }} className={`flex min-h-16 gap-3 rounded-lg p-3 text-left ${current && itemKey(item) === itemKey(current) ? "bg-primary/10" : "hover:bg-muted"}`}><span className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">{String(index + 1).padStart(2, "0")}</span><span className="min-w-0"><span className="block text-xs font-medium">{item.label}</span><span className="mt-1 block truncate text-[11px] text-muted-foreground">{item.taskReference ?? item.planTitle} · {new Date(item.createdAt).toLocaleString()}</span></span></button>)}{!remaining.length && <p className="p-3 text-xs text-muted-foreground">No checks in this view.</p>}</nav>}
    <div className="flex min-h-7 flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[11px]"><p role="status" className="flex min-w-0 items-center gap-2 text-muted-foreground">{notice && <CheckCheck className="size-3.5 shrink-0 text-emerald-700 dark:text-emerald-400" />}{notice || (current ? `${current.planTitle} · ${remaining.length} remaining in this view` : "All decisions are saved to their recording.")}</p>{lastReviewed ? <button type="button" className="flex min-h-8 items-center gap-1.5 rounded text-primary hover:underline disabled:opacity-50" disabled={busy} onClick={editLastReview}><RotateCcw className="size-3" />Edit last review</button> : upcoming && <p className="hidden max-w-72 truncate text-muted-foreground md:block">Up next: {upcoming.label}</p>}</div>
    {queue.isPending ? <p role="status" className="p-8 text-sm text-muted-foreground">Loading review queue…</p> : queue.error ? <div role="alert" className="space-y-3 rounded-xl border p-5 text-sm text-destructive"><p>{queue.error.message}</p><Button variant="outline" onClick={() => void queue.refetch()}>Retry queue</Button></div> : current ? <section className="min-w-0" aria-label="Current manual review">
      {details.isPending ? <div role="status" className="flex min-h-96 items-center justify-center rounded-xl border bg-card text-sm text-muted-foreground">Loading footage…</div> : details.error ? <div role="alert" className="space-y-3 rounded-xl border p-5 text-sm text-destructive"><p>{details.error.message}</p><Button variant="outline" onClick={() => void details.refetch()}>Retry footage</Button><Button variant="ghost" onClick={() => next("Skipped unavailable footage. This check stays in the queue.")}>Skip for now</Button></div> : details.data && <EvidencePlayer key={itemKey(current)} run={details.data} focusedStepId={current.stepId} autoPlay={false} reviewMode onDecisionSaved={saved} onSkip={() => next("Skipped for now. This check stays in the queue.")} onPendingChange={setBusy} />}
    </section> : <section className="flex min-h-80 flex-col items-center justify-center rounded-xl border bg-card p-6 text-center"><span className="mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-700/10 text-emerald-700 dark:text-emerald-400"><CheckCheck className="size-7" /></span><h2 className="text-lg font-semibold">{filtered.length ? "You’ve reached the end of this pass" : filter === "pending" ? "You’re caught up" : filter === "uncertain" ? "No checks waiting for clearer evidence" : "No reviews yet"}</h2><p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">{filtered.length ? "Skipped checks are still waiting. Return to them when you’re ready." : filter === "pending" ? "New uncertain and not-observed findings will appear here. Your decisions are saved with their evidence." : "Choose another view to continue reviewing."}</p>{skipped.length > 0 && <Button variant="outline" className="mt-4" onClick={() => { setSkipped([]); setSelected(null); }}>Return to skipped checks<ArrowRight /></Button>}</section>}
  </div>;
}

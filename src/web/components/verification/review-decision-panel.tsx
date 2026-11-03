import { createPortal } from "react-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, CircleHelp, Clock3, Keyboard, LoaderCircle, SkipForward, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/eden";
import { apiError } from "@/lib/queries";
import { formatTime } from "@/lib/evidence-presentation";
import { manualReviewSchema, type ReviewQueueItem, type ManualReview } from "../../../shared/manual-review";
import type { Finding, FindingStatus } from "../../../shared/receipt";
import type { RunDetails } from "../../../shared/verification";

type Props = {
  run: RunDetails; stepId: string; currentTimeMs: number | null;
  captureMoment: () => number | null; onInspect: (id: string, ms: number) => void;
  onSaved?: (review: ManualReview) => void; onSkip?: () => void; onPendingChange?: (pending: boolean) => void;
};

const decisionLabels = { observed: "Yes, visible", not_observed: "No, not visible", uncertain: "Can’t tell" };

export function ReviewDecisionPanel({ run, stepId, currentTimeMs, captureMoment, onInspect, onSaved, onSkip, onPendingChange }: Props) {
  const noteId = useId();
  const isMobile = useIsMobile();
  const actionDock = useRef<HTMLDivElement>(null);
  const [dockHeight, setDockHeight] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const client = useQueryClient();
  const lock = useRef(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const latest = run.manualReviews.filter(review => review.stepId === stepId).at(-1);
  const step = run.approvedPlan.steps.find(item => item.id === stepId);
  const finding = run.receipt?.findings.find(item => item.stepId === stepId);
  const canDecide = !latest || editing;
  const floatingActions = isMobile && canDecide;
  useLayoutEffect(() => {
    const element = actionDock.current;
    if (!floatingActions || !element) return;
    const measure = () => setDockHeight(Math.ceil(element.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [floatingActions]);
  const save = useMutation({
    mutationFn: async ({ decision, timestampMs }: { decision: FindingStatus; timestampMs: number | null }) => {
      const result = await api.api.runs({ id: run.id }).reviews.post({ stepId, decision, timestampMs, note, expectedRevision: latest?.id ?? 0 });
      if (result.error) throw apiError(result.error.value, "Your review could not be saved. Please try again.");
      return manualReviewSchema.parse(result.data);
    },
    onSuccess: review => {
      client.setQueryData<RunDetails>(["run", run.id], current => current ? { ...current, manualReviews: [...current.manualReviews, review] } : current);
      client.setQueryData<ReviewQueueItem[]>(["reviews"], current => current?.map(item => item.runId === run.id && item.stepId === stepId ? { ...item, latestReview: review } : item));
      onSaved?.(review);
      void client.invalidateQueries({ queryKey: ["run", run.id] });
      void client.invalidateQueries({ queryKey: ["reviews"] });
      setEditing(false);
    },
    onSettled: () => { lock.current = false; },
  });
  useEffect(() => {
    onPendingChange?.(save.isPending);
    return () => onPendingChange?.(false);
  }, [save.isPending, onPendingChange]);
  useEffect(() => {
    const element = heading.current;
    element?.focus({ preventScroll: true });
    if (element && element.getBoundingClientRect().top < 0) element.scrollIntoView({ block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }, [stepId]);

  function decide(decision: FindingStatus) {
    if (lock.current || !canDecide || !run.media || (decision === "observed" && currentTimeMs === null)) return;
    const moment = captureMoment();
    if (decision === "observed" && moment === null) { setLocalError("Play or seek the video before confirming a visible action."); return; }
    lock.current = true;
    setLocalError(null);
    save.mutate({ decision, timestampMs: decision === "observed" ? moment : null });
  }

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || lock.current || !canDecide) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.closest("input, textarea, select, button, a, [contenteditable=true], [role=dialog]"))) return;
      const key = event.key.toLowerCase();
      if (!["y", "n", "u", "s"].includes(key)) return;
      event.preventDefault();
      if (key === "s") onSkip?.();
      else decide(key === "y" ? "observed" : key === "n" ? "not_observed" : "uncertain");
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  });

  if (!step || !finding) return <p role="alert" className="p-6 text-sm">This check is unavailable. Refresh your queue.</p>;
  const actions = <div ref={actionDock} role={floatingActions ? "region" : undefined} aria-label={floatingActions ? "Mobile review actions" : undefined} aria-busy={save.isPending} className={floatingActions ? "fixed inset-x-0 bottom-0 z-30 max-h-[50dvh] space-y-2 overflow-y-auto rounded-t-2xl border-t bg-card p-3 shadow-[0_-4px_20px_rgb(0_0_0/0.08)]" : "order-last space-y-2 border-t bg-card p-3 shadow-[0_-4px_16px_rgb(0_0_0/0.04)] @4xl:static @4xl:order-none @4xl:mt-auto @4xl:space-y-3 @4xl:bg-muted/15 @4xl:p-5 @4xl:shadow-none"} style={floatingActions ? { paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" } : undefined}>
      {canDecide ? <>
        <div><h3 className={floatingActions ? "text-[11px] font-medium leading-4 text-muted-foreground" : "text-xs font-semibold @4xl:text-sm"}>Does the footage show this action?</h3><p className="mt-1 hidden text-xs leading-5 text-muted-foreground @4xl:block">Choose once to save and move to the next check.</p></div>
        <div className={floatingActions ? "grid grid-cols-2 gap-2" : "space-y-3"}><div className="col-span-2 grid grid-cols-2 gap-2">
          <button type="button" aria-label="Yes, visible" onClick={event => { if (event.detail < 2) decide("observed"); }} disabled={save.isPending || currentTimeMs === null || !run.media} aria-keyshortcuts="Y" className="flex min-h-12 items-center justify-center gap-2 @4xl:min-h-20 @4xl:flex-col @4xl:items-start @4xl:justify-between @4xl:gap-3 rounded-xl border border-emerald-700 bg-emerald-700 px-2 py-2 @4xl:p-4 text-left text-white transition-colors hover:bg-emerald-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"><span className="flex items-center justify-between @4xl:w-full"><Check className="size-4 @4xl:size-5" /><kbd className="ml-3 hidden rounded border border-white/30 @4xl:inline px-1.5 text-[10px]">Y</kbd></span><span className="whitespace-nowrap text-[13px] font-semibold @4xl:text-sm">Yes, visible</span></button>
          <button type="button" aria-label="No, not visible" onClick={event => { if (event.detail < 2) decide("not_observed"); }} disabled={save.isPending || !run.media} aria-keyshortcuts="N" className="flex min-h-12 items-center justify-center gap-2 @4xl:min-h-20 @4xl:flex-col @4xl:items-start @4xl:justify-between @4xl:gap-3 rounded-xl border border-border bg-background px-2 py-2 @4xl:p-4 text-left transition-colors hover:border-rose-600/40 hover:bg-rose-500/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50"><span className="flex items-center justify-between @4xl:w-full"><X className="size-4 text-muted-foreground @4xl:size-5" /><kbd className="ml-3 hidden rounded border px-1.5 text-[10px] text-muted-foreground @4xl:inline">N</kbd></span><span className="whitespace-nowrap text-[13px] font-semibold @4xl:text-sm">No, not visible</span></button>
        </div>
        <Button variant="outline" className={floatingActions ? "h-11 w-full justify-center gap-2 rounded-xl bg-muted/30 px-2 text-[13px]" : "h-11 w-full justify-between rounded-xl px-4 text-sm"} disabled={save.isPending || !run.media} aria-label="Can’t tell" aria-keyshortcuts="U" onClick={event => { if (event.detail < 2) decide("uncertain"); }}><span className="flex items-center gap-2"><CircleHelp className="size-4" />Can’t tell</span>{!floatingActions && <kbd className="rounded border px-1.5 text-[10px] text-muted-foreground">U</kbd>}</Button>
        {floatingActions && onSkip && <Button variant="ghost" className="h-11 w-full gap-2 rounded-xl px-2 text-[13px] text-muted-foreground" disabled={save.isPending} onClick={onSkip} aria-keyshortcuts="S"><SkipForward className="size-4" />Skip for now</Button>}</div>
        <p className="hidden items-start gap-2 text-[11px] leading-4 text-muted-foreground @4xl:flex"><Clock3 className="mt-0.5 size-3.5 shrink-0" />{currentTimeMs === null ? "Play or seek the footage to enable Yes." : "Yes captures the current video moment as evidence. No means the action is not visible."}</p>
        {(localError || save.error) && <p role="alert" className="text-xs leading-5 text-destructive">{localError ?? save.error?.message}</p>}
        {save.isPending && <p role="status" className="flex items-center gap-2 text-xs"><LoaderCircle className="size-3.5 animate-spin" />Saving decision…</p>}
        {editing && <Button variant="ghost" size="sm" disabled={save.isPending} onClick={() => setEditing(false)}>Cancel edit</Button>}
      </> : <p className="text-xs leading-5 text-muted-foreground">Human review is recorded separately from the automated finding.</p>}
      {!floatingActions && <div className="flex items-center justify-end gap-2 @4xl:justify-between @4xl:border-t @4xl:pt-2"><span className="hidden items-center gap-1.5 text-[10px] text-muted-foreground @4xl:flex"><Keyboard className="size-3.5" />Y / N / U to decide</span>{onSkip && <Button variant="ghost" size="sm" disabled={save.isPending} onClick={onSkip} aria-keyshortcuts="S"><SkipForward />Skip for now<ArrowRight className="size-3" /></Button>}</div>}
    </div>;
  return <section aria-label="Review decision" aria-busy={save.isPending} className="contents @4xl:flex @4xl:h-full @4xl:flex-col @4xl:bg-card">
    <div className="order-first space-y-3 border-b p-4 @4xl:order-none @4xl:space-y-4 @4xl:border-0 @4xl:p-5">
      <div className="flex items-center justify-between gap-3"><span className="text-[11px] font-semibold tracking-widest text-muted-foreground">{canDecide ? "DECISION REQUIRED" : "SAVED DECISION"}</span><span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[11px] font-medium text-amber-800 dark:text-amber-300"><CircleHelp className="size-3" />{finding.status === "uncertain" ? "Uncertain" : finding.status === "not_observed" ? "Not observed" : "Review relationship"}</span></div>
      <div><h2 ref={heading} tabIndex={-1} className="text-lg font-semibold leading-6 tracking-tight outline-none">{step.label}</h2><p className="mt-2 text-[13px] leading-5 text-muted-foreground">{step.observableEvidence}</p></div>
      <button type="button" aria-expanded={detailsOpen} aria-controls={`${noteId}-details`} className="min-h-9 text-xs font-medium text-muted-foreground @4xl:hidden" onClick={() => setDetailsOpen(previous => !previous)}>{detailsOpen ? "Hide review details" : "Context & optional note"}</button>
      <div id={`${noteId}-details`} className={`${detailsOpen ? "block" : "hidden"} @4xl:block`}><details className="rounded-lg border bg-muted/20 px-3"><summary className="cursor-pointer py-2.5 text-xs font-medium">Why this needs review</summary><p className="pb-3 text-xs leading-6 text-muted-foreground">{finding.explanation}</p><RelationshipContext finding={finding} /></details></div>
      {latest && !editing && <div className="space-y-2 rounded-xl border bg-muted/30 p-4 text-sm"><p className="flex items-center gap-2 font-semibold"><Check className="size-4" />{decisionLabels[latest.decision]}</p><p className="text-xs text-muted-foreground">{new Date(latest.reviewedAt).toLocaleString()}</p>{latest.timestampMs !== null && <button className="min-h-10 text-xs text-primary underline" onClick={() => onInspect(stepId, latest.timestampMs!)}>View marked evidence · {formatTime(latest.timestampMs)}</button>}{latest.note && <p className="break-words text-xs leading-5">{latest.note}</p>}{latest.decision === "uncertain" && <p className="text-xs leading-5 text-muted-foreground">Still unresolved. Clearer footage may be needed.</p>}<Button variant="outline" size="sm" onClick={() => { setEditing(true); setNote(latest.note); save.reset(); }}>Change decision</Button></div>}
      {canDecide && <details className={`${detailsOpen ? "block" : "hidden"} group @4xl:block`}><summary className="w-fit cursor-pointer py-1 text-xs font-medium text-muted-foreground">Add a note <span className="font-normal">(optional)</span></summary><label htmlFor={noteId} className="sr-only">Review note</label><textarea id={noteId} value={note} maxLength={1000} onChange={event => setNote(event.target.value)} disabled={save.isPending} rows={3} placeholder="What did you see?" className="mt-3 w-full resize-y rounded-lg border bg-background p-3 text-sm" /></details>}
    </div>
    {floatingActions ? <><div aria-hidden="true" className="order-last" style={{ height: dockHeight }} />{createPortal(actions, document.body)}</> : actions}
  </section>;
}

function RelationshipContext({ finding }: { finding: Finding }) {
  return finding.relationships?.filter(item => item.status !== "observed").map(item => <p key={item.id} className="pb-3 text-xs leading-6 text-muted-foreground">{item.description}</p>);
}

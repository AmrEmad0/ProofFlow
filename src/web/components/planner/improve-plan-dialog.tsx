import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Check, ChevronDown, FilePenLine, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/eden";
import { apiError, plansQuery, savedPlanQuery } from "@/lib/queries";
import { savedPlanSchema, type SavedPlan, type PlannerPreview } from "../../../shared/planner";
import { changedPlanChecks, scopeReviewWarnings, type ImprovementProposal, type ImprovementRequest, type ImprovementProgress } from "../../../shared/plan-improvement";
import { proofPlanSchema, type ProofStep } from "../../../shared/proof-plan";
import type { RunDetails } from "../../../shared/verification";
import { ChatMarkdown } from "./chat-markdown";
import { EvidenceFields } from "./evidence-fields";

import { readImprovementStream } from "@/lib/improvement-stream";

const issues = [
  { value: "missed_action", label: "Missed an action" },
  { value: "wrong_object", label: "Wrong object" },
  { value: "unclear_requirement", label: "Unclear requirement" },
  { value: "visibility", label: "Poor visibility" },
  { value: "other", label: "Something else" },
] as const;

export function ImprovePlanDialog({ saved, run, onSaved }: { saved: SavedPlan; run: RunDetails; onSaved: (value: SavedPlan) => void }) {
  const id = useId();
  const client = useQueryClient();
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const [open, setOpen] = useState(false);
  const [issue, setIssue] = useState<ImprovementRequest["issue"]>("missed_action");
  const [feedback, setFeedback] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [progress, setProgress] = useState<ImprovementProgress | null>(null);
  const [planPreview, setPlanPreview] = useState<PlannerPreview | null>(null);
  const [suggestion, setSuggestion] = useState<{ base: SavedPlan; request: ImprovementRequest; proposal: ImprovementProposal } | null>(null);
  const generate = useMutation({
    mutationFn: async () => {
      setProgress(null); setPlanPreview(null);
      const request: ImprovementRequest = { revision: saved.revision, runId: run.id, issue, feedback: feedback.trim() };
      const cancellation = new AbortController();
      controller.current = cancellation;
      try {
        const response = await api.api.plans({ id: saved.id }).improvements.post(request, { query: { stream: "true" }, fetch: { signal: cancellation.signal } });
        if (response.error) throw apiError(response.error.value, "Suggestions could not be generated.");
        if (!response.data || !(Symbol.asyncIterator in response.data)) throw new Error("The suggestions stream could not be opened. Please try again.");
        const result = await readImprovementStream(response.data, value => { if (!cancellation.signal.aborted) setProgress(value); }, value => { if (!cancellation.signal.aborted) setPlanPreview(value); });
        cancellation.signal.throwIfAborted();
        return { base: saved, request: { ...request, revision: result.revision }, proposal: result.proposal };
      } finally {
        cancellation.abort();
        if (controller.current === cancellation) controller.current = null;
      }
    },
    onSuccess: value => { setSuggestion(value); setReviewed(false); },
    retry: false,
  });
  const apply = useMutation({
    mutationFn: async () => {
      if (!suggestion || !reviewed) throw new Error("Review the suggested changes first.");
      const response = await api.api.plans({ id: saved.id }).improvements.apply.post({ ...suggestion.request, proposal: suggestion.proposal, reviewed: true });
      if (response.error) throw apiError(response.error.value, "The new draft could not be saved.");
      return savedPlanSchema.parse(response.data);
    },
    onSuccess: value => {
      client.setQueryData(savedPlanQuery(value.id).queryKey, value);
      void client.invalidateQueries({ queryKey: plansQuery.queryKey });
      setOpen(false); setSuggestion(null); setFeedback(""); setReviewed(false);
      onSaved(value);
    },
    retry: false,
  });
  const busy = generate.isPending || apply.isPending;
  const proposed = suggestion?.proposal.plan;
  const baseline = suggestion?.base.plan;
  const changes = proposed && baseline ? changedPlanChecks(baseline, proposed) : [];
  const scopeWarnings = proposed && baseline ? scopeReviewWarnings(baseline, proposed) : [];
  const hasChanges = Boolean(proposed && baseline && JSON.stringify(proposed) !== JSON.stringify(baseline));
  const stale = Boolean(suggestion && suggestion.request.revision !== saved.revision);
  const validation = proposed ? proofPlanSchema.safeParse(proposed) : null;

  function editStep(stepId: string, patch: Partial<ProofStep>) {
    setSuggestion(value => value?.proposal.plan ? { ...value, proposal: { ...value.proposal, plan: { ...value.proposal.plan,
      steps: value.proposal.plan.steps.map(step => step.id === stepId ? { ...step, ...patch } : step) } } } : value);
    setReviewed(false); apply.reset();
  }

  const reviewing = Boolean(suggestion);
  const responding = generate.isPending;
  const phase = reviewing || responding ? 2 : 1;
  const scopeNotes = suggestion?.proposal.scopeChanges.length ? suggestion.proposal.scopeChanges : scopeWarnings;
  const unchangedCount = baseline ? baseline.steps.filter(step => proposed?.steps.some(next => next.id === step.id && JSON.stringify(next) === JSON.stringify(step))).length : 0;

  function backToFeedback() {
    setSuggestion(null); setProgress(null); setPlanPreview(null); setReviewed(false); generate.reset(); apply.reset();
  }

  function close() {
    controller.current?.abort(); setOpen(false);
  }

  return <>
    <Button variant="ghost" size="sm" className="min-h-9 gap-2 text-xs text-muted-foreground hover:text-foreground" aria-label="Improve plan for future videos" title="Improve this plan using feedback from this recording" onClick={() => setOpen(true)}><FilePenLine className="size-4" aria-hidden="true" />Improve plan</Button>
    <Dialog open={open} onOpenChange={value => { if (!apply.isPending) { if (!value) controller.current?.abort(); setOpen(value); } }}>
      <DialogContent className="flex h-[min(740px,90dvh)] max-h-[90dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl" showCloseButton={!apply.isPending}>
        <DialogHeader className="shrink-0 border-b px-5 pt-5 pb-4 sm:px-6">
          <DialogTitle className="pr-8 text-lg">Improve your plan</DialogTitle>
          <DialogDescription>Refine your checks for the next recording.</DialogDescription>
          <ol className="mt-4 flex items-center gap-3 text-xs" aria-label="Plan improvement progress">
            <li aria-current={phase === 1 ? "step" : undefined} className={`flex items-center gap-2 ${phase === 1 ? "font-medium text-foreground" : "text-muted-foreground"}`}><span className={`flex size-5 items-center justify-center rounded-full text-[10px] ${phase === 1 ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{phase === 2 ? <Check className="size-3" aria-hidden="true" /> : "1"}</span>Your feedback</li>
            <li aria-hidden="true"><ArrowRight className="size-3 text-muted-foreground/60" /></li>
            <li aria-current={phase === 2 ? "step" : undefined} className={`flex items-center gap-2 ${phase === 2 ? "font-medium text-foreground" : "text-muted-foreground"}`}><span className={`flex size-5 items-center justify-center rounded-full text-[10px] ${phase === 2 ? "bg-primary text-primary-foreground" : "bg-muted"}`}>2</span>Review changes</li>
          </ol>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">
          {!reviewing && !responding ? <form id={`${id}-feedback-form`} className="space-y-5" onSubmit={event => { event.preventDefault(); generate.mutate(); }}>
            <fieldset disabled={busy}><legend className="mb-3 text-sm font-medium">What needs improvement?</legend><div className="flex flex-wrap gap-2">{issues.map(item => <label key={item.value} className={`flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 text-xs transition-colors ${issue === item.value ? "border-primary/60 bg-primary/5" : "hover:bg-muted/40"}`}><input type="radio" name={`${id}-issue`} value={item.value} checked={issue === item.value} onChange={() => setIssue(item.value)} className="accent-primary" />{item.label}</label>)}</div></fieldset>
            <div><label className="block text-sm font-medium" htmlFor={`${id}-feedback`}>What should work better?</label><p className="mt-1 mb-3 text-xs leading-5 text-muted-foreground">Tell us what was missed and what you want the next video to prove.</p><textarea id={`${id}-feedback`} aria-label="Describe what went wrong and what future videos should show" required minLength={1} maxLength={2000} rows={5} disabled={busy} value={feedback} onChange={event => setFeedback(event.target.value)} placeholder="For example: the wrong drawer was tracked. I want the plan to identify the drawer on the left." className="w-full resize-y rounded-lg border bg-background p-3 text-sm leading-6 outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/10" /></div>
            {generate.error && <p role="alert" className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive">{generate.error.message} Try again or adjust your feedback.</p>}
          </form> : <div className="space-y-5">
            <details className="group border-b pb-3"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs text-muted-foreground">Your feedback<ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden="true" /></summary><p className="mt-2 whitespace-pre-wrap text-sm leading-6">{suggestion?.request.feedback ?? feedback}</p></details>

            {responding ? <section aria-label="Live plan suggestions" aria-busy="true" className="space-y-5">
              <div className="flex items-center gap-2 text-xs text-muted-foreground" role="status"><LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />{planPreview ? "Drafting your changes" : progress?.explanation ? "Writing recommendation" : "Preparing your recommendation"}</div>
              {progress?.explanation ? <Recommendation content={progress.explanation} streaming={!planPreview && !progress.scopeChanges.length && !progress.filmingAdvice.length} /> : <div aria-hidden="true" className="space-y-3 py-2"><div className="h-3 w-1/3 animate-pulse rounded bg-muted" /><div className="h-2.5 w-full animate-pulse rounded bg-muted/70" /><div className="h-2.5 w-4/5 animate-pulse rounded bg-muted/70" /></div>}
              {Boolean(progress?.scopeChanges.length) && <ScopeNotes notes={progress!.scopeChanges} />}
              {Boolean(progress?.filmingAdvice.length) && <FilmingTips tips={progress!.filmingAdvice} />}
              {planPreview && <div className="border-t pt-4"><h3 className="text-sm font-medium">Proposed checks</h3><ul className="mt-2 divide-y">{planPreview.checks.map((check, index) => <li key={index} className="flex items-center gap-2 py-2 text-sm"><span className="flex size-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground">{index + 1}</span>{check}</li>)}</ul></div>}
            </section> : suggestion && <>
              <Recommendation content={suggestion.proposal.explanation} />
              {run.planVersion !== suggestion.base.version && <p className="text-xs text-muted-foreground">Recording: plan v{run.planVersion}. Comparing changes with your current plan v{suggestion.base.version}.</p>}
              {scopeNotes.length > 0 && <ScopeNotes notes={scopeNotes} />}
              {hasChanges ? <section aria-label="Suggested plan changes" className="space-y-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-sm font-semibold">Suggested changes</h3><p className="text-xs text-muted-foreground">{changes.length} {changes.length === 1 ? "check changed" : "checks changed"}{unchangedCount > 0 ? ` · ${unchangedCount} unchanged` : ""}</p></div>
                {changes.map(change => <section key={change.id} className="overflow-hidden rounded-xl border"><div className="flex items-center justify-between gap-3 border-b px-4 py-3"><h4 className="text-sm font-medium">{change.proposed?.label ?? change.previous?.label}</h4><span className="shrink-0 rounded bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{change.previous ? change.proposed ? "Updated" : "Removed" : "Added"}</span></div><div className="grid sm:grid-cols-2"><CheckSummary title="Current" step={change.previous} comparison={change.proposed} /><CheckSummary title="Proposed" step={change.proposed} comparison={change.previous} proposed /></div><details className="border-t"><summary className="cursor-pointer px-4 py-3 text-xs font-medium text-muted-foreground">Evidence details & editing</summary><div className="space-y-4 px-4 pb-4"><div className="grid gap-3 sm:grid-cols-2"><CheckDetails title="Current evidence" step={change.previous} /><CheckDetails title="Proposed evidence" step={change.proposed} /></div>{change.proposed?.requirements && <details><summary className="cursor-pointer py-2 text-xs font-medium">Edit suggested evidence</summary><fieldset disabled={busy}><EvidenceFields requirements={change.proposed.requirements} visualCheck={change.proposed.visualCheck} onChange={requirements => editStep(change.id, { requirements })} /></fieldset></details>}</div></details></section>)}
              </section> : <p className="text-sm text-muted-foreground">No plan edits needed. Use the filming tips for your next recording, or refine your feedback.</p>}
              {proposed && baseline && <details className="border-t pt-3"><summary className="cursor-pointer py-1 text-xs font-medium text-muted-foreground">Full plan comparison</summary><div className="mt-3 grid gap-4 sm:grid-cols-2">{[{ title: "Current plan", plan: baseline }, { title: "Proposed plan", plan: proposed }].map(({ title, plan }) => <div key={title} className="space-y-2 break-words rounded-lg bg-muted/30 p-3 text-xs leading-5"><h3 className="font-semibold">{title}</h3><p>{plan.title}</p><p>Goal: {plan.goal}</p><p>Checks: {plan.steps.map(step => step.label).join("; ")}</p><p>Required relationships: {plan.relationships?.map(rel => `${plan.steps.find(step => step.id === rel.from)?.label} · ${rel.type.replaceAll("_", " ")} · ${plan.steps.find(step => step.id === rel.to)?.label}`).join("; ") || "None"}</p><p>Unresolved goals: {plan.unresolvedGoals?.map(goal => `${goal.description} (${goal.status.replaceAll("_", " ")})`).join("; ") || "None"}</p><p>Limitations: {plan.limitations.join("; ") || "None listed"}</p></div>)}</div></details>}
              {suggestion.proposal.filmingAdvice.length > 0 && <FilmingTips tips={suggestion.proposal.filmingAdvice} expanded={!hasChanges} />}
              {stale && <p role="alert" className="text-sm text-destructive">Your plan changed. Go back and request fresh suggestions.</p>}
              {validation && !validation.success && <p role="alert" className="text-sm text-destructive">Review the edited evidence: {validation.error.issues[0]?.message}</p>}
              {apply.error && <p role="alert" className="text-sm text-destructive">{apply.error.message}</p>}
            </>}
          </div>}
        </div>

        <div className="shrink-0 space-y-3 border-t bg-background px-5 py-4 sm:px-6">
          {reviewing && hasChanges && <label className="flex items-start gap-2 text-xs leading-5"><input type="checkbox" className="mt-1 accent-primary" checked={reviewed} disabled={busy || stale} onChange={event => setReviewed(event.target.checked)} /><span>I’ve reviewed the changes to my checks and success criteria.</span></label>}
          <div className="flex items-center justify-between gap-3">
            {responding ? <><p className="text-xs text-muted-foreground">Suggestions appear as they’re ready.</p><Button variant="outline" size="sm" onClick={close}>Stop</Button></> : reviewing ? <><Button variant="ghost" size="sm" disabled={busy} onClick={backToFeedback}><ArrowLeft className="size-3.5" />Back</Button><div className="flex items-center gap-2"><Button variant="ghost" size="sm" aria-label="Close without saving" disabled={busy} onClick={() => setOpen(false)}><span className="sm:hidden">Discard</span><span className="hidden sm:inline">Close without saving</span></Button>{hasChanges && <Button size="sm" aria-label="Save draft & review plan" disabled={busy || stale || !reviewed || !validation?.success} onClick={() => apply.mutate()}>{apply.isPending ? "Saving…" : "Save draft"}<ArrowRight className="size-3.5" /></Button>}</div></> : <><Button variant="ghost" size="sm" onClick={close}>Cancel</Button><Button type="submit" size="sm" form={`${id}-feedback-form`} disabled={!feedback.trim()}><FilePenLine className="size-3.5" />Suggest improvements</Button></>}
          </div>
          {reviewing && hasChanges && <p className="text-right text-[11px] text-muted-foreground">Review and approve the draft before your next video.</p>}
        </div>
      </DialogContent>
    </Dialog>
  </>;
}

function Recommendation({ content, streaming = false }: { content: string; streaming?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const long = content.length > 500;
  return <section className="space-y-2"><h3 className="text-sm font-semibold">Recommendation</h3><div className={`text-sm leading-6 [&_.chat-markdown]:text-sm [&_.chat-markdown]:leading-6 ${long && !expanded ? "max-h-24 overflow-hidden" : ""}`}><ChatMarkdown content={content} streaming={streaming} /></div>{long && <button type="button" className="min-h-8 text-xs font-medium text-primary hover:underline" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? "Show less" : "Read full recommendation"}</button>}</section>;
}

function ScopeNotes({ notes }: { notes: string[] }) {
  return <section className="border-l-2 border-amber-500/60 bg-amber-500/5 py-2 pr-3 pl-3"><h3 className="text-xs font-semibold">Check what counts as success</h3><ul className="mt-1 list-disc space-y-1 pl-4 text-xs leading-5">{notes.map((note, index) => <li key={index}>{note}</li>)}</ul></section>;
}

function FilmingTips({ tips, expanded = false }: { tips: string[]; expanded?: boolean }) {
  return <details open={expanded || undefined} className="border-t pt-3"><summary className="cursor-pointer py-1 text-xs font-medium text-muted-foreground">Filming tips ({tips.length})</summary><ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-5">{tips.map((tip, index) => <li key={index}>{tip}</li>)}</ul></details>;
}

function CheckSummary({ title, step, comparison, proposed = false }: { title: string; step?: ProofStep; comparison?: ProofStep; proposed?: boolean }) {
  const requirementsChanged = step?.requirements && JSON.stringify(step.requirements) !== JSON.stringify(comparison?.requirements);
  return <div className={`min-w-0 space-y-2 p-4 ${proposed ? "border-t bg-primary/[0.03] sm:border-t-0 sm:border-l" : ""}`}><p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{title}</p>{step ? <><p className="text-sm font-medium">{step.label}</p><div className="break-words text-xs leading-5 text-muted-foreground">{requirementsChanged ? <ul className="space-y-2">{step.requirements!.map(requirement => <li key={requirement.id}><p>{requirement.description}</p>{JSON.stringify(requirement.decisiveDetails) !== JSON.stringify(comparison?.requirements?.find(previous => previous.id === requirement.id)?.decisiveDetails) && <p className="mt-1">Keep visible: {requirement.decisiveDetails.join("; ")}</p>}</li>)}</ul> : <p>{step.observableEvidence}</p>}</div></> : <p className="text-xs text-muted-foreground">{proposed ? "This check will be removed." : "New check."}</p>}</div>;
}

function CheckDetails({ title, step }: { title: string; step?: ProofStep }) {
  return <div className="min-w-0 space-y-2 break-words rounded-lg bg-muted/30 p-3 text-xs leading-5"><p className="font-semibold">{title}</p>{step ? <><p>Object: {step.subjectConcept}{step.targetConcept ? ` · Other object: ${step.targetConcept}` : ""}</p><p>Goal addressed: {step.goalSource ?? step.label}</p>{step.requirements?.map(requirement => <div key={requirement.id}><p className="font-medium">{requirement.phase}: {requirement.description}</p><p>Keep visible: {requirement.decisiveDetails.join("; ")}</p></div>)}</> : <p>This check is absent.</p>}</div>;
}

import { Check, ChevronDown, CircleHelp, Clock3, MessageCircle, Minus, Play } from "lucide-react";
import { formatTime } from "@/lib/evidence-presentation";
import { checkProgress } from "@/lib/verification-progress";
import { EvidenceMoments } from "./evidence-moments";
import { EvidenceRelationships } from "./evidence-relationships";
import { isActiveRun } from "../../../shared/receipt";
import type { RunDetails } from "../../../shared/verification";

const appearance = {
  observed: { Icon: Check, label: "Observed", hint: "Visible evidence supports this check." },
  not_observed: { Icon: Minus, label: "Not observed", hint: "The required evidence was not observed in the recording." },
  uncertain: { Icon: CircleHelp, label: "Uncertain", hint: "We couldn’t tell clearly. Review the video before deciding." },
};

export { formatTime } from "@/lib/evidence-presentation";

export function VerificationChecks({ run, selectedId, currentIds, playing, onInspect, compactHeader = false, onAsk }: { compactHeader?: boolean; onAsk?: (stepId: string) => void; run: RunDetails; selectedId: string | null; currentIds: string[]; playing: boolean; onInspect: (id: string, startMs: number) => void }) {
  const active = isActiveRun(run.state);
  const findings = run.state === "completed" ? run.receipt?.findings ?? [] : active ? run.partialFindings : [];
  return <section className="min-w-0" aria-label="Check results">
    <div className={compactHeader ? "sr-only" : "flex items-center justify-between gap-3 border-b px-4 py-3"}><div className="flex items-center gap-2"><h3 className="text-[14px] font-semibold tracking-tight">Your checks</h3><span className="rounded bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">{run.approvedPlan.steps.length}</span></div>{run.media && <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Play className="size-3" aria-hidden="true" />Select to play</span>}<p className="sr-only">{active ? "Checks update as evidence arrives. Early results are being confirmed." : run.state === "failed" || !run.receipt ? "No findings are available. Choose another video to try again." : "Select a check to inspect its video evidence."}</p></div>
    <ol className="divide-y" aria-live="polite">{run.approvedPlan.steps.map((step, index) => {
      const finding = findings.find((item) => item.stepId === step.id);
      const style = finding ? appearance[finding.status] : null;
      const Icon = style?.Icon ?? Clock3;
      const hasWindow = finding?.startMs !== null && finding?.startMs !== undefined && finding.endMs !== null;
      const current = currentIds.includes(step.id);
      const selected = selectedId === step.id;
      const stepActivity = active && !finding ? run.activity.filter(event => event.stepId === step.id).at(-1) : null;
      return <li key={step.id}><article aria-label={`Check ${index + 1}: ${step.label}`} aria-current={current ? "time" : undefined} data-status={finding?.status} className={`evidence-result-card relative px-4 py-3 transition-colors ${selected ? "bg-primary/[0.04]" : current ? "bg-muted/50" : "bg-card"}`}>
        {(selected || current) && <span className={`absolute inset-y-3 left-0 w-0.5 rounded-r ${selected ? "bg-primary" : "bg-emerald-600"}`} aria-hidden="true" />}
        <button type="button" className="group/cue flex w-full items-start gap-3 rounded-md py-1 text-left disabled:cursor-default" disabled={!finding || !run.media} title={current ? playing ? "Playing this evidence" : "At this evidence window" : finding ? "Play evidence" : undefined} aria-pressed={selected} aria-label={finding ? hasWindow ? `Watch evidence for check ${index + 1}, ${formatTime(finding.startMs!)}–${formatTime(finding.endMs!)}: ${step.label}` : `Review whole video for check ${index + 1}: ${step.label}` : `Check ${index + 1}: ${step.label}`} onClick={() => finding && onInspect(step.id, finding.startMs ?? 0)}>
          <span className={`relative mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium tabular-nums transition-colors ${selected ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground group-enabled/cue:group-hover/cue:border-primary/40 group-enabled/cue:group-hover/cue:text-primary"}`} aria-hidden="true"><span className={selected ? "invisible" : "group-enabled/cue:group-hover/cue:invisible"}>{String(index + 1).padStart(2, "0")}</span><Play className={`absolute size-3 ${current && playing ? "animate-pulse" : ""} ${selected ? "visible" : "invisible group-enabled/cue:group-hover/cue:visible"}`} /></span>
          <span className="block min-w-0 flex-1">
            <span className="block break-words text-[14px] font-semibold leading-5 tracking-[-0.01em] group-enabled/cue:group-hover/cue:text-primary">{step.label}</span>
            <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
              <span className="evidence-verdict inline-flex items-center gap-1 font-medium"><Icon className="size-3" aria-hidden="true" />{style ? active ? style.label + " · confirming" : style.label : active ? checkProgress(run, step.id) : "Not checked"}</span>
              {hasWindow && <span className="ml-auto whitespace-nowrap tabular-nums text-muted-foreground">{formatTime(finding.startMs!)}–{formatTime(finding.endMs!)}</span>}
              {finding && !hasWindow && <span className="ml-auto text-muted-foreground">Whole video</span>}
            </span>
          </span>
        </button>
        {stepActivity && <p className="mt-1 ml-10 text-[11px] leading-5 text-muted-foreground">{stepActivity.message}</p>}
        {finding && <div className="ml-10"><EvidenceMoments conditionLabel={step.visualCheck?.kind === "condition" ? ({ anytime: "Condition", start: "At the start", end: "At the end" }[step.visualCheck.timing]) : undefined} finding={finding} durationMs={run.durationMs} hasMedia={Boolean(run.media)} onInspect={onInspect} /></div>}
        {finding?.status === "uncertain" && <p className="mt-1 ml-10 text-[12px] leading-5 text-muted-foreground">{style?.hint}</p>}
        {finding && <>
          {!run.media && <p className="mt-1 ml-10 text-[12px] text-muted-foreground">The video evidence is unavailable.</p>}
          <details className="group/reason ml-10"><summary className="flex min-h-8 w-fit cursor-pointer list-none items-center gap-1 rounded-md py-1 text-[11px] text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">Why this result?<ChevronDown className="size-3 transition-transform group-open/reason:rotate-180" aria-hidden="true" /></summary><p className="mt-1 break-words text-sm leading-6 text-muted-foreground">{finding.explanation}</p>
            {finding.satisfiedRequirementIds?.map(id => <p key={id} className="text-sm">Satisfied: {step.requirements?.find(req => req.id === id)?.description ?? id}</p>)}
            {finding.evidence.length > 0 && <p className="mt-2 break-words text-xs leading-6 text-muted-foreground">Tracked evidence: {finding.evidence.map((item) => `${item.concept} · object ${item.objectId} · frame ${item.frameIndex}`).join(" / ")}</p>}</details>
          {onAsk && <button type="button" onClick={() => onAsk(step.id)} className="ml-10 mt-1 inline-flex min-h-9 items-center gap-1.5 rounded-md text-[11px] font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"><MessageCircle className="size-3" />Ask about this check</button>}
        </>}
      </article></li>;
    })}</ol>
    <EvidenceRelationships plan={run.approvedPlan} findings={findings} active={active} hasMedia={Boolean(run.media)} onInspect={onInspect} />
    <p className="border-t px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">Findings cover what’s visible in this recording. Hidden contents and internal condition cannot be confirmed.</p>
  </section>;
}

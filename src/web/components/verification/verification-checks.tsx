import { Check, ChevronDown, CircleHelp, Clock3, Minus, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isActiveRun } from "../../../shared/receipt";
import type { RunDetails } from "../../../shared/verification";

const appearance = {
  observed: { Icon: Check, label: "Observed", hint: "Visible evidence supports this action." },
  not_observed: { Icon: Minus, label: "Not observed", hint: "This action was not observed in the recording." },
  uncertain: { Icon: CircleHelp, label: "Uncertain", hint: "We couldn’t tell clearly. Review the video before deciding." },
};

export function formatTime(ms: number) { return `${(ms / 1000).toFixed(1)}s`; }

export function VerificationChecks({ run, selectedId, currentIds, playing, onInspect }: { run: RunDetails; selectedId: string | null; currentIds: string[]; playing: boolean; onInspect: (id: string, startMs: number) => void }) {
  const active = isActiveRun(run.state);
  const findings = run.state === "completed" ? run.receipt?.findings ?? [] : active ? run.partialFindings : [];
  return <section className="min-w-0" aria-label="Check results">
    <div className="flex items-center justify-between gap-3 border-b px-4 py-3"><div className="flex items-center gap-2"><h3 className="text-[14px] font-semibold tracking-tight">Your checks</h3><span className="rounded bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">{run.approvedPlan.steps.length}</span></div>{run.media && <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Play className="size-3" aria-hidden="true" />Select to play</span>}<p className="sr-only">{active ? "Checks update as evidence arrives. Early results are being confirmed." : run.state === "failed" || !run.receipt ? "No findings are available. Choose another video to try again." : "Select a check to inspect its video evidence."}</p></div>
    <ol className="divide-y" aria-live="polite">{run.approvedPlan.steps.map((step, index) => {
      const finding = findings.find((item) => item.stepId === step.id);
      const style = finding ? appearance[finding.status] : null;
      const Icon = style?.Icon ?? Clock3;
      const hasWindow = finding?.startMs !== null && finding?.startMs !== undefined && finding.endMs !== null;
      const current = currentIds.includes(step.id);
      const selected = selectedId === step.id;
      return <li key={step.id}><article aria-label={`Check ${index + 1}: ${step.label}`} aria-current={current ? "time" : undefined} className={`relative px-4 py-3 transition-colors ${selected ? "bg-primary/[0.04]" : current ? "bg-muted/50" : "bg-card"}`}>
        {(selected || current) && <span className={`absolute inset-y-3 left-0 w-0.5 rounded-r ${selected ? "bg-primary" : "bg-emerald-600"}`} aria-hidden="true" />}
        <button type="button" className="group/cue flex w-full items-start gap-3 rounded-md py-1 text-left disabled:cursor-default" disabled={!finding || !run.media} title={current ? playing ? "Playing this evidence" : "At this evidence window" : finding ? "Play evidence" : undefined} aria-pressed={selected} aria-label={finding ? hasWindow ? `Watch evidence for check ${index + 1}, ${formatTime(finding.startMs!)}–${formatTime(finding.endMs!)}: ${step.label}` : `Review whole video for check ${index + 1}: ${step.label}` : `Check ${index + 1}: ${step.label}`} onClick={() => finding && onInspect(step.id, finding.startMs ?? 0)}>
          <span className={`relative mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border text-[10px] font-medium tabular-nums transition-colors ${selected ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground group-enabled/cue:group-hover/cue:border-primary/40 group-enabled/cue:group-hover/cue:text-primary"}`} aria-hidden="true"><span className={selected ? "invisible" : "group-enabled/cue:group-hover/cue:invisible"}>{String(index + 1).padStart(2, "0")}</span><Play className={`absolute size-3 ${current && playing ? "animate-pulse" : ""} ${selected ? "visible" : "invisible group-enabled/cue:group-hover/cue:visible"}`} /></span>
          <span className="block min-w-0 flex-1">
            <span className="block break-words text-[14px] font-semibold leading-5 tracking-[-0.01em] group-enabled/cue:group-hover/cue:text-primary">{step.label}</span>
            <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
              <span className={`inline-flex items-center gap-1 font-medium ${finding?.status === "observed" ? "text-emerald-700" : finding?.status === "uncertain" ? "text-amber-800" : "text-muted-foreground"}`}><Icon className="size-3" aria-hidden="true" />{style ? active ? style.label + " · confirming" : style.label : active ? "Checking" : "Not checked"}</span>
              {hasWindow && <span className="ml-auto whitespace-nowrap tabular-nums text-muted-foreground">{formatTime(finding.startMs!)}–{formatTime(finding.endMs!)}</span>}
              {finding && !hasWindow && <span className="ml-auto text-muted-foreground">Whole video</span>}
            </span>
          </span>
        </button>
        {finding?.status === "uncertain" && <p className="mt-1 ml-10 text-[12px] leading-5 text-muted-foreground">{style?.hint}</p>}
        {finding && <>
          {!run.media && <p className="mt-1 ml-10 text-[12px] text-muted-foreground">The video evidence is unavailable.</p>}
          <details className="group/reason ml-10"><summary className="flex min-h-8 w-fit cursor-pointer list-none items-center gap-1 rounded-md py-1 text-[11px] text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">Why this result?<ChevronDown className="size-3 transition-transform group-open/reason:rotate-180" aria-hidden="true" /></summary><p className="mt-1 break-words text-sm leading-6 text-muted-foreground">{finding.explanation}</p>
            {finding.moments && finding.moments.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{finding.moments.map(moment => <Button key={moment.phase} variant="ghost" className="h-9 px-2 text-xs" disabled={!run.media} title={moment.description} aria-label={`Inspect ${moment.phase} evidence: ${moment.description}`} onClick={() => onInspect(step.id, moment.timestampMs)}>{moment.phase[0]!.toUpperCase() + moment.phase.slice(1)} · {formatTime(moment.timestampMs)}</Button>)}</div>}{finding.evidence.length > 0 && <p className="mt-2 break-words text-xs leading-6 text-muted-foreground">Tracked evidence: {finding.evidence.map((item) => `${item.concept} · object ${item.objectId} · frame ${item.frameIndex}`).join(" / ")}</p>}</details>
        </>}
      </article></li>;
    })}</ol>
    <p className="border-t px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">Findings cover what’s visible in this recording. Hidden contents and internal condition cannot be confirmed.</p>
  </section>;
}

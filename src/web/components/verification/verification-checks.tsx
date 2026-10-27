import { Check, CircleHelp, Clock3, Minus, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isActiveRun } from "../../../shared/receipt";
import type { RunDetails } from "../../../shared/verification";

const appearance = {
  observed: { Icon: Check, label: "Observed", circle: "bg-emerald-100 text-emerald-800", badge: "border-emerald-200 bg-emerald-50 text-emerald-800", border: "border-l-emerald-500", hint: "Visible evidence supports this action." },
  not_observed: { Icon: Minus, label: "Not observed", circle: "bg-slate-100 text-slate-700", badge: "border-slate-200 bg-slate-50 text-slate-700", border: "border-l-slate-400", hint: "This action was not observed in the recording." },
  uncertain: { Icon: CircleHelp, label: "Uncertain", circle: "bg-amber-100 text-amber-900", badge: "border-amber-200 bg-amber-50 text-amber-900", border: "border-l-amber-500", hint: "We couldn’t tell clearly. Review the video before deciding." },
};

export function formatTime(ms: number) { return `${(ms / 1000).toFixed(1)}s`; }

export function VerificationChecks({ run, selectedId, currentIds, playing, onInspect }: { run: RunDetails; selectedId: string | null; currentIds: string[]; playing: boolean; onInspect: (id: string, startMs: number) => void }) {
  const active = isActiveRun(run.state);
  return <section className="min-w-0 space-y-3 p-4 sm:p-5" aria-label="Check results">
    <div><h3 className="text-lg font-semibold">Your checks</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{active ? "Results appear when the video check finishes." : run.state === "failed" || !run.receipt ? "No findings are available. Choose another video to try again." : "Follow the current video moment beside each check."}</p></div>
    <ol className="space-y-3">{run.approvedPlan.steps.map((step, index) => {
      const finding = run.state === "completed" ? run.receipt?.findings.find((item) => item.stepId === step.id) : undefined;
      const style = finding ? appearance[finding.status] : null;
      const Icon = style?.Icon ?? Clock3;
      const hasWindow = finding?.startMs !== null && finding?.startMs !== undefined && finding.endMs !== null;
      const current = currentIds.includes(step.id);
      return <li key={step.id}><article aria-label={`Check ${index + 1}: ${step.label}`} aria-current={current ? "time" : undefined} className={`rounded-xl border border-l-4 p-3 sm:p-4 ${style?.border ?? "border-l-border"} ${current ? "bg-primary/3" : "bg-card"}`}>
        <div className="flex items-start gap-3"><span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${style?.circle ?? "bg-muted text-muted-foreground"}`}><Icon className="size-5" aria-hidden="true" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><span>Check {index + 1}</span><span title={current ? playing ? "Playing now" : "Current moment" : undefined} aria-hidden={!current} className={`inline-flex h-6 w-12 shrink-0 items-center text-xs font-semibold text-primary ${current ? "visible" : "invisible"}`}><span aria-hidden="true" className="inline-flex items-center gap-1">{playing ? <Play className="size-3" /> : <Pause className="size-3" />}{playing ? "Now" : "Here"}</span><span className="sr-only">{playing ? "Playing now" : "Current moment"}</span></span></div><span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-sm font-medium ${style?.badge ?? "bg-muted text-muted-foreground"}`}>{style?.label ?? (active ? "Pending" : "Not checked")}</span></div><h4 className="mt-2 break-words text-base font-semibold leading-6">{step.label}</h4></div></div>
        {(!finding || finding.status === "uncertain") && <p className="mt-2 text-sm leading-6 text-muted-foreground">{style?.hint ?? (active ? "Waiting for the evidence check." : "No verdict was produced for this check.")}</p>}
        {finding && <>
          <Button variant={selectedId === step.id ? "default" : "outline"} className="mt-3 h-auto min-h-11 w-full flex-wrap gap-x-2 gap-y-0 px-3 py-2 text-sm" disabled={!run.media} aria-pressed={selectedId === step.id} aria-label={hasWindow ? `Watch evidence for check ${index + 1}, ${formatTime(finding.startMs!)}–${formatTime(finding.endMs!)}` : `Review whole video for check ${index + 1}`} onClick={() => onInspect(step.id, finding.startMs ?? 0)}><Play className="size-4" aria-hidden="true" /><span>{hasWindow ? "Watch evidence" : "Review whole video"}</span>{hasWindow && <span>{formatTime(finding.startMs!)}–{formatTime(finding.endMs!)}</span>}</Button>
          {!run.media && <p className="mt-2 text-sm text-muted-foreground">The video evidence is unavailable.</p>}
          <details className="mt-1"><summary className="w-fit cursor-pointer rounded-md py-2 text-sm font-medium">Why this result?</summary><p className="mt-1 break-words text-sm leading-6 text-muted-foreground">{finding.explanation}</p>{finding.evidence.length > 0 && <p className="mt-2 break-words text-xs leading-6 text-muted-foreground">Tracked evidence: {finding.evidence.map((item) => `${item.concept} · object ${item.objectId} · frame ${item.frameIndex}`).join(" / ")}</p>}</details>
        </>}
      </article></li>;
    })}</ol>
    <p className="text-sm leading-6 text-muted-foreground">Results describe visible actions in this recording. Hidden contents and internal condition cannot be confirmed.</p>
  </section>;
}

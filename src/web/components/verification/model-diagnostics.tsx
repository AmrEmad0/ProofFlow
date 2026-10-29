import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowDownToLine, Check, ChevronDown, CircleHelp, LoaderCircle, Minus, Play, ScanLine, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/eden";
import { apiError } from "@/lib/queries";
import { downloadJson } from "@/lib/feedback";
import { ANALYSIS_FPS, type RunDetails } from "../../../shared/verification";
import { runDiagnosticsSchema, type StepCheck, type TrackWindow } from "../../../shared/diagnostics";

const verdicts = {
  observed: { label: "Observed", Icon: Check, color: "text-emerald-700 dark:text-emerald-400", background: "bg-emerald-500/10" },
  not_observed: { label: "Not observed", Icon: Minus, color: "text-muted-foreground", background: "bg-muted" },
  uncertain: { label: "Uncertain", Icon: CircleHelp, color: "text-amber-800 dark:text-amber-300", background: "bg-amber-500/10" },
};
const decisionLabels: Record<StepCheck["decision"], string> = {
  no_window: "Evidence window", contradictory_proposal: "Conflicting proposal", ambiguous_proposal: "Proposal clarity",
  subject_track: "Subject tracking", final_presence: "Final presence", state_change: "State change", visual_evidence: "Custom visual evidence",
  target_track: "Target tracking", entry_geometry: "Entry geometry", step_order: "Step order",
};
const time = (frame: number) => `${(frame / ANALYSIS_FPS).toFixed(2)}s`;

export function ModelDiagnostics({ run, onInspect }: { run: RunDetails; onInspect: (frame: number) => void }) {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ["run-diagnostics", run.id], enabled: open,
    queryFn: async () => {
      const result = await api.api.runs({ id: run.id }).diagnostics.get();
      if (result.error) throw apiError(result.error.value, "Model diagnostics could not be loaded.");
      return runDiagnosticsSchema.parse(result.data);
    },
    retry: false,
  });
  const data = query.data;
  const checks = data?.verification?.checks ?? [];
  const inspect = run.media ? onInspect : undefined;
  return <details className="group/diagnostics min-w-0 border-t" onToggle={(event) => { if (event.target === event.currentTarget) setOpen(event.currentTarget.open); }}>
    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 hover:bg-muted/30 sm:px-5 [&::-webkit-details-marker]:hidden">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl border bg-muted/30 text-muted-foreground"><Activity className="size-4" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1"><span className="block text-[14px] font-semibold">Model diagnostics</span><span className="mt-0.5 block text-[12px] leading-5 text-muted-foreground">Trace each result from model proposal to evidence rule.</span></span>
      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open/diagnostics:rotate-180" aria-hidden="true" />
    </summary>
    {open && <div className="space-y-4 border-t bg-muted/15 px-3 py-4 sm:px-5">
      {query.isPending && <p role="status" className="flex items-center gap-2 rounded-xl border bg-card p-4 text-[13px] text-muted-foreground"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Loading model proposals and tracking evidence…</p>}
      {query.isError && <div className="rounded-xl border bg-card p-4 text-[13px]"><p role="alert" className="text-destructive">{query.error.message}</p><Button variant="outline" className="mt-3" onClick={() => void query.refetch()}>Retry diagnostics</Button></div>}
      {data && <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[12px] leading-5"><p className="font-medium">{data.source === "saved" ? "Saved with this run" : "Replay of retained model data"}</p><p className="text-muted-foreground">Evidence rules {data.verification?.ruleVersion ?? "unavailable"}</p></div>
          <Button variant="outline" className="gap-2 bg-card text-[12px]" onClick={() => downloadJson({ run, diagnostics: data }, `proofflow-diagnostics-${run.id}.json`, "Model diagnostics")}><ArrowDownToLine className="size-3.5" aria-hidden="true" />Export JSON</Button>
        </div>
        {data.source === "replayed" && <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-[12px] leading-5 text-amber-900 dark:text-amber-200"><p className="font-semibold">Replayed with current rules</p><p className="mt-1">The original findings still use rules {data.originalRuleVersion ?? "unknown"}. Upload again to save a new run with current rules. This replay makes no model requests.</p></div>}
        {checks.length > 0 && <>
          <div className="flex flex-wrap gap-2" aria-label="Diagnostic check totals">{Object.entries(verdicts).map(([status, style]) => <span key={status} className={`inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-[12px] ${style.color}`}><style.Icon className="size-3.5" aria-hidden="true" /><strong className="tabular-nums">{checks.filter(check => check.finding.status === status).length}</strong>{style.label}</span>)}</div>
          <p className="text-[12px] leading-5 text-muted-foreground">Expand a check to inspect Muse Spark’s proposal, SAM 3.1 tracks, and the rule decision.{!run.media && " Video evidence is unavailable for this run."}</p>
        </>}
        <div className="space-y-3">{checks.map((check, index) => {
          const candidate = data.observation?.candidates.find(item => item.stepId === check.stepId);
          const step = run.approvedPlan.steps.find(item => item.id === check.stepId);
          const style = verdicts[check.finding.status];
          const hasWindow = check.firstFrame !== null && check.lastFrame !== null;
          return <details key={check.stepId} className="group/check min-w-0 overflow-hidden rounded-xl border bg-card">
            <summary className="flex cursor-pointer list-none items-start gap-3 p-4 hover:bg-muted/20 [&::-webkit-details-marker]:hidden">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg border bg-muted/30 text-[11px] tabular-nums text-muted-foreground">{String(index + 1).padStart(2, "0")}</span>
              <span className="min-w-0 flex-1"><span className="block break-words text-[14px] font-semibold leading-5">{step?.label ?? check.stepId}</span><span className="mt-2 flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium ${style.color} ${style.background}`}><style.Icon className="size-3" aria-hidden="true" />{style.label}</span><span className="text-[11px] text-muted-foreground">{decisionLabels[check.decision]}</span>{hasWindow && <span className="text-[11px] tabular-nums text-muted-foreground">{time(check.firstFrame!)}–{time(check.lastFrame!)}</span>}</span><span className="mt-2 block break-words text-[12px] leading-5 text-muted-foreground">{check.finding.explanation}</span></span>
              <ChevronDown className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-open/check:rotate-180" aria-hidden="true" />
            </summary>
            <div className="space-y-5 border-t p-4">
              <DiagnosticSection number="01" title="Muse Spark" subtitle="Visual proposal" icon={<Sparkles className="size-3.5" />}>
                {candidate ? <div className="space-y-3">
                  <dl className="grid gap-2 sm:grid-cols-3">{[["Before", candidate.visibleBefore], ["Action", candidate.observation], ["After", candidate.visibleAfter]].map(([label, value]) => <div key={label} className="min-w-0 rounded-lg border bg-muted/20 p-3"><dt className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</dt><dd className="mt-1.5 break-words text-[12px] leading-5">{value || "Not described"}</dd></div>)}</dl>
                  <div className="flex flex-wrap gap-1.5">{[
                    ["Action visible", candidate.actionVisible], ["Before matches", candidate.beforeMatches], ["After matches", candidate.afterMatches],
                    ["Whole clip examined", candidate.searchComplete], ["Non-occurrence visible", candidate.nonOccurrenceVisible],
                  ].map(([label, value]) => <span key={String(label)} className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] text-muted-foreground">{value ? <Check className="size-3" aria-hidden="true" /> : <Minus className="size-3" aria-hidden="true" />}{label}: {value ? "yes" : "no"}</span>)}</div>
                  <p className="text-[12px] leading-5 text-muted-foreground">Visibility: {candidate.visibility} · Proposal window: {candidate.startMs === null || candidate.endMs === null ? "not located" : `${(candidate.startMs / 1000).toFixed(2)}–${(candidate.endMs / 1000).toFixed(2)}s`}</p>
                  <p className="break-words text-[12px] leading-5 text-muted-foreground"><span className="font-medium text-foreground">Ambiguities: </span>{candidate.ambiguities.length ? candidate.ambiguities.join(" · ") : "none reported"}</p>
                </div> : <EmptyState>Muse returned no proposal for this step.</EmptyState>}
              </DiagnosticSection>
              <DiagnosticSection number="02" title="SAM 3.1" subtitle="Object identities & coverage" icon={<ScanLine className="size-3.5" />}>
                {hasWindow ? <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground"><span>Sampled frames {check.firstFrame}–{check.lastFrame}</span><span className="flex gap-3 text-foreground"><span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-primary" />Detected</span><span className="flex items-center gap-1"><span className="size-2 rounded-sm border bg-muted" />Missing</span></span></div>
                  {check.subject && <TrackCoverage label="Subject" track={check.subject} first={check.firstFrame!} last={check.lastFrame!} onInspect={inspect} />}
                  {check.target && <TrackCoverage label="Target" track={check.target} first={check.firstFrame!} last={check.lastFrame!} onInspect={inspect} />}
                  {!check.subject && !check.target && <EmptyState>No object tracks were evaluated for this check.</EmptyState>}
                  <p className="text-[11px] leading-5 text-muted-foreground">Missing detections indicate a tracking gap; they do not establish that an action never happened.</p>
                </div> : <EmptyState>No sampled evidence window is available.</EmptyState>}
              </DiagnosticSection>
              <DiagnosticSection number="03" title="Evidence rule" subtitle={decisionLabels[check.decision]} icon={<Activity className="size-3.5" />}>
                {check.regionCandidates.length > 0 ? <Containment check={check} /> : <p className="text-[12px] leading-5 text-muted-foreground">{check.finding.explanation}</p>}
                {hasWindow && inspect && <InspectButton frame={check.firstFrame!} onInspect={inspect} />}
              </DiagnosticSection>
            </div>
          </details>;
        })}</div>
        {!data.verification && <EmptyState>No evidence check was produced. Retained tracking diagnostics are shown below when available.</EmptyState>}
        {data.verification && checks.length === 0 && <EmptyState>No step checks were retained for this run.</EmptyState>}
        {data.observation && <p className="break-words text-[12px] leading-5 text-muted-foreground"><span className="font-medium text-foreground">Muse omissions: </span>{data.observation.omissions.length ? data.observation.omissions.join(" · ") : "none reported"}</p>}
        {data.tracking.length > 0 && <details className="group/output rounded-xl border bg-card"><summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[12px] font-medium [&::-webkit-details-marker]:hidden">SAM output handling<span className="text-[11px] font-normal text-muted-foreground">{data.tracking.length} concepts</span><ChevronDown className="ml-auto size-3.5 text-muted-foreground group-open/output:rotate-180" aria-hidden="true" /></summary><div className="space-y-3 border-t p-4">{data.tracking.map(track => <div key={track.concept} className="text-[12px] leading-5"><p className="break-words font-medium">{track.concept}</p><dl className="mt-2 grid grid-cols-3 gap-2">{[["Received", track.receivedBoxes], ["Usable", track.retainedBoxes], ["Low confidence", track.lowConfidenceBoxes]].map(([label, value]) => <div key={label} className="rounded-lg bg-muted/40 p-2"><dt className="text-[10px] text-muted-foreground">{label}</dt><dd className="mt-1 font-semibold tabular-nums">{value}</dd></div>)}</dl><p className="mt-2 text-[11px] text-muted-foreground">Confidence threshold: {track.confidenceThreshold}</p>{track.issue && <p className="mt-1 text-destructive">Rejected: {track.issue.replaceAll("_", " ")}</p>}</div>)}</div></details>}
        <p className="text-[11px] leading-5 text-muted-foreground">Export includes validated model proposals, usable geometry, timings, and rule decisions. Raw model streams stay in private server storage until the video is deleted.</p>
      </>}
    </div>}
  </details>;
}

function DiagnosticSection({ number, title, subtitle, icon, children }: { number: string; title: string; subtitle: string; icon: ReactNode; children: ReactNode }) {
  return <section className="min-w-0"><div className="mb-3 flex flex-wrap items-center gap-2 text-[12px]"><span className="text-[10px] tabular-nums text-muted-foreground">{number}</span><span className="text-muted-foreground" aria-hidden="true">{icon}</span><h5 className="font-semibold">{title}</h5><span className="text-[11px] text-muted-foreground">/ {subtitle}</span></div>{children}</section>;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed bg-muted/20 p-3 text-[12px] leading-5 text-muted-foreground">{children}</p>;
}

function InspectButton({ frame, onInspect }: { frame: number; onInspect: (frame: number) => void }) {
  return <button type="button" className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 text-[12px] font-medium text-primary hover:bg-primary/5" onClick={() => onInspect(frame)}><Play className="size-3" aria-hidden="true" />Inspect {time(frame)}</button>;
}

function TrackCoverage({ label, track, first, last, onInspect }: { label: string; track: TrackWindow; first: number; last: number; onInspect?: (frame: number) => void }) {
  const count = last - first + 1;
  return <div className="min-w-0 space-y-2 rounded-lg border p-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><h6 className="break-words text-[12px] font-semibold">{label}: {track.concept}</h6><span className="rounded-md bg-muted px-2 py-1 text-[10px] text-muted-foreground">{track.outcome}</span></div>
    <p className="text-[11px] leading-5 text-muted-foreground">{track.objects.length} identities · {track.missingFrames.length} frames without detections · {track.multipleFrames.length} with multiple detections</p>
    {track.objects.length === 0 && <EmptyState>No usable object identities in this window.</EmptyState>}
    {track.objects.map(object => {
      const missingFrames = new Set(object.missingFrames);
      return <div key={object.objectId} className={`min-w-0 rounded-lg border p-3 ${object.objectId === track.selectedObjectId ? "border-primary/30 bg-primary/5" : "bg-muted/15"}`}>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]"><span className="break-all font-medium">Object #{object.objectId}{object.objectId === track.selectedObjectId && <span className="ml-2 text-[10px] text-primary">Selected identity</span>}</span><span className="tabular-nums text-muted-foreground">{object.frames}/{count} frames</span></div>
        <svg className="mt-3 h-3 w-full" viewBox={`0 0 ${Math.max(1, count)} 1`} preserveAspectRatio="none" role="img" aria-label={`Object ${object.objectId}: ${object.frames} of ${count} sampled frames detected`}>
          {Array.from({ length: Math.max(0, count) }, (_, index) => { const frame = first + index; const missing = missingFrames.has(frame); return <rect key={frame} x={index} width="0.85" height="1" className={missing ? "fill-muted stroke-border" : "fill-primary"} strokeWidth="0.04"><title>Frame {frame} · {time(frame)} · {missing ? "missing" : "detected"}</title></rect>; })}
        </svg>
        <div className="mt-1.5 flex justify-between text-[10px] tabular-nums text-muted-foreground"><span>{time(first)}</span><span>{time(last)}</span></div>
        {object.duplicateFrames.length > 0 && <p className="mt-2 text-[11px] text-muted-foreground">{object.duplicateFrames.length} duplicate frames</p>}
        {object.missingFrames.length > 0 && <details className="mt-2"><summary className="cursor-pointer text-[11px] text-muted-foreground">{object.missingFrames.length} missing frames</summary><p className="mt-1 break-words text-[11px] leading-5 text-muted-foreground">{object.missingFrames.join(", ")}</p></details>}
        {onInspect && <InspectButton frame={object.firstFrame} onInspect={onInspect} />}
      </div>;
    })}
    {track.selectedObjectId === null && <p className="text-[11px] text-muted-foreground">No identity selected.</p>}
  </div>;
}

function Containment({ check }: { check: StepCheck }) {
  return <div className="space-y-3"><p className="text-[12px] leading-5 text-muted-foreground">Entry needs an outside sample (≤5%), then ≥95% containment in three consecutive samples within one uninterrupted track segment. Muse must clearly describe the action and both states. The object pairing must be unique and retain identities established by earlier steps.</p>
    {check.regionCandidates.map((region, index) => {
      const first = check.firstFrame ?? region.containment[0]?.frameIndex ?? 0;
      const last = check.lastFrame ?? region.containment.at(-1)?.frameIndex ?? first;
      const x = (frame: number) => 32 + (frame - first) * 276 / Math.max(1, last - first);
      const y = (ratio: number) => 85 - ratio * 70;
      return <div key={`${region.objectId}-${index}`} className="min-w-0 rounded-lg border bg-muted/15 p-3">
        <p className="break-words text-[12px] font-medium">Target #{region.objectId}</p><p className="mt-1 text-[11px] leading-5 text-muted-foreground">{region.qualifies ? "Geometry supports entry" : "Geometry does not support entry"} · {region.outsideFrame !== null ? `outside at ${time(region.outsideFrame)}` : "no outside sample"}</p>
        {region.containment.length ? <>
          <svg className="mt-3 h-28 w-full" viewBox="0 0 320 104" role="img" aria-label={`Subject containment for target ${region.objectId}. Dashed thresholds at 5 and 95 percent. Gaps indicate missing samples.`}>
            {[0.95, 0.05].map(ratio => <g key={ratio}><text x="0" y={y(ratio) + 3} className="fill-muted-foreground" fontSize="9">{ratio * 100}%</text><line x1="32" x2="308" y1={y(ratio)} y2={y(ratio)} className="stroke-border" strokeDasharray="4 3" /></g>)}
            {region.containment.map((sample, sampleIndex) => {
              const previous = region.containment[sampleIndex - 1];
              return <g key={sample.frameIndex}>
                {previous && sample.frameIndex === previous.frameIndex + 1 && <line x1={x(previous.frameIndex)} y1={y(previous.ratio)} x2={x(sample.frameIndex)} y2={y(sample.ratio)} className="stroke-primary" strokeWidth="2" />}
                <circle cx={x(sample.frameIndex)} cy={y(sample.ratio)} r="2.5" className="fill-primary"><title>Frame {sample.frameIndex} · {time(sample.frameIndex)}: {(sample.ratio * 100).toFixed(1)}% containment</title></circle>
              </g>;
            })}
          </svg>
          <div className="flex flex-wrap justify-between gap-2 text-[10px] tabular-nums text-muted-foreground"><span>{time(first)}</span><span>Containment · gaps = missing samples</span><span>{time(last)}</span></div>
        </> : <p className="mt-3 text-[12px] text-muted-foreground">No containment samples available.</p>}
      </div>;
    })}
  </div>;
}

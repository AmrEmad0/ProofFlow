import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownToLine, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/eden";
import { apiError } from "@/lib/queries";
import { downloadJson } from "@/lib/feedback";
import { ANALYSIS_FPS, type RunDetails } from "../../../shared/verification";
import { runDiagnosticsSchema, type StepCheck, type TrackWindow } from "../../../shared/diagnostics";

const statusLabels = { observed: "Observed", not_observed: "Not observed", uncertain: "Uncertain" };
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
  return <details className="border-t p-5" onToggle={(event) => { if (event.target === event.currentTarget) setOpen(event.currentTarget.open); }}>
    <summary className="cursor-pointer text-sm font-medium">Model diagnostics</summary>
    <p className="mt-2 text-xs leading-5 text-muted-foreground">Inspect Muse’s proposals, SAM object identities, and the evidence rule behind each result.</p>
    {open && query.isPending && <p role="status" className="mt-4 flex items-center gap-2 text-xs"><LoaderCircle className="size-4 animate-spin" />Loading diagnostics…</p>}
    {query.isError && <div className="mt-4 text-xs"><p role="alert" className="text-destructive">{query.error.message}</p><Button variant="outline" className="mt-2" onClick={() => void query.refetch()}>Retry diagnostics</Button></div>}
    {data && <div className="mt-4 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[11px] text-muted-foreground">Evidence rules {data.verification?.ruleVersion ?? "unavailable"} · {data.source === "saved" ? "Saved with this run" : "Replay of retained model data"}</p>
        <Button variant="outline" className="h-8 gap-2 text-xs" onClick={() => downloadJson({ run, diagnostics: data }, `proofflow-diagnostics-${run.id}.json`, "Model diagnostics")}><ArrowDownToLine className="size-3" />Export diagnostics</Button>
      </div>
      {data.source === "replayed" && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">These checks replay the retained outputs with the current rules. The original findings above still use rules {data.originalRuleVersion ?? "unknown"}. Upload again to save a new run with the current rules; this replay makes no model requests.</p>}
      {data.verification?.checks.map((check) => {
        const candidate = data.observation?.candidates.find((item) => item.stepId === check.stepId);
        const step = run.approvedPlan.steps.find((item) => item.id === check.stepId);
        return <article key={check.stepId} className="space-y-4 rounded-xl border p-4">
          <div><h4 className="text-sm font-medium">{step?.label ?? check.stepId}</h4><p className="mt-1 text-xs text-muted-foreground">Evidence check: {statusLabels[check.finding.status]} · {check.decision.replaceAll("_", " ")}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{check.finding.explanation}</p></div>
          {candidate ? <div className="space-y-3 text-xs leading-5">
            <h5 className="font-medium">Muse proposal</h5>
            <dl className="space-y-2"><Description label="Before" value={candidate.visibleBefore} /><Description label="Action" value={candidate.observation} /><Description label="After" value={candidate.visibleAfter} /></dl>
            <div className="flex flex-wrap gap-1.5">{[
              ["Action visible", candidate.actionVisible], ["Before matches", candidate.beforeMatches], ["After matches", candidate.afterMatches],
              ["Whole clip examined", candidate.searchComplete], ["Non-occurrence visible", candidate.nonOccurrenceVisible],
            ].map(([label, value]) => <span key={String(label)} className="rounded border bg-muted/30 px-2 py-0.5 text-[10px]">{label}: {value ? "yes" : "no"}</span>)}<span className="rounded border px-2 py-0.5 text-[10px]">Visibility: {candidate.visibility}</span></div>
            <p className="text-muted-foreground">Muse window: {candidate.startMs === null ? "not located" : `${(candidate.startMs / 1000).toFixed(2)}–${(candidate.endMs! / 1000).toFixed(2)}s`}</p>
            <p className="text-muted-foreground">Ambiguities: {candidate.ambiguities.length ? candidate.ambiguities.join(" · ") : "none reported"}</p>
          </div> : <p className="text-xs text-muted-foreground">Muse returned no proposal for this step.</p>}
          {check.firstFrame !== null && check.lastFrame !== null && <>
            <p className="text-[11px] text-muted-foreground">Sampled window: frames {check.firstFrame}–{check.lastFrame} · {time(check.firstFrame)}–{time(check.lastFrame)}</p>
            {check.subject && <TrackCoverage label="Subject" track={check.subject} first={check.firstFrame} last={check.lastFrame} onInspect={onInspect} />}
            {check.target && <TrackCoverage label="Target" track={check.target} first={check.firstFrame} last={check.lastFrame} onInspect={onInspect} />}
            {check.regionCandidates.length > 0 && <Containment check={check} />}
          </>}
        </article>;
      })}
      {!data.verification && <p className="text-xs text-muted-foreground">No evidence check was produced. Retained tracking diagnostics are shown below when available.</p>}
      {data.observation && <p className="text-xs leading-5 text-muted-foreground">Muse omissions: {data.observation.omissions.length ? data.observation.omissions.join(" · ") : "none reported"}</p>}
      {data.tracking.length > 0 && <div className="space-y-2"><h4 className="text-xs font-medium">SAM output handling</h4>{data.tracking.map((track) => <p key={track.concept} className="text-[11px] leading-5 text-muted-foreground">{track.concept}: {track.receivedBoxes} boxes received, {track.retainedBoxes} usable, {track.lowConfidenceBoxes} below confidence {track.confidenceThreshold}.{track.issue ? ` Rejected: ${track.issue.replaceAll("_", " ")}.` : ""}</p>)}</div>}
      <p className="text-[10px] leading-5 text-muted-foreground">Export includes validated model proposals, usable geometry, timings, and rule decisions. Raw model streams stay in private server storage and expire with this video.</p>
    </div>}
  </details>;
}

function Description({ label, value }: { label: string; value: string }) {
  return <div><dt className="font-medium">{label}</dt><dd className="text-muted-foreground">{value || "Not described"}</dd></div>;
}

function TrackCoverage({ label, track, first, last, onInspect }: { label: string; track: TrackWindow; first: number; last: number; onInspect: (frame: number) => void }) {
  const count = last - first + 1;
  return <div className="space-y-2">
    <h5 className="text-xs font-medium">{label}: {track.concept} <span className="font-normal text-muted-foreground">· {track.outcome}{track.selectedObjectId !== null ? ` · selected #${track.selectedObjectId}` : " · no identity selected"}</span></h5>
    <p className="text-[11px] text-muted-foreground">{track.objects.length} identities · {track.missingFrames.length} frames without detections · {track.multipleFrames.length} frames with multiple detections</p>
    {track.objects.map((object) => <div key={object.objectId} className={`rounded-lg border p-2.5 ${object.objectId === track.selectedObjectId ? "border-primary/50 bg-primary/5" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]"><span>Object #{object.objectId} · {object.frames}/{count} frames{object.duplicateFrames.length ? ` · ${object.duplicateFrames.length} duplicate frames` : ""}</span><button className="rounded text-primary underline underline-offset-2 focus-visible:outline-2" onClick={() => onInspect(object.firstFrame)}>Inspect {time(object.firstFrame)}</button></div>
      <svg className="mt-2 h-3 w-full" viewBox={`0 0 ${Math.max(1, count)} 1`} preserveAspectRatio="none" role="img" aria-label={`Object ${object.objectId}: ${object.frames} of ${count} sampled frames present`}>
        {Array.from({ length: Math.max(0, count) }, (_, index) => { const frame = first + index; const missing = object.missingFrames.includes(frame); return <rect key={frame} x={index} width="0.85" height="1" className={missing ? "fill-muted" : "fill-primary"}><title>Frame {frame} · {time(frame)} · {missing ? "missing" : "present"}</title></rect>; })}
      </svg>
      {object.missingFrames.length > 0 && <p className="mt-1 break-words text-[10px] text-muted-foreground">Missing frames: {object.missingFrames.join(", ")}</p>}
    </div>)}
  </div>;
}

function Containment({ check }: { check: StepCheck }) {
  return <div className="space-y-3"><h5 className="text-xs font-medium">Subject containment in each continuous target</h5><p className="text-[11px] leading-5 text-muted-foreground">Entry needs an outside sample (≤5%), then ≥95% containment in the final three samples. Muse must also clearly describe the action and both states. The target pairing must be unique.</p>
    {check.regionCandidates.map((region) => <div key={region.objectId} className="rounded-lg border p-3">
      <p className="text-[11px]">Target #{region.objectId} · {region.qualifies ? "geometry supports entry" : "geometry does not support entry"}{region.outsideFrame !== null ? ` · outside at frame ${region.outsideFrame}` : " · no outside sample"}</p>
      <svg className="mt-2 h-20 w-full overflow-visible" viewBox="0 0 320 80" preserveAspectRatio="none" role="img" aria-label={`Containment across the sampled window for target ${region.objectId}`}>
        <line x1="0" x2="320" y1="8.5" y2="8.5" className="stroke-border" strokeDasharray="4 3" /><line x1="0" x2="320" y1="71.5" y2="71.5" className="stroke-border" strokeDasharray="4 3" />
        <polyline points={region.containment.map((sample, index) => `${index * 320 / Math.max(1, region.containment.length - 1)},${75 - sample.ratio * 70}`).join(" ")} fill="none" className="stroke-primary" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {region.containment.map((sample, index) => <circle key={sample.frameIndex} cx={index * 320 / Math.max(1, region.containment.length - 1)} cy={75 - sample.ratio * 70} r="2" className="fill-primary"><title>Frame {sample.frameIndex}: {(sample.ratio * 100).toFixed(1)}% containment</title></circle>)}
      </svg>
      <div className="flex justify-between text-[10px] text-muted-foreground"><span>Frame {region.containment[0]?.frameIndex}</span><span>0–100% containment</span><span>Frame {region.containment.at(-1)?.frameIndex}</span></div>
    </div>)}
  </div>;
}

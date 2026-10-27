import { useEffect, useRef, useState } from "react";
import { Check, CircleHelp, Eye, Play, ScanLine, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import type { RunDetails } from "../../../shared/verification";

const colors = ["#c2410c", "#0369a1", "#047857", "#7c3aed"];
const labels = { observed: "Observed", not_observed: "Not observed", uncertain: "Uncertain" };
const icons = { observed: Check, not_observed: X, uncertain: CircleHelp };
const tone = { observed: "border-emerald-200 bg-emerald-50 text-emerald-800", not_observed: "border-slate-200 bg-slate-50 text-slate-700", uncertain: "border-amber-200 bg-amber-50 text-amber-900" };
export function formatTime(ms: number) { return `${(ms / 1000).toFixed(1)}s`; }

export function EvidencePlayer({ run }: { run: RunDetails }) {
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [overlays, setOverlays] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const frame = Math.min((run.media?.frameCount ?? 1) - 1, Math.max(0, Math.round(time * 6)));
  useEffect(() => {
    const element = video.current;
    if (!element?.requestVideoFrameCallback) return;
    let id: number;
    const tick: VideoFrameRequestCallback = (_now, metadata) => {
      setTime(metadata.mediaTime);
      id = element.requestVideoFrameCallback(tick);
    };
    id = element.requestVideoFrameCallback(tick);
    return () => element.cancelVideoFrameCallback(id);
  }, [run.id, run.media]);

  function reportPlaybackError(message: string) {
    setPlaybackError(message);
    toast.add({ id: `playback-${run.id}`, type: "error", title: "Video playback unavailable", description: message });
  }

  function seek(stepId: string, startMs: number) {
    setSelected(stepId);
    const element = video.current;
    if (!element) return;
    element.currentTime = startMs / 1000;
    setTime(startMs / 1000);
    void element.play().catch(() => { reportPlaybackError("Playback could not start. Use the video controls to inspect the evidence."); });
  }

  return <section className="overflow-hidden rounded-2xl border bg-card" aria-label="Video evidence and findings">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4"><h2 className="flex items-center gap-2 text-sm font-semibold"><Eye className="size-4 text-primary" aria-hidden="true" />Inspect the evidence</h2><label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground"><input type="checkbox" checked={overlays} onChange={(event) => setOverlays(event.target.checked)} className="accent-primary" />SAM object boxes</label></div>
    {run.media ? <>
      <div className="bg-stone-950 p-3 sm:p-5"><div className="relative mx-auto w-full max-w-2xl" style={{ aspectRatio: `${run.media.width}/${run.media.height}` }}>
        <video ref={video} controls playsInline preload="metadata" src={`/api/runs/${run.id}/video`} className="size-full" aria-label="Analysis video for this approved proof plan" onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)} onError={() => reportPlaybackError("The video could not be loaded. It may have expired; reload the run to check.")} />
        {overlays && <svg className="pointer-events-none absolute inset-0 size-full" viewBox="0 0 1 1" preserveAspectRatio="none" aria-label={`Tracked object geometry at ${formatTime(time * 1000)}`}>{run.tracks.flatMap((track, index) => track.boxes.filter((box) => box.frameIndex === frame).map((box) => <rect key={`${track.concept}-${box.objectId}-${box.frameIndex}`} x={box.left} y={box.top} width={box.right - box.left} height={box.bottom - box.top} fill="none" stroke={colors[index % colors.length]} strokeWidth="2" vectorEffect="non-scaling-stroke" />))}</svg>}
      </div></div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3 text-[10px] text-muted-foreground"><span>Analysis copy · 6 fps · audio removed</span><span>Frame {frame} · {formatTime(time * 1000)}</span></div>
      {playbackError && <p role="alert" className="px-5 pt-4 text-xs text-destructive">{playbackError}</p>}
      {run.tracks.length > 0 && <div className="flex flex-wrap gap-3 px-5 pt-4">{run.tracks.map((track, index) => <span key={track.concept} className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><span className="size-2 rounded-sm" style={{ backgroundColor: colors[index % colors.length] }} />{track.concept}{track.outcome === "failed" ? " · unavailable" : track.boxes.length === 0 ? " · no usable track" : ""}</span>)}</div>}
    </> : <div className="flex min-h-64 items-center justify-center gap-2 bg-muted/30 p-6 text-sm text-muted-foreground"><ScanLine className="size-5" aria-hidden="true" />The analysis copy will appear after preprocessing.</div>}
    {run.receipt ? <div className="space-y-3 p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Reviewable findings</h3><span className="text-[10px] text-muted-foreground">Click a finding to inspect its moment</span></div>
      {run.receipt.findings.map((finding) => {
        const step = run.approvedPlan.steps.find((item) => item.id === finding.stepId);
        const Icon = icons[finding.status];
        return <article key={finding.stepId} className={`rounded-xl border p-4 ${selected === finding.stepId ? "ring-2 ring-primary/30" : ""}`}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-medium">{step?.label ?? finding.stepId}</h4><span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium ${tone[finding.status]}`}><Icon className="size-3" aria-hidden="true" />{labels[finding.status]}</span></div>
          <p className="text-xs leading-5 text-muted-foreground">{finding.explanation}</p>
          {finding.startMs !== null && finding.endMs !== null && <Button variant="outline" className="mt-3 h-8 gap-2 rounded-lg px-3 text-[11px]" onClick={() => seek(finding.stepId, finding.startMs!)}><Play className="size-3" />Inspect {formatTime(finding.startMs)}–{formatTime(finding.endMs)}</Button>}
          {finding.evidence.length > 0 && <p className="mt-2 text-[10px] leading-4 text-muted-foreground">{finding.evidence.map((item) => `${item.concept} · object ${item.objectId} · frame ${item.frameIndex}`).join(" / ")}</p>}
        </article>;
      })}
      <p className="pt-1 text-[11px] leading-5 text-muted-foreground">These findings concern visible evidence in a sampled recording. They do not certify hidden contents, internal condition, or actions outside the clip.</p>
    </div> : <div className="p-5 text-xs leading-5 text-muted-foreground">{run.state === "failed" ? "This run produced no verdict. Review the error and try another recording." : "Findings appear after both visual analysis and the application's evidence checks finish."}</div>}
  </section>;
}

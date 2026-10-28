import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowDownToLine, LoaderCircle, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { apiError } from "@/lib/queries";
import { withFeedback } from "@/lib/feedback";
import { ANALYSIS_FPS, TRACK_COLORS as colors, type RunDetails } from "../../../shared/verification";
import { isActiveRun } from "../../../shared/receipt";
import { FrameInspector } from "./frame-inspector";
import { ModelDiagnostics } from "./model-diagnostics";
import { formatTime, VerificationChecks } from "./verification-checks";

async function downloadVideo(id: string, variant: "tracked" | "analysis") {
  const response = await fetch(`/api/runs/${id}/video?download=true&variant=${variant}`);
  if (!response.ok) throw apiError(await response.json().catch(() => null), "The video could not be downloaded. Please try again.");
  if (!response.headers.get("content-type")?.startsWith("video/mp4")) throw new Error("The server did not return an MP4 video.");
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  try {
    link.href = url; link.download = `proofflow-${id}-${variant}.mp4`; link.hidden = true;
    document.body.append(link); link.click();
  } finally { link.remove(); URL.revokeObjectURL(url); }
}

export function EvidencePlayer({ run, autoPlay = true }: { run: RunDetails; autoPlay?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);
  const playerHeading = useRef<HTMLHeadingElement>(null);
  const pendingPosition = useRef<{ seconds: number; play: boolean } | null>(null);
  const [time, setTime] = useState(0);
  const [overlays, setOverlays] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [hasPosition, setHasPosition] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const download = useMutation({ mutationFn: (variant: "tracked" | "analysis") => withFeedback(downloadVideo(run.id, variant), {
    loading: variant === "analysis" ? "Preparing analysis video…" : "Preparing video with SAM boxes…", success: "Video download started", error: "Couldn’t download video",
  }), retry: false });
  const hasMedia = Boolean(run.media);
  useEffect(() => {
    if (!autoPlay) { video.current?.pause(); return; }
    if (run.state === "completed" && hasMedia) {
      void video.current?.play().catch(() => { /* Native controls remain available when autoplay is blocked. */ });
    }
  }, [run.state, hasMedia, autoPlay]);

  const availableFindings = run.state === "completed" ? run.receipt?.findings ?? [] : isActiveRun(run.state) ? run.partialFindings : [];
  const frame = Math.min((run.media?.frameCount ?? 1) - 1, Math.max(0, Math.floor(time * ANALYSIS_FPS + 0.0001)));
  // Match the displayed sample so rounded time bounds still include their last frame.
  const frameTimeMs = Math.round(frame * 1000 / ANALYSIS_FPS);
  const currentSteps = run.media && hasPosition
    ? run.approvedPlan.steps.filter((step) => availableFindings.some((finding) => finding.stepId === step.id
      && finding.startMs !== null && finding.endMs !== null && frameTimeMs >= finding.startMs && frameTimeMs <= finding.endMs))
    : [];
  useEffect(() => {
    const element = video.current;
    if (!element?.requestVideoFrameCallback) return;
    let id: number;
    const tick: VideoFrameRequestCallback = (_now, metadata) => {
      // A queued callback can describe the old frame after a paused seek.
      if (!element.paused && !element.seeking) setTime(metadata.mediaTime);
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
    setPlaybackError(null);
    const element = video.current;
    if (!element) return;
    pendingPosition.current = { seconds: startMs / 1000, play: true };
    applyPosition();
    playerHeading.current?.focus({ preventScroll: true });
    const bounds = element.getBoundingClientRect();
    if (bounds.top < 0 || bounds.bottom > window.innerHeight) element.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  }

  function applyPosition() {
    const element = video.current;
    const position = pendingPosition.current;
    if (!element || element.readyState < 1 || !position) return;
    pendingPosition.current = null;
    setHasPosition(true);
    if (!position.play) element.pause();
    element.currentTime = position.seconds;
    setTime(position.seconds);
    if (position.play) void element.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "AbortError") return;
      reportPlaybackError("Playback could not start. Use the video controls to inspect the evidence.");
    });
  }

  function inspectFrame(index: number) {
    const element = video.current;
    if (!element || !run.media) return;
    const next = Math.max(0, Math.min(run.media.frameCount - 1, index));
    // Encoded timestamps can round above index / fps; seek inside the intended frame.
    pendingPosition.current = { seconds: (next + 0.5) / ANALYSIS_FPS, play: false };
    applyPosition();
  }

  return <section className="@container overflow-hidden rounded-xl border bg-card" aria-label="Video evidence and findings">
    <div className="grid min-w-0 @3xl:grid-cols-[minmax(0,1fr)_20rem] @5xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="order-last min-w-0 border-t @3xl:border-t-0 @3xl:border-l">
        <VerificationChecks run={run} selectedId={selected} currentIds={currentSteps.map((step) => step.id)} playing={playing} onInspect={seek} />
      </div>
      <div className="min-w-0 self-start @3xl:sticky @3xl:top-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5"><h3 ref={playerHeading} tabIndex={-1} className="flex items-center gap-2 text-[15px] font-semibold tracking-tight outline-none">Video evidence</h3>{run.media && run.state === "completed" && <div className="flex flex-wrap gap-1">
          <Button variant="ghost" className="h-8 gap-2 px-2 text-[12px] text-muted-foreground" onClick={() => download.mutate("analysis")} disabled={download.isPending} aria-busy={download.isPending && download.variables === "analysis"} title="Download the analysis MP4 matching the exported evidence hash">{download.isPending && download.variables === "analysis" ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <ArrowDownToLine className="size-4" aria-hidden="true" />}Download analysis</Button>
          <Button variant="ghost" className="h-8 gap-2 px-2 text-[12px] text-muted-foreground" onClick={() => download.mutate("tracked")} disabled={download.isPending} aria-busy={download.isPending && download.variables === "tracked"} aria-label="Download video" title="Download MP4 with tracked object boxes">{download.isPending && download.variables === "tracked" ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <ArrowDownToLine className="size-4" aria-hidden="true" />}Download video</Button>
        </div>}</div>
        {run.media ? <>
          <div className="flex min-h-48 items-center justify-center bg-[#171918] p-2 sm:p-4"><div className="relative mx-auto overflow-hidden bg-black" style={{ aspectRatio: `${run.media.width}/${run.media.height}`, width: `min(100%, ${360 * run.media.width / run.media.height}px, ${40 * run.media.width / run.media.height}dvh)` }}>
            <video ref={video} controls autoPlay={autoPlay && run.state === "completed"} muted loop={run.recordingKind !== "demo" && run.state === "completed"} playsInline preload="metadata" src={`/api/runs/${run.id}/video`} className="size-full" aria-label="Analysis video for this approved proof plan" onLoadedMetadata={applyPosition} onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
              onPlaying={() => { setPlaying(true); setHasPosition(true); }} onPause={() => setPlaying(false)} onWaiting={() => setPlaying(false)}
              onSeeking={(event) => { setPlaying(false); setHasPosition(true); setTime(event.currentTarget.currentTime); }}
              onSeeked={(event) => { setPlaying(!event.currentTarget.paused && !event.currentTarget.ended); setTime(event.currentTarget.currentTime); }}
              onEnded={() => { setPlaying(false); setHasPosition(false); }}
              onError={() => { setPlaying(false); setHasPosition(false); reportPlaybackError("The video could not be loaded. It may have expired; reload the run to check."); }} />
        {overlays && <svg className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${run.media.width} ${run.media.height}`} preserveAspectRatio="none" aria-label={`Tracked object geometry at ${formatTime(time * 1000)}`}>{run.tracks.flatMap((track, index) => track.boxes.filter((box) => box.frameIndex === frame).map((box) => {
          const width = run.media!.width; const height = run.media!.height;
          const label = `${track.concept} #${box.objectId}`;
          const labelWidth = Math.min(width, label.length * 6.5 + 8);
          const x = Math.min(box.left * width, width - labelWidth);
          const y = Math.max(0, box.top * height - 17);
          return <g key={`${track.concept}-${box.objectId}-${box.frameIndex}`}><rect x={box.left * width} y={box.top * height} width={(box.right - box.left) * width} height={(box.bottom - box.top) * height} fill="none" stroke={colors[index % colors.length]} strokeWidth="2" vectorEffect="non-scaling-stroke" /><rect x={x} y={y} width={labelWidth} height="16" rx="2" fill={colors[index % colors.length]} /><text x={x + 4} y={y + 12} fill="white" fontSize="11">{label}</text></g>;
        }))}</svg>}
          </div></div>
          <EvidenceTimeline run={run} time={time} selectedId={selected} onInspect={seek} />
          <div className="space-y-1 border-t px-4 py-3 sm:px-5">
            <p className="break-words text-[12px] leading-5 text-muted-foreground" aria-live="polite">{currentSteps.length
              ? `${playing ? "Playing now" : "Current moment"}: ${currentSteps.map((step) => `Check ${run.approvedPlan.steps.indexOf(step) + 1} · ${step.label}`).join("; ")}`
              : hasPosition ? "No check has a timed evidence window at this moment." : "Select a check or an evidence window to review the footage."}</p>
            <div className="flex flex-wrap items-center justify-between gap-2"><label className="flex min-h-11 cursor-pointer items-center gap-2 text-[12px]"><input type="checkbox" checked={overlays} onChange={(event) => setOverlays(event.target.checked)} className="size-4 accent-primary" />Show tracked objects</label><span className="text-[11px] text-muted-foreground">Analysis copy · audio removed</span></div>
            {playbackError && <p role="alert" className="text-sm leading-6 text-destructive">{playbackError}</p>}
          </div>
          <FrameInspector frame={frame} frameCount={run.media.frameCount} tracks={run.tracks} onInspect={inspectFrame} />
        </> : <div className="flex min-h-48 items-center justify-center gap-3 bg-muted/20 p-5 text-base leading-7 text-muted-foreground"><ScanLine className="size-5 shrink-0" aria-hidden="true" />{run.state === "failed" ? "No video evidence is available for this run." : "The video preview will appear when it is ready. Your checks are still pending."}</div>}
      </div>
    </div>
    {!isActiveRun(run.state) && <ModelDiagnostics run={run} onInspect={inspectFrame} />}
  </section>;
}

function EvidenceTimeline({ run, time, selectedId, onInspect }: { run: RunDetails; time: number; selectedId: string | null; onInspect: (id: string, startMs: number) => void }) {
  const duration = run.media ? run.media.frameCount / ANALYSIS_FPS * 1000 : run.durationMs ?? 0;
  const findings = run.state === "completed" ? run.receipt?.findings ?? [] : isActiveRun(run.state) ? run.partialFindings : [];
  const windows = findings.filter(finding => finding.startMs !== null && finding.endMs !== null);
  if (!duration || !windows.length) return null;
  return <div className="px-4 py-4 sm:px-5" aria-label="Evidence timeline">
    <div className="mb-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground"><span className="font-medium">Evidence windows</span><span className="tabular-nums">{formatTime(time * 1000)} / {formatTime(duration)}</span></div>
    <div className="relative space-y-1.5">
      {windows.map(finding => {
        const index = run.approvedPlan.steps.findIndex(step => step.id === finding.stepId);
        const start = Math.max(0, Math.min(duration, finding.startMs!));
        const end = Math.max(start, Math.min(duration, finding.endMs!));
        const selected = selectedId === finding.stepId;
        return <div key={finding.stepId} className="flex items-center gap-3"><span className="w-4 shrink-0 text-[10px] tabular-nums text-muted-foreground">{String(index + 1).padStart(2, "0")}</span><div className="relative h-7 flex-1 rounded bg-muted/60"><button type="button" aria-label={`Watch evidence for check ${index + 1} on timeline`} aria-pressed={selected} title={run.approvedPlan.steps[index]?.label} className={`absolute inset-y-0 min-h-0 min-w-6 rounded border transition-colors ${selected ? "border-primary bg-primary/20" : finding.status === "observed" ? "border-emerald-700/20 bg-emerald-600/15 hover:bg-emerald-600/25" : finding.status === "uncertain" ? "border-amber-700/25 bg-amber-500/20 hover:bg-amber-500/30" : "border-slate-400/30 bg-slate-400/20 hover:bg-slate-400/30"}`} style={{ left: `min(calc(100% - 24px), ${start / duration * 100}%)`, width: `${Math.max(0.5, (end - start) / duration * 100)}%` }} onClick={() => onInspect(finding.stepId, start)} /></div></div>;
      })}
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-7 right-0"><span className="absolute inset-y-0 w-px bg-foreground/60" style={{ left: `${Math.min(100, time * 1000 / duration * 100)}%` }} /></span>
    </div>
    <div className="mt-2 ml-7 flex justify-between text-[10px] tabular-nums text-muted-foreground"><span>0:00</span><span>{formatTime(duration / 2)}</span><span>{formatTime(duration)}</span></div>
  </div>;
}

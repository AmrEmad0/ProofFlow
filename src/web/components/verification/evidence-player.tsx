import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowDownToLine, Eye, LoaderCircle, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { apiError } from "@/lib/queries";
import { withFeedback } from "@/lib/feedback";
import { ANALYSIS_FPS, TRACK_COLORS as colors, type RunDetails } from "../../../shared/verification";
import { isActiveRun } from "../../../shared/receipt";
import { ModelDiagnostics } from "./model-diagnostics";
import { formatTime, VerificationChecks } from "./verification-checks";

async function downloadVideo(id: string) {
  const response = await fetch(`/api/runs/${id}/video?download=true`);
  if (!response.ok) throw apiError(await response.json().catch(() => null), "The video could not be downloaded. Please try again.");
  if (!response.headers.get("content-type")?.startsWith("video/mp4")) throw new Error("The server did not return an MP4 video.");
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  try {
    link.href = url; link.download = `proofflow-${id}-tracked.mp4`; link.hidden = true;
    document.body.append(link); link.click();
  } finally { link.remove(); URL.revokeObjectURL(url); }
}

export function EvidencePlayer({ run }: { run: RunDetails }) {
  const video = useRef<HTMLVideoElement>(null);
  const playerHeading = useRef<HTMLHeadingElement>(null);
  const pendingPosition = useRef<{ seconds: number; play: boolean } | null>(null);
  const [time, setTime] = useState(0);
  const [overlays, setOverlays] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [hasPosition, setHasPosition] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [playbackError, setPlaybackError] = useState<string | null>(null);
  const download = useMutation({ mutationFn: () => withFeedback(downloadVideo(run.id), {
    loading: "Preparing video with SAM boxes…", success: "Video download started", error: "Couldn’t download video",
  }), retry: false });
  const frame = Math.min((run.media?.frameCount ?? 1) - 1, Math.max(0, Math.floor(time * ANALYSIS_FPS + 0.0001)));
  // Match the displayed sample so rounded time bounds still include their last frame.
  const frameTimeMs = Math.round(frame * 1000 / ANALYSIS_FPS);
  const currentSteps = run.state === "completed" && run.media && hasPosition
    ? run.approvedPlan.steps.filter((step) => run.receipt?.findings.some((finding) => finding.stepId === step.id
      && finding.startMs !== null && finding.endMs !== null && frameTimeMs >= finding.startMs && frameTimeMs <= finding.endMs))
    : [];
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

  return <section className="@container overflow-hidden rounded-2xl border bg-card" aria-label="Video evidence and findings">
    <div className="grid min-w-0 @3xl:grid-cols-[minmax(0,1.15fr)_minmax(18rem,0.85fr)]">
      <div className="min-w-0 border-b @3xl:order-last @3xl:border-b-0 @3xl:border-l">
        <VerificationChecks run={run} selectedId={selected} currentIds={currentSteps.map((step) => step.id)} playing={playing} onInspect={seek} />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3 sm:px-5"><h3 ref={playerHeading} tabIndex={-1} className="flex items-center gap-2 text-lg font-semibold outline-none"><Eye className="size-5 text-primary" aria-hidden="true" />Video evidence</h3>{run.media && run.state === "completed" && <Button variant="ghost" className="px-2 text-sm" onClick={() => download.mutate()} disabled={download.isPending} aria-busy={download.isPending} aria-label="Download video" title="Download MP4 with tracked object boxes">{download.isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <ArrowDownToLine className="size-4" aria-hidden="true" />}Download video</Button>}</div>
        {run.media ? <>
          <div className="bg-muted/30 p-3 sm:p-4"><div className="relative mx-auto overflow-hidden rounded-xl bg-black" style={{ aspectRatio: `${run.media.width}/${run.media.height}`, width: `min(100%, ${352 * run.media.width / run.media.height}px)` }}>
            <video ref={video} controls playsInline preload="metadata" src={`/api/runs/${run.id}/video`} className="size-full" aria-label="Analysis video for this approved proof plan" onLoadedMetadata={applyPosition} onTimeUpdate={(event) => setTime(event.currentTarget.currentTime)}
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
          <div className="space-y-2 px-4 py-3 sm:px-5">
            <p className="break-words text-sm leading-6 text-muted-foreground" aria-live="polite">{currentSteps.length
              ? `${playing ? "Playing now" : "Current moment"}: ${currentSteps.map((step) => `Check ${run.approvedPlan.steps.indexOf(step) + 1} · ${step.label}`).join("; ")}`
              : hasPosition ? "No check has a timed evidence window at this moment." : "Play the video to follow your checks, or choose Watch evidence."}</p>
            <div className="flex flex-wrap items-center justify-between gap-2"><label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm"><input type="checkbox" checked={overlays} onChange={(event) => setOverlays(event.target.checked)} className="size-5 accent-primary" />Show tracked objects</label><span className="text-xs text-muted-foreground">Analysis copy · audio removed</span></div>
            {playbackError && <p role="alert" className="text-sm leading-6 text-destructive">{playbackError}</p>}
          </div>
          <details className="border-t px-4 py-2 sm:px-5">
            <summary className="w-fit cursor-pointer rounded-md py-2 text-sm font-medium">Frame and tracking tools</summary>
            <div className="mt-2 space-y-3 pb-2">
              <p className="text-sm text-muted-foreground">Frame {frame} · {formatTime(time * 1000)} · {ANALYSIS_FPS} sampled frames per second</p>
              <input type="range" min="0" max={run.media.frameCount - 1} step="1" value={frame} onChange={(event) => inspectFrame(Number(event.target.value))} aria-label="Inspect video frame" aria-valuetext={`Frame ${frame}, ${formatTime(frame * 1000 / ANALYSIS_FPS)}`} className="h-11 w-full min-w-0 accent-primary" />
              <div className="flex flex-wrap gap-2"><Button variant="outline" className="px-3 text-sm" disabled={frame === 0} onClick={() => inspectFrame(frame - 1)}>Previous frame</Button><Button variant="outline" className="px-3 text-sm" disabled={frame === run.media.frameCount - 1} onClick={() => inspectFrame(frame + 1)}>Next frame</Button></div>
              {run.tracks.length > 0 && <ul className="space-y-2">{run.tracks.map((track, index) => <li key={track.concept} className="flex items-center gap-2 break-words text-sm text-muted-foreground"><span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: colors[index % colors.length] }} />{track.concept}{track.outcome === "failed" ? " · tracking unavailable" : track.boxes.length === 0 ? " · no usable track" : ""}</li>)}</ul>}
              <details><summary className="w-fit cursor-pointer rounded-md py-2 text-sm text-muted-foreground">Detections at frame {frame}</summary><ul className="mt-2 space-y-2 text-sm text-muted-foreground">{run.tracks.map((track) => {
                const boxes = track.boxes.filter((box) => box.frameIndex === frame);
                return <li key={track.concept} className="break-words">{track.concept}: {boxes.length ? boxes.map((box) => `#${box.objectId} · confidence ${box.confidence === undefined ? "not retained" : `${(box.confidence * 100).toFixed(1)}%`}`).join(" / ") : "no usable detection"}</li>;
              })}</ul></details>
            </div>
          </details>
        </> : <div className="flex min-h-48 items-center justify-center gap-3 bg-muted/20 p-5 text-base leading-7 text-muted-foreground"><ScanLine className="size-5 shrink-0" aria-hidden="true" />{run.state === "failed" ? "No video evidence is available for this run." : "The video preview will appear when it is ready. Your checks are still pending."}</div>}
      </div>
    </div>
    {!isActiveRun(run.state) && <ModelDiagnostics run={run} onInspect={inspectFrame} />}
  </section>;
}

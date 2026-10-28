import { ChevronDown, ChevronLeft, ChevronRight, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ANALYSIS_FPS, TRACK_COLORS, type ConceptTrack } from "../../../shared/verification";
import { formatTime } from "./verification-checks";

export function FrameInspector({ frame, frameCount, tracks, onInspect }: {
  frame: number; frameCount: number; tracks: ConceptTrack[]; onInspect: (frame: number) => void;
}) {
  const lastFrame = frameCount - 1;
  const progress = lastFrame > 0 ? frame / lastFrame * 100 : 0;
  return <details className="group/inspector border-t">
    <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[12px] font-medium text-muted-foreground sm:px-5 [&::-webkit-details-marker]:hidden">
      <ScanLine className="size-3.5" aria-hidden="true" />Frame and tracking tools
      <ChevronDown className="ml-auto size-3.5 transition-transform group-open/inspector:rotate-180" aria-hidden="true" />
    </summary>
    <div className="border-t bg-muted/20 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-[13px] font-medium">Frame <span className="tabular-nums">{frame}</span><span className="ml-1.5 text-[11px] font-normal text-muted-foreground">/ {lastFrame}</span></p><p className="mt-0.5 text-[11px] text-muted-foreground">{ANALYSIS_FPS} sampled frames / second</p></div>
        <div className="flex items-center gap-2">
          <output className="mr-1 font-mono text-[12px] tabular-nums text-muted-foreground" aria-label="Frame timestamp">{formatTime(frame * 1000 / ANALYSIS_FPS)}</output>
          <div className="flex overflow-hidden rounded-md border bg-card" role="group" aria-label="Step through frames">
            <Button variant="ghost" className="h-10 rounded-none border-r px-3" disabled={frame === 0} onClick={() => onInspect(frame - 1)} aria-label="Previous frame" title="Previous frame"><ChevronLeft className="size-4" /></Button>
            <Button variant="ghost" className="h-10 rounded-none px-3" disabled={frame === lastFrame} onClick={() => onInspect(frame + 1)} aria-label="Next frame" title="Next frame"><ChevronRight className="size-4" /></Button>
          </div>
        </div>
      </div>
      <input type="range" min="0" max={lastFrame} step="1" value={frame} onChange={event => onInspect(Number(event.target.value))} aria-label="Inspect video frame" aria-valuetext={`Frame ${frame}, ${formatTime(frame * 1000 / ANALYSIS_FPS)}`} className="frame-scrubber mt-2 h-11 w-full min-w-0 cursor-pointer" style={{ backgroundImage: `linear-gradient(to right, var(--primary) ${progress}%, var(--border) ${progress}%)` }} />
      <div className="flex justify-between text-[10px] tabular-nums text-muted-foreground"><span>Frame 0</span><span>Frame {lastFrame}</span></div>
      <div className="mt-4 border-t pt-3">
        <div className="mb-2 flex items-center justify-between gap-2"><h4 className="text-[11px] font-medium text-muted-foreground">Tracked objects</h4><span className="text-[11px] tabular-nums text-muted-foreground">{tracks.length}</span></div>
        {tracks.length ? <ul className="flex flex-wrap gap-2">{tracks.map((track, index) => {
          const count = track.boxes.filter(box => box.frameIndex === frame).length;
          return <li key={track.concept} className="flex min-w-0 max-w-full items-center gap-2 rounded-md border bg-card px-2.5 py-2 text-[12px]">
            <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: TRACK_COLORS[index % TRACK_COLORS.length] }} aria-hidden="true" />
            <span className="min-w-0 break-words">{track.concept}</span>
            <span className="shrink-0 border-l pl-2 text-[11px] tabular-nums text-muted-foreground">{track.outcome === "failed" ? "Unavailable" : count ? `${count} in frame` : "No detection"}</span>
          </li>;
        })}</ul> : <p className="text-[12px] text-muted-foreground">No object tracks are available.</p>}
        {tracks.length > 0 && <details className="mt-2">
          <summary className="w-fit cursor-pointer py-2 text-[11px] text-muted-foreground">Detection details · frame {frame}</summary>
          <ul className="mt-1 divide-y rounded-md border bg-card px-3">{tracks.map(track => {
            const boxes = track.boxes.filter(box => box.frameIndex === frame);
            return <li key={track.concept} className="grid gap-1 py-2.5 text-[12px] sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-3"><span className="break-words font-medium">{track.concept}</span><span className="break-words text-[11px] leading-5 text-muted-foreground">{track.outcome === "failed" ? "Tracking unavailable" : boxes.length ? boxes.map(box => `#${box.objectId} · confidence ${box.confidence === undefined ? "not retained" : `${(box.confidence * 100).toFixed(1)}%`}`).join(" / ") : "No usable detection in this frame"}</span></li>;
          })}</ul>
        </details>}
      </div>
    </div>
  </details>;
}

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Film, LoaderCircle, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEMO_FEED_STOPPED } from "../../../shared/triggers";
import type { RunSummary } from "../../../shared/verification";
import type { RunState } from "../../../shared/receipt";
import { isActiveRun } from "../../../shared/receipt";

export const videoStatusLabels: Record<RunState, string> = {
  queued: "Queued", preprocessing: "Preparing", uploading: "Sending to Meta", analyzing: "Analyzing",
  verifying: "Checking evidence", completed: "Ready for review", failed: "Failed",
};

export function recordingName(runs: RunSummary[], id: string) {
  const index = runs.findIndex((run) => run.id === id);
  const run = runs[index];
  if (run?.recordingKind === "demo" && /^DEMO-[a-f0-9]{8}$/.test(run.taskReference ?? "")) return `Demo clip ${runs.length - index}`;
  const name = run?.taskReference ?? (index < 0 ? "Recording" : `Recording ${runs.length - index}`);
  return run?.recordingKind === "demo" ? `Demo replay · ${name}` : name;
}

export function VideoLibrary({ runs, selectedId, loading, error, uploading, refreshing, onSelect, onNew, onRefresh, compact = false }: {
  runs: RunSummary[]; selectedId: string | null; loading: boolean; error: string | null;
  uploading: boolean; refreshing: boolean; compact?: boolean;
  onSelect: (id: string) => void; onNew: () => void; onRefresh: () => void;
}) {
  const strip = useRef<HTMLElement>(null);
  const [scroll, setScroll] = useState({ left: false, right: false });
  useEffect(() => {
    const element = strip.current;
    if (!element || compact) return;
    const update = () => setScroll({ left: element.scrollLeft > 1, right: element.scrollLeft + element.clientWidth < element.scrollWidth - 1 });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener("scroll", update, { passive: true });
    update();
    return () => { observer.disconnect(); element.removeEventListener("scroll", update); };
  }, [compact, runs.length]);
  useEffect(() => {
    const element = strip.current;
    const selected = element?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!element || !selected) return;
    const viewport = element.getBoundingClientRect();
    const card = selected.getBoundingClientRect();
    if (card.left < viewport.left) element.scrollBy({ left: card.left - viewport.left });
    else if (card.right > viewport.right) element.scrollBy({ left: card.right - viewport.right });
  }, [compact, selectedId, runs.length]);
  function scrollVideos(direction: number) {
    const element = strip.current;
    if (!element) return;
    element.scrollBy({ left: direction * element.clientWidth * 0.8, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }
  if (compact) {
    const queued = runs.filter(run => run.state === "queued").length;
    const processing = runs.filter(run => isActiveRun(run.state) && run.state !== "queued").length;
    const label = (run: RunSummary) => run.error === DEMO_FEED_STOPPED ? "Stopped" : videoStatusLabels[run.state];
    const options = runs.map(run => ({ value: run.id, label: `${recordingName(runs, run.id)} · ${label(run)}` }));
    return <aside aria-label="Plan video library" className="min-w-0 rounded-xl border bg-card px-3 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-3">
        <div className="mr-auto min-w-0"><h2 className="text-sm font-medium">Feed recordings <span className="text-muted-foreground">· {runs.length}</span></h2><p role="status" className="mt-0.5 text-xs text-muted-foreground">{processing} processing · {queued} queued</p></div>
        {runs.length > 0 && <Select items={options} value={selectedId} onValueChange={id => { if (id) onSelect(id); }}>
          <SelectTrigger aria-label="Recording history" className="h-9 w-full min-w-0 sm:w-72"><SelectValue placeholder="Choose a recording" className="truncate" /></SelectTrigger>
          <SelectContent alignItemWithTrigger={false} className="max-h-80 max-w-[calc(100vw-2rem)]">
            {runs.map(run => <SelectItem key={run.id} value={run.id} aria-label={`Open ${recordingName(runs, run.id)}, ${label(run)}`} className="py-2 pr-8"><span className="flex min-w-0 items-center gap-2"><VideoThumbnail run={run} /><span className="min-w-0"><span className="block truncate text-xs font-medium">{recordingName(runs, run.id)}</span><span className="block text-[11px] text-muted-foreground">{new Date(run.createdAt).toLocaleTimeString()} · {label(run)} · v{run.planVersion}</span></span></span></SelectItem>)}
          </SelectContent>
        </Select>}
        <Button variant="ghost" size="icon" aria-label="Refresh plan videos" disabled={refreshing} onClick={onRefresh}><RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} /></Button>
        <Button className="h-9 gap-2 text-xs" disabled={uploading} title={uploading ? "Wait for the current video check to finish" : "Choose a video file to upload and check"} onClick={onNew}><Upload className="size-3.5" />Upload video</Button>
      </div>
      {loading && <p role="status" className="mt-2 text-xs text-muted-foreground">Loading videos…</p>}
      {error && <p role="alert" className="mt-2 text-xs text-destructive">{error}</p>}
    </aside>;
  }
  return <aside className="flex min-w-0 flex-col gap-2 border-b pb-2 sm:flex-row sm:items-center" aria-label="Plan video library">
    <div className="flex shrink-0 items-center justify-between gap-2 sm:contents">
      <div className="flex shrink-0 items-center gap-1 sm:pr-3"><h2 className="text-[12px] font-medium text-muted-foreground">Videos <span className="text-muted-foreground">({runs.length})</span></h2><Button variant="ghost" size="icon" className="size-8" aria-label="Refresh plan videos" disabled={refreshing} onClick={onRefresh}><RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} /></Button></div>
      <Button className="h-9 gap-2 rounded-md px-3 text-[12px] sm:order-last sm:shrink-0" onClick={onNew} disabled={uploading} title={uploading ? "Wait for the current video check to finish" : "Choose a video file to upload and check"}><Upload className="size-3.5" />Upload video</Button>
    </div>
    {loading && <p role="status" className="px-3 pb-3 text-sm text-muted-foreground">Loading videos…</p>}
    {error && <div role="alert" className="px-3 pb-3 text-sm text-destructive">{error}<button className="ml-2 underline" onClick={onRefresh}>Retry</button></div>}
    {runs.length > 0 && <div className="flex min-w-0 flex-1 items-center gap-1">
      {(scroll.left || scroll.right) && <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label="Scroll videos left" disabled={!scroll.left} onClick={() => scrollVideos(-1)}><ChevronLeft className="size-4" /></Button>}
      <nav ref={strip} aria-label="Videos for this plan" className="flex min-w-0 flex-1 snap-x snap-proximity gap-2 overflow-x-auto overscroll-x-contain py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{runs.map(run => {
      const name = recordingName(runs, run.id);
      const active = selectedId === run.id;
      return <button type="button" key={run.id} onClick={() => onSelect(run.id)} aria-current={active ? "page" : undefined} aria-label={`Open ${name}, ${videoStatusLabels[run.state]}`} className={`flex max-w-full shrink-0 snap-start items-center gap-2 rounded-md border px-2.5 py-2 text-left focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-primary ${active ? "border-primary/30 bg-card shadow-xs" : "border-transparent hover:bg-muted/40"}`}>
        <VideoThumbnail run={run} />
        <span className="min-w-0"><span className="block truncate text-[12px] font-medium">{name} · v{run.planVersion}</span><span className={`flex items-center gap-1 text-[11px] ${run.state === "failed" ? "text-red-800" : run.state === "completed" ? "text-emerald-700" : "text-muted-foreground"}`}>{isActiveRun(run.state) && <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />}{videoStatusLabels[run.state]}</span></span>
      </button>;
    })}</nav>
      {(scroll.left || scroll.right) && <Button variant="ghost" size="icon" className="size-7 shrink-0" aria-label="Scroll videos right" disabled={!scroll.right} onClick={() => scrollVideos(1)}><ChevronRight className="size-4" /></Button>}
    </div>}
  </aside>;
}

function VideoThumbnail({ run }: { run: RunSummary }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [run.id, run.state]);
  const canShow = run.state !== "queued" && run.state !== "preprocessing" && !failed;
  return <span className="relative flex aspect-video w-14 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted">
    {canShow ? <img src={`/api/runs/${run.id}/thumbnail`} loading="lazy" alt="" className="size-full object-cover" onError={() => setFailed(true)} /> : <Film className="size-5 text-muted-foreground/50" aria-hidden="true" />}
    {run.durationMs !== null && <span className="absolute right-0.5 bottom-0.5 rounded bg-black/70 px-1 text-xs leading-4 text-white">{(run.durationMs / 1000).toFixed(0)}s</span>}
  </span>;
}

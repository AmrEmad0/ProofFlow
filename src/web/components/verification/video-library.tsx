import { useEffect, useState } from "react";
import { Film, LoaderCircle, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const name = run?.taskReference ?? (index < 0 ? "Recording" : `Recording ${runs.length - index}`);
  return run?.recordingKind === "demo" ? `Demo replay · ${name}` : name;
}

export function VideoLibrary({ runs, selectedId, loading, error, uploading, refreshing, onSelect, onNew, onRefresh }: {
  runs: RunSummary[]; selectedId: string | null; loading: boolean; error: string | null;
  uploading: boolean; refreshing: boolean;
  onSelect: (id: string) => void; onNew: () => void; onRefresh: () => void;
}) {
  return <aside className="min-w-0 border-b sm:flex sm:items-center" aria-label="Plan video library">
    <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2 sm:contents">
      <div className="flex shrink-0 items-center gap-1 sm:pr-3"><h2 className="text-[12px] font-medium text-muted-foreground">Videos <span className="text-muted-foreground">({runs.length})</span></h2><Button variant="ghost" size="icon" className="size-8" aria-label="Refresh plan videos" disabled={refreshing} onClick={onRefresh}><RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} /></Button></div>
      <Button variant="outline" className="h-9 gap-2 rounded-md px-3 text-[12px] sm:order-last sm:mb-2 sm:shrink-0" onClick={onNew} disabled={uploading}><Plus className="size-3.5" />{runs.length ? "Check another video" : "Add a video"}</Button>
    </div>
    {loading && <p role="status" className="px-3 pb-3 text-sm text-muted-foreground">Loading videos…</p>}
    {error && <div role="alert" className="px-3 pb-3 text-sm text-destructive">{error}<button className="ml-2 underline" onClick={onRefresh}>Retry</button></div>}
    {runs.length > 0 && <nav aria-label="Videos for this plan" className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-3 pt-1">{runs.map(run => {
      const name = recordingName(runs, run.id);
      const active = selectedId === run.id;
      return <button type="button" key={run.id} onClick={() => onSelect(run.id)} aria-current={active ? "page" : undefined} aria-label={`Open ${name}, ${videoStatusLabels[run.state]}`} className={`flex shrink-0 items-center gap-2 rounded-md border px-2.5 py-2 text-left focus-visible:outline-2 focus-visible:outline-primary ${active ? "border-primary/30 bg-card shadow-xs" : "border-transparent hover:bg-muted/40"}`}>
        <VideoThumbnail run={run} />
        <span><span className="block text-[12px] font-medium">{name} · v{run.planVersion}</span><span className={`flex items-center gap-1 text-[11px] ${run.state === "failed" ? "text-red-800" : run.state === "completed" ? "text-emerald-700" : "text-muted-foreground"}`}>{isActiveRun(run.state) && <LoaderCircle className="size-3 animate-spin" aria-hidden="true" />}{videoStatusLabels[run.state]}</span></span>
      </button>;
    })}</nav>}
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

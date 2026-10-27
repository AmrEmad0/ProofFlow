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
  return index < 0 ? "Recording" : `Recording ${runs.length - index}`;
}

export function VideoLibrary({ runs, selectedId, loading, error, version, uploading, refreshing, onSelect, onNew, onRefresh }: {
  runs: RunSummary[]; selectedId: string | null; loading: boolean; error: string | null;
  version: number | null; uploading: boolean; refreshing: boolean;
  onSelect: (id: string) => void; onNew: () => void; onRefresh: () => void;
}) {
  return <aside className="min-w-0 overflow-hidden rounded-2xl border bg-card lg:sticky lg:top-5" aria-label="Plan video library">
    <div className="border-b p-4">
      <div className="mb-1 flex items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-sm font-semibold"><Film className="size-4 text-primary" aria-hidden="true" />Plan videos<span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">{runs.length}</span></h2><Button variant="ghost" size="icon" className="size-7" aria-label="Refresh plan videos" disabled={refreshing} onClick={onRefresh}><RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} /></Button></div>
      <p className="text-xs text-muted-foreground">Recordings for approved plan v{version}</p>
      <Button variant={selectedId === null ? "default" : "outline"} className="mt-4 w-full gap-2 rounded-lg px-2 text-sm" onClick={onNew} disabled={uploading} aria-pressed={selectedId === null}><Plus className="size-3.5" />{runs.length ? "Check another video" : "Add a video"}</Button>
    </div>
    {loading && <p role="status" className="p-4 text-xs text-muted-foreground">Loading videos…</p>}
    {error && <div role="alert" className="p-4 text-xs leading-5 text-destructive">{error}<button className="mt-2 block underline" onClick={onRefresh}>Retry</button></div>}
    {!loading && !error && runs.length === 0 && <div className="p-5 text-center"><Film className="mx-auto mb-2 size-6 text-muted-foreground/60" aria-hidden="true" /><p className="text-xs font-medium">Your videos will appear here</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Upload a recording to check it against this plan.</p></div>}
    {runs.length > 0 && <nav aria-label="Videos for this plan" className="flex gap-2 overflow-x-auto p-2 lg:max-h-[calc(100dvh-16rem)] lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto">{runs.map((run) => {
      const name = recordingName(runs, run.id);
      const active = selectedId === run.id;
      return <button type="button" key={run.id} onClick={() => onSelect(run.id)} aria-current={active ? "page" : undefined} aria-label={`Open ${name}, ${videoStatusLabels[run.state]}`} className={`flex w-60 shrink-0 items-start gap-3 rounded-xl border p-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-primary lg:w-full ${active ? "border-primary/35 bg-primary/5" : "border-transparent hover:border-border hover:bg-muted/40"}`}>
        <VideoThumbnail run={run} />
        <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium">{name}</span><span className={`mt-1.5 inline-flex max-w-full items-center gap-1 rounded px-1.5 py-0.5 text-xs ${run.state === "failed" ? "bg-red-50 text-red-800" : run.state === "completed" ? "bg-sky-50 text-sky-800" : "bg-amber-50 text-amber-900"}`}>{isActiveRun(run.state) && <LoaderCircle className="size-2.5 shrink-0 animate-spin" aria-hidden="true" />}<span className="truncate">{videoStatusLabels[run.state]}</span></span><span className="mt-1.5 block text-xs text-muted-foreground">{new Date(run.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span></span>
      </button>;
    })}</nav>}
    {runs.some((run) => isActiveRun(run.state)) && <p className="border-t px-4 py-3 text-xs leading-4 text-muted-foreground">Status updates automatically. You can review another video while processing continues.</p>}
  </aside>;
}

function VideoThumbnail({ run }: { run: RunSummary }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [run.id, run.state]);
  const canShow = run.state !== "queued" && run.state !== "preprocessing" && !failed;
  return <span className="relative flex aspect-video w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">
    {canShow ? <img src={`/api/runs/${run.id}/thumbnail`} loading="lazy" alt="" className="size-full object-cover" onError={() => setFailed(true)} /> : <Film className="size-5 text-muted-foreground/50" aria-hidden="true" />}
    {run.durationMs !== null && <span className="absolute right-0.5 bottom-0.5 rounded bg-black/70 px-1 text-xs leading-4 text-white">{(run.durationMs / 1000).toFixed(0)}s</span>}
  </span>;
}

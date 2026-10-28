import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ArrowDownToLine, LoaderCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/eden";
import { apiError, planRunsQuery, planTriggersQuery, runDetailsQuery, verificationStatusQuery } from "@/lib/queries";
import { toast } from "@/components/ui/toast";
import { downloadJson, withFeedback } from "@/lib/feedback";
import { useVerificationFeedback } from "./verification-feedback";
import type { SavedPlan } from "../../../shared/planner";
import { LIMITS } from "../../../shared/proof-plan";
import { isActiveRun } from "../../../shared/receipt";
import { runSummarySchema, type RunSummary } from "../../../shared/verification";
import { EvidencePlayer } from "./evidence-player";
import { recordingName, VideoLibrary } from "./video-library";
import { VideoUpload } from "./video-upload";
import { VerificationStatus } from "./verification-status";
import type { TaskSession } from "../../../shared/triggers";

const selectionKey = (planId: string) => `proofflow.videoSelection.${planId}`;

function rememberedVideo(planId: string): string | null {
  try {
    const value = sessionStorage.getItem(selectionKey(planId));
    return value === "upload" || z.uuid().safeParse(value).success ? value : null;
  } catch { return null; }
}

export function VerificationWorkspace({ saved, heading, visible, startNewUpload, task = null, onClearTask, onReviewPlan }: { saved: SavedPlan; heading: ReactNode; visible: boolean; startNewUpload: boolean; task?: TaskSession | null; onClearTask?: () => void; onReviewPlan: () => void }) {
  const queryClient = useQueryClient();
  const watchRun = useVerificationFeedback();
  const container = useRef<HTMLDivElement>(null);
  const versionId = saved.versionId!;
  const [file, setFile] = useState<File | null>(null);
  const consent = Boolean(saved.videoConsentAt);
  const chooser = useRef<HTMLInputElement>(null);
  const [selection, setSelection] = useState<string | null>(() => rememberedVideo(saved.id));
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [preview, setPreview] = useState<{ file: File; url: string } | null>(null);
  const localUrl = preview && preview.file === file ? preview.url : null;
  const listKey = planRunsQuery(saved.id).queryKey;
  const readiness = useQuery(verificationStatusQuery);
  const runs = useQuery(planRunsQuery(saved.id));
  const recordings = runs.data ?? [];
  const runId = selection === "upload" ? null : selection ?? recordings[0]?.id ?? null;
  const details = useQuery(runDetailsQuery(runId));
  const run = details.data;
  const processing = recordings.some((item) => isActiveRun(item.state)) || Boolean(run && isActiveRun(run.state));

  useEffect(() => {
    if (!visible) container.current?.querySelectorAll("video").forEach((video) => video.pause());
  }, [visible]);
  useEffect(() => {
    if (startNewUpload) { setSelection("upload"); setConfirmDelete(false); setError(null); }
  }, [startNewUpload]);
  useEffect(() => {
    if (task) { setSelection("upload"); setConfirmDelete(false); setError(null); }
  }, [task?.id]);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview({ file, url });
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    try {
      if (selection) sessionStorage.setItem(selectionKey(saved.id), selection);
      else sessionStorage.removeItem(selectionKey(saved.id));
    } catch { /* Video navigation remains available without browser storage. */ }
  }, [selection, saved.id]);
  useEffect(() => {
    if (runs.data && selection && selection !== "upload" && !runs.data.some((item) => item.id === selection)) {
      setSelection(null); setConfirmDelete(false);
    }
  }, [runs.data, selection]);
  useEffect(() => {
    if (run && !isActiveRun(run.state)) void queryClient.invalidateQueries({ queryKey: listKey });
  }, [run?.id, run?.state, queryClient, versionId]);
  useEffect(() => {
    for (const item of recordings) if (isActiveRun(item.state)) watchRun(item.id);
  }, [runs.data, watchRun]);

  function selectVideo(id: string | null) {
    setSelection(id ?? "upload"); setConfirmDelete(false); setError(null);
  }

  function selectionError(message: string) {
    setError(message); setFile(null);
    toast.add({ id: "video-selection", type: "error", title: "Video not accepted", description: message });
  }

  function choose(value: File | undefined, openPreview = true) {
    if (!value) return false;
    setError(null);
    if (!value.size || value.size > LIMITS.uploadBytes) { selectionError("Choose a nonempty recording up to 25 MB."); return false; }
    if (!/\.(mp4|mov|webm)$/i.test(value.name)) { selectionError("Choose an MP4, MOV, or WebM recording."); return false; }
    setFile(value);
    if (openPreview) setSelection("upload");
    setConfirmDelete(false);

    if (openPreview) toast.add({ id: "video-selection", type: "info", title: "Video selected" });
    return true;
  }

  async function uploadVideo(selectedFile: File | null) {
    if (!task && saved.status !== "approved") throw new Error("Review and approve your current checks before uploading a video.");
    const contractHash = task?.contractHash ?? saved.contractHash;
    if (!selectedFile || !consent || !contractHash) throw new Error("Choose a video and give permission to send it to Meta first.");
    const result = await api.api.runs.post({ video: selectedFile, consent: "true", approvedVersionId: task?.approvedVersionId ?? versionId, contractHash, ...(task ? { taskSessionId: task.id } : {}) });
    if (result.error) throw apiError(result.error.value, "The recording could not be uploaded.");
    return runSummarySchema.parse(result.data);
  }

  const upload = useMutation({ mutationFn: (selectedFile: File | undefined) => withFeedback(uploadVideo(selectedFile ?? file), { loading: "Uploading video…", success: "Video uploaded", error: "Couldn’t upload video" }), onSuccess: (result) => {
    queryClient.setQueryData<RunSummary[]>(listKey, (current) => [result, ...(current ?? []).filter((item) => item.id !== result.id)]);
    watchRun(result.id);
    setSelection(result.id); setFile(null); setError(null);
    onClearTask?.();
    void queryClient.invalidateQueries({ queryKey: planTriggersQuery(saved.id).queryKey });
    void queryClient.invalidateQueries({ queryKey: listKey });
  }, onError: (failure) => setError(failure.message), retry: false });

  const remove = useMutation({ mutationFn: (id: string) => withFeedback((async () => {
    const result = await api.api.runs({ id }).delete();
    if (result.error) throw apiError(result.error.value, "The video could not be deleted.");
  })(), { loading: "Deleting video…", success: "Video and evidence deleted", error: "Couldn’t delete video" }), onSuccess: (_result, id) => {
    queryClient.removeQueries({ queryKey: ["run", id] });
    queryClient.removeQueries({ queryKey: ["run-diagnostics", id] });
    queryClient.setQueryData<RunSummary[]>(listKey, (current) => current?.filter((item) => item.id !== id) ?? []);
    setSelection((current) => current === id ? null : current); setConfirmDelete(false);
    void queryClient.invalidateQueries({ queryKey: listKey });
  }, onError: (failure) => setError(failure.message) });

  function exportReceipt() {
    if (!run?.receipt) return;
    downloadJson({ ...run.receipt, approvedPlan: run.approvedPlan, media: run.media, timings: run.timings, warnings: run.warnings }, `proofflow-evidence-${run.id}.json`, "Evidence");
  }

  function refreshRuns() {
    setError(null);
    const task = Promise.all([runs.refetch({ throwOnError: true }), runId ? details.refetch({ throwOnError: true }) : Promise.resolve()]);
    void withFeedback(task, { loading: "Refreshing videos…", success: "Videos refreshed", error: "Couldn’t refresh videos" }).catch(() => {});
  }

  const displayedError = error ?? (details.isError ? details.error.message : readiness.isError ? readiness.error.message : null);
  const showLibrary = runs.isPending || runs.isError || recordings.length > 0;
  return <div ref={container} className="min-w-0">
    <input ref={chooser} type="file" accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm" aria-label="Upload another video" className="sr-only" tabIndex={-1} disabled={upload.isPending} onChange={event => { const selected = event.target.files?.[0]; if (choose(selected, false)) upload.mutate(selected); event.target.value = ""; }} />
    <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      {heading}
      {runId && run && <div className="min-w-0 sm:text-right"><h2 className="text-[14px] font-semibold tracking-tight">{recordingName(recordings, run.id)}</h2><p className="mt-1 text-[12px] leading-5 text-muted-foreground">{new Date(run.createdAt).toLocaleString()}{run.durationMs ? ` · ${(run.durationMs / 1000).toFixed(1)} seconds` : ""} · Plan v{run.planVersion}</p></div>}
    </div>
    <div className="min-w-0 space-y-3">
      {showLibrary && <VideoLibrary runs={recordings} selectedId={runId} loading={runs.isPending} error={runs.error?.message ?? null} uploading={upload.isPending || processing} refreshing={runs.isRefetching} onSelect={id => { onClearTask?.(); selectVideo(id); }} onNew={() => { onClearTask?.(); if (saved.status === "approved" && consent) chooser.current?.click(); else onReviewPlan(); }} onRefresh={refreshRuns} />}
      {task && <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-primary/5 p-3 text-sm"><p>Attach a recording for <strong>{task.reference ?? "this task"}</strong>. Verification uses the approved checks saved when it started.</p><Button variant="ghost" size="sm" disabled={upload.isPending} onClick={onClearTask}>Remove task link</Button></div>}
      <div className="min-w-0 space-y-3">
        {displayedError && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm leading-6 text-destructive">{displayedError}{!error && <button className="ml-2 underline" onClick={refreshRuns}>Reload videos</button>}</div>}
        {runId ? run ? <>
          <VerificationStatus run={run} />
          {run.warnings.map((warning) => <p key={warning} className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">{warning}</p>)}
          <EvidencePlayer key={run.id} run={run} />
          {!isActiveRun(run.state) && <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-2"><span className="text-[12px] text-muted-foreground">Expires {new Date(run.expiresAt).toLocaleString()}</span><div className="flex flex-wrap gap-2">{run.receipt && <Button variant="outline" className="h-8 gap-2 rounded-lg px-3" onClick={exportReceipt}><ArrowDownToLine />Export evidence</Button>}{confirmDelete ? <><Button variant="destructive" className="h-8 px-3" disabled={remove.isPending} onClick={() => remove.mutate(run.id)}>Delete video & evidence</Button><Button variant="ghost" disabled={remove.isPending} onClick={() => setConfirmDelete(false)}>Cancel</Button></> : <Button variant="ghost" className="h-8 gap-2 px-3" onClick={() => setConfirmDelete(true)}><Trash2 />Delete</Button>}</div></div>}
        </> : details.isPending ? <div role="status" className="flex min-h-64 items-center justify-center gap-2 rounded-2xl border bg-card p-6 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading video…</div> : <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">This video could not be opened. Select another recording or add a new video.</div> : runs.isPending && selection === null ? <p role="status" className="p-6 text-sm text-muted-foreground">Loading your video library…</p> : (!task && saved.status !== "approved") || !consent ? <section className="rounded-2xl border bg-card p-5"><h2 className="text-lg font-semibold">Review your updated checks</h2><p className="mt-2 text-sm text-muted-foreground">Your earlier recordings are still available. Review your updated plan, then choose Check a video.</p><Button variant="outline" className="mt-4" onClick={onReviewPlan}>Review checks</Button></section> : <>
          {!task && <details className="rounded-xl border bg-card px-4 py-2"><summary className="cursor-pointer py-1 text-sm font-medium">Plan checks & filming tips</summary><RecordingChecklist saved={saved} onReviewPlan={onReviewPlan} /></details>}
          <VideoUpload file={file} localUrl={localUrl} uploading={upload.isPending} processing={processing} available={readiness.data?.available ?? false} retentionHours={readiness.data?.retentionHours ?? 24} version={task ? null : saved.version} onChoose={choose} onClear={() => { setFile(null); setError(null); }} onInvalid={selectionError} onUpload={() => upload.mutate()} />
        </>}
      </div>
    </div>
  </div>;
}

function RecordingChecklist({ saved, onReviewPlan }: { saved: SavedPlan; onReviewPlan: () => void }) {
  return <section className="rounded-2xl border bg-card p-4 sm:p-5" aria-label="Approved recording checklist">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">What to record</h2><Button variant="ghost" className="px-2 text-sm" onClick={onReviewPlan}>Review approved checks</Button></div>
    <ol className="grid gap-3 sm:grid-cols-3">{saved.plan?.steps.map((step, index) => <li key={step.id} className="flex min-w-0 items-start gap-2 text-base leading-6"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">{index + 1}</span><p className="break-words font-medium">{step.label}</p></li>)}</ol>
    <details className="mt-2"><summary className="w-fit cursor-pointer rounded-md py-2 text-sm font-medium">Filming tips</summary><p className="mt-1 text-sm leading-6 text-muted-foreground">Show the whole task in one video of up to {LIMITS.durationMs / 1000} seconds. Keep the items and actions in view.</p><ol className="mt-3 space-y-3">{saved.plan?.steps.map((step, index) => <li key={step.id} className="text-base leading-7"><p className="font-medium">{index + 1}. {step.label}</p><p className="text-muted-foreground">{step.observableEvidence}</p></li>)}</ol></details>
  </section>;
}

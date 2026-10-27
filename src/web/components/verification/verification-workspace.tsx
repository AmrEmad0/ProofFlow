import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ArrowDownToLine, Check, CircleHelp, Clock3, LoaderCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/eden";
import { apiError, planRunsQuery, runDetailsQuery, verificationStatusQuery } from "@/lib/queries";
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

const stages = ["queued", "preprocessing", "uploading", "analyzing", "verifying", "completed"] as const;
const stageLabels = { queued: "Waiting in the queue", preprocessing: "Preparing your recording", uploading: "Sending the analysis copy to Meta", analyzing: "Muse is proposing events · SAM is tracking objects", verifying: "Checking the evidence against your plan", completed: "Ready for your review", failed: "This run could not finish" };
const selectionKey = (versionId: string) => `proofflow.videoSelection.${versionId}`;

function rememberedVideo(versionId: string): string | null {
  try {
    const value = sessionStorage.getItem(selectionKey(versionId));
    return value === "upload" || z.uuid().safeParse(value).success ? value : null;
  } catch { return null; }
}

export function VerificationWorkspace({ saved }: { saved: SavedPlan }) {
  const queryClient = useQueryClient();
  const watchRun = useVerificationFeedback();
  const versionId = saved.versionId!;
  const development = import.meta.env.DEV && import.meta.env.MODE === "development";
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(development);
  const [selection, setSelection] = useState<string | null>(() => rememberedVideo(versionId));
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const listKey = ["runs", versionId];
  const readiness = useQuery(verificationStatusQuery);
  const runs = useQuery(planRunsQuery(versionId));
  const recordings = runs.data ?? [];
  const runId = selection === "upload" ? null : selection ?? recordings[0]?.id ?? null;
  const details = useQuery(runDetailsQuery(runId));
  const run = details.data;
  const processing = recordings.some((item) => isActiveRun(item.state)) || Boolean(run && isActiveRun(run.state));

  useEffect(() => {
    if (!file) { setLocalUrl(null); return; }
    const url = URL.createObjectURL(file);
    setLocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    try {
      if (selection) sessionStorage.setItem(selectionKey(versionId), selection);
      else sessionStorage.removeItem(selectionKey(versionId));
    } catch { /* Video navigation remains available without browser storage. */ }
  }, [selection, versionId]);
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

  function choose(value: File | undefined) {
    if (!value) return;
    setError(null);
    if (!value.size || value.size > LIMITS.uploadBytes) { selectionError("Choose a nonempty recording up to 25 MB."); return; }
    if (!/\.(mp4|mov|webm)$/i.test(value.name)) { selectionError("Choose an MP4, MOV, or WebM recording."); return; }
    setFile(value);
    toast.add({ id: "video-selection", type: "info", title: "Video selected" });
  }

  async function uploadVideo() {
    if (!file || !(development || consent) || !saved.contractHash) throw new Error("Choose a recording and consent to analysis first.");
    const result = await api.api.runs.post({ video: file, consent: "true", approvedVersionId: versionId, contractHash: saved.contractHash });
    if (result.error) throw apiError(result.error.value, "The recording could not be uploaded.");
    return runSummarySchema.parse(result.data);
  }

  const upload = useMutation({ mutationFn: () => withFeedback(uploadVideo(), { loading: "Uploading video…", success: "Video uploaded", error: "Couldn’t upload video" }), onSuccess: (result) => {
    queryClient.setQueryData<RunSummary[]>(listKey, (current) => [result, ...(current ?? []).filter((item) => item.id !== result.id)]);
    watchRun(result.id);
    setSelection(result.id); setFile(null); setConsent(development); setError(null);
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
  return <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
    <VideoLibrary runs={recordings} selectedId={runId} loading={runs.isPending} error={runs.error?.message ?? null} version={saved.version} uploading={upload.isPending} refreshing={runs.isRefetching} onSelect={selectVideo} onNew={() => selectVideo(null)} onRefresh={refreshRuns} />
    <div className="min-w-0 space-y-5">
      {displayedError && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-xs leading-5 text-destructive">{displayedError}<button className="ml-2 underline" onClick={refreshRuns}>Reload videos</button></div>}
      {runId ? run ? <>
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold tracking-tight">{recordingName(recordings, run.id)}</h2><p className="mt-1 text-xs text-muted-foreground">{new Date(run.createdAt).toLocaleString()}{run.durationMs ? ` · ${(run.durationMs / 1000).toFixed(1)} seconds` : ""} · Plan v{saved.version}</p></div></div>
        <section className="rounded-2xl border bg-card p-5" aria-label="Verification status">
          <div className="flex items-start gap-3"><span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{isActiveRun(run.state) ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : run.state === "completed" ? <Check className="size-4" aria-hidden="true" /> : <CircleHelp className="size-4" aria-hidden="true" />}</span><div className="min-w-0 flex-1"><h3 className="text-sm font-semibold" aria-live="polite">{stageLabels[run.state]}</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">{run.error ?? (run.state === "completed" ? "Select a finding to inspect its video evidence." : "You can review another video while processing continues.")}</p></div></div>
          {run.state !== "failed" && <ol className="mt-5 grid grid-cols-6 gap-1.5" aria-label="Processing stages">{stages.map((stage, index) => <li key={stage} title={stageLabels[stage]} className={`h-1 rounded-full ${stages.indexOf(run.state as typeof stages[number]) >= index ? "bg-primary" : "bg-muted"}`}><span className="sr-only">{stageLabels[stage]}</span></li>)}</ol>}
          {run.timings.total !== undefined && <p className="mt-3 flex items-center gap-1 text-[10px] text-muted-foreground"><Clock3 className="size-3" aria-hidden="true" />Processing: {(run.timings.total / 1000).toFixed(1)} seconds</p>}
        </section>
        {run.warnings.map((warning) => <p key={warning} className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">{warning}</p>)}
        <EvidencePlayer key={run.id} run={run} />
        {!isActiveRun(run.state) && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"><span className="text-[10px] text-muted-foreground">Expires {new Date(run.expiresAt).toLocaleString()}</span><div className="flex flex-wrap gap-2">{run.receipt && <Button variant="outline" className="h-8 gap-2 rounded-lg px-3" onClick={exportReceipt}><ArrowDownToLine />Export evidence</Button>}{confirmDelete ? <><Button variant="destructive" className="h-8 px-3" disabled={remove.isPending} onClick={() => remove.mutate(run.id)}>Delete video & evidence</Button><Button variant="ghost" disabled={remove.isPending} onClick={() => setConfirmDelete(false)}>Cancel</Button></> : <Button variant="ghost" className="h-8 gap-2 px-3" onClick={() => setConfirmDelete(true)}><Trash2 />Delete</Button>}</div></div>}
      </> : details.isPending ? <div role="status" className="flex min-h-64 items-center justify-center gap-2 rounded-2xl border bg-card p-6 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading video…</div> : <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">This video could not be opened. Select another recording or add a new video.</div> : runs.isPending && selection === null ? <p role="status" className="p-6 text-sm text-muted-foreground">Loading your video library…</p> : <>
        <VideoUpload file={file} localUrl={localUrl} consent={consent} development={development} uploading={upload.isPending} processing={processing} available={readiness.data?.available ?? false} retentionHours={readiness.data?.retentionHours ?? 24} version={saved.version} onChoose={choose} onConsent={setConsent} onInvalid={selectionError} onUpload={() => upload.mutate()} />
        <RecordingChecklist saved={saved} />
      </>}
    </div>
  </div>;
}

function RecordingChecklist({ saved }: { saved: SavedPlan }) {
  return <section className="rounded-2xl border bg-card p-5 sm:p-6">
    <h2 className="mb-4 text-sm font-semibold">What to record</h2>
    <ol className="space-y-4">{saved.plan?.steps.map((step, index) => <li key={step.id} className="flex gap-3 text-sm leading-6"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">{index + 1}</span><div><p className="font-medium">{step.label}</p><details className="mt-1"><summary className="w-fit cursor-pointer text-xs text-muted-foreground">Evidence needed</summary><p className="mt-2 text-sm text-muted-foreground">{step.observableEvidence}</p></details></div></li>)}</ol>
  </section>;
}

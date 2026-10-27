import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ArrowDownToLine, Check, CircleHelp, Clock3, Film, LoaderCircle, LockKeyhole, RefreshCw, ShieldCheck, Trash2, Upload, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/eden";
import { apiError, runDetailsQuery, verificationStatusQuery } from "@/lib/queries";
import { toast } from "@/components/ui/toast";
import { downloadJson, withFeedback } from "@/lib/feedback";
import { useVerificationFeedback } from "./verification-feedback";
import type { SavedPlan } from "../../../shared/planner";
import { isActiveRun } from "../../../shared/receipt";
import { runSummarySchema } from "../../../shared/verification";
import { EvidencePlayer } from "./evidence-player";

const stages = ["queued", "preprocessing", "uploading", "analyzing", "verifying", "completed"] as const;
const stageLabels = { queued: "Waiting in the queue", preprocessing: "Preparing your recording", uploading: "Sending the analysis copy to Meta", analyzing: "Muse is proposing events · SAM is tracking objects", verifying: "Checking the evidence against your plan", completed: "Ready for your review", failed: "This run could not finish" };

export function VerificationWorkspace({ saved }: { saved: SavedPlan }) {
  const queryClient = useQueryClient();
  const watchRun = useVerificationFeedback();
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const versionId = saved.versionId!;
  const listKey = ["runs", versionId];
  const readiness = useQuery(verificationStatusQuery);
  const runs = useQuery({ queryKey: listKey, queryFn: async () => {
    const result = await api.api.runs.get({ query: { approvedVersionId: versionId } });
    if (result.error) throw apiError(result.error.value, "Saved video runs could not be loaded.");
    return z.array(runSummarySchema).parse(result.data);
  }, refetchInterval: (query) => query.state.data?.some((run) => isActiveRun(run.state)) ? 2000 : false });
  const runId = activeId ?? runs.data?.[0]?.id ?? null;
  const details = useQuery({ ...runDetailsQuery(runId), refetchInterval: false });
  const run = details.data;
  const processing = runs.data?.some((item) => isActiveRun(item.state)) || (run && isActiveRun(run.state));

  useEffect(() => {
    if (!file) { setLocalUrl(null); return; }
    const url = URL.createObjectURL(file);
    setLocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  useEffect(() => {
    if (run && !isActiveRun(run.state)) void queryClient.invalidateQueries({ queryKey: listKey });
  }, [run?.state, queryClient, versionId]);

  useEffect(() => {
    if (run && isActiveRun(run.state)) watchRun(run.id);
  }, [run?.id, run?.state, watchRun]);

  function selectionError(message: string) {
    setError(message);
    setFile(null);
    toast.add({ id: "video-selection", type: "error", title: "Video not accepted", description: message });
  }

  function choose(value: File | undefined) {
    setError(null); setConsent(false);
    if (!value) return;
    if (!value.size || value.size > 25 * 1024 * 1024) { selectionError("Choose a nonempty recording up to 25 MB."); return; }
    if (!/\.(mp4|mov|webm)$/i.test(value.name)) { selectionError("Choose an MP4, MOV, or WebM recording."); return; }
    setFile(value);
    toast.add({ id: "video-selection", type: "info", title: "Video selected" });
  }

  async function uploadVideo() {
    if (!file || !consent || !saved.contractHash) throw new Error("Choose a recording and consent to analysis first.");
    const result = await api.api.runs.post({ video: file, consent: "true", approvedVersionId: versionId, contractHash: saved.contractHash });
    if (result.error) throw apiError(result.error.value, "The recording could not be uploaded.");
    return runSummarySchema.parse(result.data);
  }

  const upload = useMutation({ mutationFn: () => withFeedback(uploadVideo(), { loading: "Uploading video…", success: "Video uploaded", error: "Couldn’t upload video" }), onSuccess: (result) => {
    watchRun(result.id);
    setActiveId(result.id); setFile(null); setConsent(false); setError(null);
    void queryClient.invalidateQueries({ queryKey: listKey });
  }, onError: (failure) => setError(failure.message), retry: false });

  async function deleteVideo() {
    if (!runId) return;
    const result = await api.api.runs({ id: runId }).delete();
    if (result.error) throw apiError(result.error.value, "The video could not be deleted.");
  }

  const remove = useMutation({ mutationFn: () => withFeedback(deleteVideo(), { loading: "Deleting video…", success: "Video and evidence deleted", error: "Couldn’t delete video" }), onSuccess: () => {
    queryClient.removeQueries({ queryKey: ["run", runId] }); setActiveId(null); setConfirmDelete(false);
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

  const displayedError = error ?? (runs.isError ? runs.error.message : details.isError ? details.error.message : readiness.isError ? readiness.error.message : null);
  return <div className={`grid items-start gap-5 ${run ? "xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]" : "xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]"}`}>
    <div className="space-y-5">
      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-sm font-semibold"><Upload className="size-4 text-primary" aria-hidden="true" />Upload video</h2><span className="flex items-center gap-1 text-xs text-emerald-700"><LockKeyhole className="size-3" aria-hidden="true" />Plan v{saved.version}</span></div>
        <label className={`flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 p-5 text-center focus-within:ring-2 focus-within:ring-primary ${processing || upload.isPending ? "opacity-50" : "cursor-pointer hover:border-primary/50"}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!processing && !upload.isPending) choose(event.dataTransfer.files[0]); }}>
          <input type="file" aria-label="Choose a video recording" accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm" className="sr-only" disabled={Boolean(processing || upload.isPending)} onChange={(event) => { choose(event.target.files?.[0]); event.target.value = ""; }} />
          <span className="mb-3 flex size-10 items-center justify-center rounded-xl border bg-background text-primary"><Video className="size-5" aria-hidden="true" /></span><span className="max-w-full break-all text-sm font-medium">{file ? file.name : "Choose video or drop it here"}</span><span className="mt-2 text-xs text-muted-foreground">{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · change file` : "MP4, MOV, WebM · 20 sec max · 25 MB max"}</span>
        </label>
        {localUrl && <video src={localUrl} controls playsInline className="mt-4 max-h-52 w-full rounded-lg bg-black" aria-label="Selected recording preview" onLoadedMetadata={(event) => { if (event.currentTarget.duration > 20) { selectionError("This recording is longer than 20 seconds. Choose a shorter, complete clip."); } }} />}
        <label className="mt-5 flex cursor-pointer items-start gap-2.5 text-xs leading-5 text-muted-foreground"><input type="checkbox" checked={consent} disabled={Boolean(processing || upload.isPending)} onChange={(event) => setConsent(event.target.checked)} className="mt-1 size-3.5 shrink-0 accent-primary" />I have permission to share this recording with Meta for Muse Spark and SAM analysis.</label>
        <p className="mt-2 pl-6 text-[10px] leading-4 text-muted-foreground">Muse uses Contributor mode. Submitted content may be used to improve Meta models. The analysis copy removes audio.</p>
        <Button onClick={() => upload.mutate()} disabled={!file || !consent || !readiness.data?.available || Boolean(processing) || upload.isPending || remove.isPending} className="mt-5 h-11 w-full gap-2 rounded-lg">{upload.isPending ? <><LoaderCircle className="size-4 animate-spin" />Uploading…</> : <><ScanIcon />Verify video</>}</Button>
        {readiness.data && !readiness.data.available && <p className="mt-3 text-xs leading-5 text-muted-foreground">The video worker or Meta configuration is unavailable. Your approved plan is saved.</p>}
        <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />Private to this workspace. Expires after {readiness.data?.retentionHours ?? 24} hours.</p>
      </section>
      {run && <RecordingChecklist saved={saved} />}
      {runs.data && runs.data.length > 0 && <section className="rounded-2xl border bg-card p-5"><div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Video runs</h2><Button variant="ghost" size="icon" aria-label="Refresh video runs" onClick={refreshRuns}><RefreshCw /></Button></div><div className="space-y-2">{runs.data.map((item, index) => <button key={item.id} onClick={() => { setActiveId(item.id); setConfirmDelete(false); setError(null); }} className={`flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left text-xs ${runId === item.id ? "border-primary/40 bg-primary/5" : "hover:bg-muted/40"}`}><span className="flex items-center gap-2"><Film className="size-3.5 text-muted-foreground" aria-hidden="true" />Recording {runs.data.length - index}</span><span className="text-[10px] text-muted-foreground">{item.state === "completed" ? "Ready for review" : item.state === "failed" ? "Failed" : "Processing"}</span></button>)}</div></section>}
      {displayedError && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-xs leading-5 text-destructive">{displayedError}<button className="ml-2 underline" onClick={refreshRuns}>Reload runs</button></div>}
    </div>
    <div className="min-w-0 space-y-5">
      {run ? <>
        <section className="rounded-2xl border bg-card p-5" aria-label="Verification status">
          <div className="flex items-start gap-3"><span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{isActiveRun(run.state) ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : run.state === "completed" ? <Check className="size-4" aria-hidden="true" /> : <CircleHelp className="size-4" aria-hidden="true" />}</span><div className="min-w-0 flex-1"><h2 className="text-sm font-semibold" aria-live="polite">{stageLabels[run.state]}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{run.error ?? (run.state === "completed" ? "Select a finding to inspect its video evidence." : "You can return while processing continues.")}</p></div></div>
          {run.state !== "failed" && <ol className="mt-5 grid grid-cols-6 gap-1.5" aria-label="Processing stages">{stages.map((stage, index) => <li key={stage} title={stageLabels[stage]} className={`h-1 rounded-full ${stages.indexOf(run.state as typeof stages[number]) >= index ? "bg-primary" : "bg-muted"}`}><span className="sr-only">{stageLabels[stage]}</span></li>)}</ol>}
          {run.timings.total !== undefined && <p className="mt-3 flex items-center gap-1 text-[10px] text-muted-foreground"><Clock3 className="size-3" aria-hidden="true" />Processing: {(run.timings.total / 1000).toFixed(1)} seconds</p>}
        </section>
        {run.warnings.map((warning) => <p key={warning} className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">{warning}</p>)}
        <EvidencePlayer key={run.id} run={run} />
        {!isActiveRun(run.state) && <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4"><span className="text-[10px] text-muted-foreground">Expires {new Date(run.expiresAt).toLocaleString()}</span><div className="flex gap-2">{run.receipt && <Button variant="outline" className="h-8 gap-2 rounded-lg px-3" onClick={exportReceipt}><ArrowDownToLine />Export evidence</Button>}{confirmDelete ? <><Button variant="destructive" className="h-8 px-3" disabled={remove.isPending} onClick={() => remove.mutate()}>Delete video & evidence</Button><Button variant="ghost" disabled={remove.isPending} onClick={() => setConfirmDelete(false)}>Cancel</Button></> : <Button variant="ghost" className="h-8 gap-2 px-3" onClick={() => setConfirmDelete(true)}><Trash2 />Delete</Button>}</div></div>}
      </> : <><RecordingChecklist saved={saved} />{details.isPending && runId && <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Loading video…</p>}</>}
    </div>
  </div>;
}

function ScanIcon() { return <ShieldCheck className="size-4" aria-hidden="true" />; }

function RecordingChecklist({ saved }: { saved: SavedPlan }) {
  return <section className="rounded-2xl border bg-card p-5 sm:p-6">
    <h2 className="mb-4 text-sm font-semibold">What to record</h2>
    <ol className="space-y-4">{saved.plan?.steps.map((step, index) => <li key={step.id} className="flex gap-3 text-sm leading-6"><span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">{index + 1}</span><div><p className="font-medium">{step.label}</p><details className="mt-1"><summary className="w-fit cursor-pointer text-xs text-muted-foreground">Evidence needed</summary><p className="mt-2 text-sm text-muted-foreground">{step.observableEvidence}</p></details></div></li>)}</ol>
  </section>;
}

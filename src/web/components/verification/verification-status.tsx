import { Check, CircleAlert, ClipboardCheck, Clock3, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isActiveRun, type RunState } from "../../../shared/receipt";
import type { RunDetails } from "../../../shared/verification";

const stages = ["Prepare video", "Send for analysis", "Find visible actions", "Check the evidence"];
const stageIndex: Record<RunState, number> = { queued: -1, preprocessing: 0, uploading: 1, analyzing: 2, verifying: 3, completed: 4, failed: -1 };
const headings: Record<RunState, string> = {
  queued: "Waiting to start", preprocessing: "Preparing your video", uploading: "Sending your video for analysis",
  analyzing: "Looking for the actions", verifying: "Checking the evidence", completed: "Ready for your review", failed: "This video could not be checked",
};

export function VerificationStatus({ run, onNewVideo }: { run: RunDetails; onNewVideo: () => void }) {
  const active = isActiveRun(run.state);
  const current = stageIndex[run.state];
  const Icon = run.state === "failed" ? CircleAlert : run.state === "queued" ? Clock3 : active ? LoaderCircle : ClipboardCheck;
  const findings = run.approvedPlan.steps.flatMap((step) => run.receipt?.findings.find((finding) => finding.stepId === step.id) ?? []);
  const observed = findings.filter((finding) => finding.status === "observed").length;

  return <section className="rounded-2xl border bg-card p-4 sm:p-5" aria-label="Verification status">
    <div className="flex items-start gap-3">
      <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl ${run.state === "failed" ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}><Icon className={`size-5 ${active && run.state !== "queued" ? "animate-spin" : ""}`} aria-hidden="true" /></span>
      <div className="min-w-0 flex-1"><h3 className="text-lg font-semibold" aria-live="polite">{headings[run.state]}</h3><p className="mt-1 text-base leading-6 text-muted-foreground">{run.state === "failed" ? run.error ?? "No result was produced. Try another recording."
        : active ? "Results appear when analysis and evidence checks finish. You can review another video while you wait."
        : run.receipt ? `${observed} of ${run.approvedPlan.steps.length} actions observed. Open each check to inspect the video evidence.` : "No findings are available for this video."}</p></div>
    </div>
    {active && <ol className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Processing stages">{stages.map((label, index) => {
      const done = index < current;
      const inProgress = index === current;
      return <li key={label} aria-current={inProgress ? "step" : undefined} className={`flex items-center gap-2 rounded-xl border p-3 ${inProgress ? "border-primary/40 bg-primary/5" : "border-border"}`}>
        <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${done ? "bg-emerald-50 text-emerald-800" : inProgress ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{done ? <Check className="size-4" aria-hidden="true" /> : inProgress ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : index + 1}</span>
        <div className="min-w-0"><p className="text-sm font-medium">{label}</p><p className="text-xs text-muted-foreground">{done ? "Done" : inProgress ? "In progress" : "Waiting"}</p></div>
      </li>;
    })}</ol>}
    {run.state === "completed" && run.receipt && <div className="mt-4 flex flex-wrap gap-2" aria-label="Check result summary">
      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-800">{observed} observed</span>
      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700">{findings.filter((finding) => finding.status === "not_observed").length} not observed</span>
      <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-sm font-medium text-amber-900">{findings.filter((finding) => finding.status === "uncertain").length} uncertain</span>
    </div>}
    {run.state === "failed" && <Button variant="outline" className="mt-4" onClick={onNewVideo}>Choose another video</Button>}
    {!active && run.state !== "failed" && <details className="mt-3 text-sm text-muted-foreground"><summary className="w-fit cursor-pointer rounded-md py-2">How this video was checked</summary><p className="mt-2 leading-6">Meta Muse Spark proposed visible actions, SAM 3.1 tracked the objects, and ProofFlow checked that evidence against your approved plan.</p>{run.timings.total !== undefined && <p className="mt-2 flex items-center gap-1.5"><Clock3 className="size-4" aria-hidden="true" />Processing took {(run.timings.total / 1000).toFixed(1)} seconds.</p>}</details>}
  </section>;
}

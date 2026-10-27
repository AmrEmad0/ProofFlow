import { useState } from "react";
import { ArrowDownToLine, ArrowRight, Check, ChevronDown, LockKeyhole, PencilLine, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadJson } from "@/lib/feedback";
import type { SavedPlan } from "../../../shared/planner";
import type { ProofPlan } from "../../../shared/proof-plan";

const checkLabels = {
  object_enters_region: "Object movement",
  visible_state_change: "Visible state change",
  object_present_at_end: "Present at the end",
};

type Props = {
  saved: SavedPlan | null;
  starter: ProofPlan | null;
  pending: boolean;
  onApprove: () => void;
  onRevise: () => void;
  onUseStarter: () => void;
  onVerify: () => void;
};

export function PlanPreview({ saved, starter, pending, onApprove, onRevise, onUseStarter, onVerify }: Props) {
  const [reviewed, setReviewed] = useState(false);
  const plan = saved?.plan ?? starter;
  const approved = saved?.status === "approved";

  function downloadPlan() {
    if (!saved?.plan) return;
    downloadJson({
      ...saved.plan,
      ...(approved ? { approvedVersionId: saved.versionId, contractHash: saved.contractHash } : {}),
    }, `proofflow-${saved.id}-v${saved.version}.json`, "Plan");
  }

  if (!plan) return null;

  return (
    <section className="plan-panel min-w-0" aria-label="Proof Plan preview" aria-busy={pending}>
      {approved && <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-emerald-50/60 px-5 py-4 sm:px-6">
        <span className="flex items-center gap-2 text-sm font-medium text-emerald-800"><Check className="size-4" aria-hidden="true" />Plan approved</span>
        <Button onClick={onVerify} disabled={pending} className="h-11 gap-2 px-5"><Upload className="size-4" />Upload video<ArrowRight className="size-4" /></Button>
      </div>}
      <div className="p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="text-xl font-semibold tracking-tight">{plan.title}</h2><p className="mt-1.5 text-xs text-muted-foreground">{plan.steps.length} checks<span className="mx-2">·</span>{saved ? `Version ${saved.version}` : "Example"}</p></div>
          <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${approved ? "bg-emerald-50 text-emerald-800" : "bg-muted text-muted-foreground"}`}>{approved && <LockKeyhole className="size-3" aria-hidden="true" />}{approved ? "Locked" : "Draft"}</span>
        </div>
        <ol className="divide-y rounded-xl border">{plan.steps.map((step, index) => (
          <li key={step.id} className="proof-step">
            <div className="flex items-start gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold leading-6">{step.label}</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{step.observableEvidence}</p>
              </div>
            </div>
          </li>
        ))}</ol>
        <details className="group mt-4 rounded-lg border">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-xs font-medium">What this plan can verify<ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
          <div className="space-y-3 px-4 pb-4 text-sm leading-6 text-muted-foreground">
            <p>{plan.goal}</p>
            <ul className="list-disc space-y-2 pl-4">{plan.limitations.length ? plan.limitations.map((limit, index) => <li key={`${index}-${limit}`}>{limit}</li>) : <li>Only visible evidence can be assessed. Hidden or occluded outcomes remain uncertain.</li>}</ul>
            <h3 className="font-medium text-foreground">Tracking details</h3>
            {plan.steps.map((step) => <div key={step.id} className="space-y-1 border-t pt-3 text-xs"><p className="font-medium text-foreground">{step.label}</p><p>{checkLabels[step.checkType]} · {step.subjectConcept}{step.targetConcept && <> → {step.targetConcept}</>}</p>{step.beforeState && step.afterState && <p>{step.beforeState} → {step.afterState}</p>}</div>)}
          </div>
        </details>
      </div>
      <div className="border-t bg-muted/20 px-5 py-4 sm:px-6">
        {approved ? <div className="flex flex-wrap items-center justify-between gap-2">
          <Button onClick={onRevise} disabled={pending} variant="ghost" className="h-9 gap-2 px-2 text-xs"><PencilLine className="size-3.5" />Create new draft</Button>
          <Button onClick={downloadPlan} variant="ghost" className="h-9 gap-2 px-2 text-xs"><ArrowDownToLine className="size-3.5" />Export plan</Button>
        </div> : !saved?.plan ? <Button onClick={onUseStarter} disabled={pending} className="h-11 w-full gap-2">Use this plan<ArrowRight className="size-4" /></Button> : <div className="flex flex-wrap items-center justify-between gap-4">
          <div><label className="flex cursor-pointer items-center gap-3 text-sm"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} disabled={pending} className="size-4 shrink-0 accent-primary" />I’ve reviewed these checks.</label><p className="mt-2 text-xs text-muted-foreground">Approval locks this version.</p></div>
          <Button onClick={onApprove} disabled={!reviewed || pending} className="h-11 gap-2 px-5"><Check className="size-4" />Approve plan</Button>
        </div>}
      </div>
    </section>
  );
}

import { PACK_DEMO } from "../../../shared/demo";
import { useId, useState } from "react";
import { ArrowDownToLine, ArrowRight, Check, ChevronDown, Copy, PencilLine, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { downloadJson } from "@/lib/feedback";
import { checkLabels } from "@/lib/proof-canvas";
import type { EditableCheck, SavedPlan } from "../../../shared/planner";
import type { ProofPlan, ProofStep } from "../../../shared/proof-plan";
import { CheckEditor } from "./check-editor";
import { ProofCanvas } from "./proof-canvas";

type Props = {
  saved: SavedPlan | null;
  starter: ProofPlan | null;
  pending: boolean;
  onRevise: () => void;
  editingApproved: boolean;
  onFinishEditing: () => void;
  onUseStarter: () => void;
  onVerify: () => void;
  onCopy: () => void;
  onManual: () => void;
  onEdit: (edit: EditableCheck) => Promise<void>;
  onRemove: (id: string) => void;
  onReload: () => Promise<void>;
  changedIds: string[];
};

export function PlanPreview({ saved, starter, pending, onRevise, editingApproved, onFinishEditing, onUseStarter, onVerify, onCopy, onManual, onEdit, onRemove, onReload, changedIds }: Props) {
  const detailsId = useId();
  const [videoConsent, setVideoConsent] = useState(true);
  const canContinue = Boolean(saved?.videoConsentAt || videoConsent);
  const [editing, setEditing] = useState<ProofStep | null>(null);
  const plan = saved?.plan ?? starter;
  const approved = saved?.status === "approved";
  const pinnedDemo = saved?.id === PACK_DEMO.planId;

  function downloadPlan() {
    if (!saved?.plan) return;
    downloadJson({
      ...saved.plan,
      ...(approved ? { approvedVersionId: saved.versionId, contractHash: saved.contractHash } : {}),
    }, `proofflow-${saved.id}-v${saved.version}.json`, "Plan");
  }

  if (!plan) return null;

  return (
    <section className="plan-panel review-plan min-w-0" aria-label="Proof Plan preview" aria-busy={pending}>
      {approved && canContinue && !pinnedDemo && <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-emerald-50/60 px-5 py-4 sm:px-6">
        <span className="flex items-center gap-2 text-sm font-medium text-emerald-800"><Check className="size-4" aria-hidden="true" />Ready to use</span>
        <Button onClick={onVerify} disabled={pending || !canContinue || Boolean(plan.unresolvedGoals?.length)} className="gap-2"><Upload className="size-4" />Check a video<ArrowRight className="size-4" /></Button>
      </div>}
      <div className="p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0"><h2 className="break-words text-xl font-semibold tracking-tight">{plan.title}</h2><div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>{plan.steps.length} checks · {saved ? `Version ${saved.version}` : "Example"}</span><span className={`rounded-full px-2 py-0.5 font-medium ${approved ? "bg-emerald-50 text-emerald-800" : "bg-muted"}`}>{approved ? "Ready to use" : "Draft"}</span></div></div>
          {saved?.plan && <details className="review-plan-options"><summary>Plan options<ChevronDown className="size-3.5" aria-hidden="true" /></summary><div className="flex flex-wrap gap-1"><Button onClick={onManual} disabled={pending || pinnedDemo} variant="ghost" className="px-2 text-sm"><PencilLine className="size-4" />Edit manually</Button><Button onClick={onCopy} disabled={pending} variant="ghost" className="px-2 text-sm"><Copy className="size-4" />Copy and change</Button></div></details>}
        </div>
        {plan.unresolvedGoals?.map((goal, index) => <p key={index} role="alert" className="mb-3 rounded border border-amber-500 p-3">Unresolved goal: {goal.description} ({goal.status.replaceAll("_", " ")}). Resolve or explicitly exclude this before approval.</p>)}
        <ProofCanvas plan={plan} pending={pending} changedIds={changedIds}
          onEdit={saved?.plan && !pinnedDemo && (!approved || editingApproved) ? setEditing : undefined}
          onRemove={saved?.plan && !pinnedDemo && (!approved || editingApproved) ? onRemove : undefined} />

        <details className="group mt-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md py-2 text-sm font-medium">Limits of these checks<ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
          <div className="space-y-3 px-4 pb-4 text-sm leading-6 text-muted-foreground">
            <p>{plan.goal}</p>
            <ul className="list-disc space-y-2 pl-4">{plan.limitations.length ? plan.limitations.map((limit, index) => <li key={`${index}-${limit}`}>{limit}</li>) : <li>Only visible evidence can be assessed. Hidden or occluded outcomes remain uncertain.</li>}</ul>
            <details><summary className="min-h-11 cursor-pointer py-2 font-medium text-foreground">Technical details</summary>
              {plan.steps.map((step) => <div key={step.id} className="space-y-1 border-t py-3 text-sm"><p className="font-medium text-foreground">{step.label}</p><p>{checkLabels[step.checkType]} · {step.subjectConcept}{step.targetConcept && <> → {step.targetConcept}</>}</p>{step.beforeState && step.afterState && <p>{step.beforeState} → {step.afterState}</p>}</div>)}
            </details>
          </div>
        </details>
      </div>
      <div className="review-approval">
        {saved?.plan && !saved.videoConsentAt && !pinnedDemo && <div className="mb-4 border-b border-border/70 pb-4">
          <div className="grid grid-cols-[1rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5">
          <input id={`${detailsId}-consent`} type="checkbox" checked={videoConsent} onChange={event => setVideoConsent(event.target.checked)} disabled={pending} className="mt-0.5 size-4 accent-primary" />
          <div className="flex flex-wrap items-center gap-x-2"><label htmlFor={`${detailsId}-consent`} className="cursor-pointer text-[14px] font-medium leading-5">I accept the terms and conditions.</label>
            <Dialog>
              <DialogTrigger className="inline-flex min-h-6 items-center rounded-sm px-1 align-baseline text-[12px] leading-5 underline underline-offset-4">Details</DialogTrigger>
              <DialogContent className="p-6 sm:max-w-md">
                <DialogTitle className="pr-6 text-lg font-semibold">Terms and conditions</DialogTitle>
                <DialogDescription className="text-sm leading-6">Videos are sent to Meta for analysis using Muse Spark (Contributor mode) and SAM 3.1. Meta may use uploads to improve its models.</DialogDescription>
                <div className="space-y-3 text-sm leading-6 text-muted-foreground">
                  <p>By continuing, you confirm that you have permission to share these videos with Meta for analysis.</p>
                  <p>Only visible actions can be checked. Unclear evidence stays uncertain.</p>
                  <p>Audio is removed from the analysis copy. Your permission applies to videos in this plan and is saved for future uploads.</p>
                  <p>Make sure the full task is visible. Videos stay on your device until you choose Check video on the next screen.</p>
                  <p>Continuing approves this version of your checks. You can revise them later; earlier videos keep their original checks.</p>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          </div>
          {approved && <Button onClick={onVerify} disabled={pending || !canContinue || Boolean(plan.unresolvedGoals?.length)} className="mt-3">Continue to videos<ArrowRight className="size-4" /></Button>}
        </div>}
        {approved ? <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="w-full text-base leading-7 text-muted-foreground">You can reuse or change these checks. Earlier videos keep their original checks.</p>
          {pinnedDemo ? <Button onClick={onCopy} disabled={pending} variant="outline"><Copy className="size-4" />Copy to make changes</Button> : editingApproved ? <Button onClick={onFinishEditing} disabled={pending} variant="outline">Done editing</Button> : <Button onClick={onRevise} disabled={pending} variant="outline"><PencilLine className="size-4" />Make changes</Button>}
          <Button onClick={downloadPlan} variant="ghost"><ArrowDownToLine className="size-4" />Download plan</Button>
        </div> : !saved?.plan ? <Button onClick={onUseStarter} disabled={pending} className="h-11 w-full gap-2">Use this plan<ArrowRight className="size-4" /></Button> : <div className="flex justify-end">
          <Button onClick={onVerify} disabled={pending || !canContinue || Boolean(plan.unresolvedGoals?.length)} className="h-11 w-full gap-2 rounded-lg px-4 text-sm sm:w-auto">Approve & add video<ArrowRight className="size-4" /></Button>
        </div>}
      </div>
      {editing && <CheckEditor step={editing} pending={pending} onClose={() => setEditing(null)} onSave={onEdit} onReload={onReload} />}
    </section>
  );
}

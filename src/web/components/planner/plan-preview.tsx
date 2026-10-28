import { useId, useState } from "react";
import { ArrowDownToLine, ArrowRight, Check, ChevronDown, Copy, PencilLine, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { downloadJson } from "@/lib/feedback";
import type { EditableCheck, SavedPlan } from "../../../shared/planner";
import { filmingGuidance, type ProofPlan, type ProofStep } from "../../../shared/proof-plan";
import { CheckEditor } from "./check-editor";

const checkLabels = {
  object_enters_region: "Object movement",
  visible_state_change: "Visible state change",
  object_present_at_end: "Present at the end",
};

const filmingHints = {
  object_enters_region: "Keep the item and where it goes in view.",
  visible_state_change: "Keep the item in view before, during, and after the change.",
  object_present_at_end: "Show the item clearly at the end of the video.",
};

function checkTitle(step: ProofStep): string {
  if (step.checkType === "object_enters_region" && ["Insert the visible product", "Insert the visible packing slip"].includes(step.label)) {
    return `Put ${step.subjectConcept} inside ${step.targetConcept}`;
  }
  return step.label;
}

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
  const [videoConsent, setVideoConsent] = useState(false);
  const canContinue = Boolean(saved?.videoConsentAt || videoConsent);
  const [editing, setEditing] = useState<ProofStep | null>(null);
  const [expandedChecks, setExpandedChecks] = useState<string[]>([]);
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
      {approved && canContinue && <div className="flex flex-wrap items-center justify-between gap-4 border-b bg-emerald-50/60 px-5 py-4 sm:px-6">
        <span className="flex items-center gap-2 text-sm font-medium text-emerald-800"><Check className="size-4" aria-hidden="true" />Ready to use</span>
        <Button onClick={onVerify} disabled={pending || !canContinue || Boolean(plan.unresolvedGoals?.length)} className="gap-2"><Upload className="size-4" />Check a video<ArrowRight className="size-4" /></Button>
      </div>}
      <div className="p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0"><h2 className="break-words text-xl font-semibold tracking-tight">{plan.title}</h2><div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>{plan.steps.length} checks · {saved ? `Version ${saved.version}` : "Example"}</span><span className={`rounded-full px-2 py-0.5 font-medium ${approved ? "bg-emerald-50 text-emerald-800" : "bg-muted"}`}>{approved ? "Ready to use" : "Draft"}</span></div></div>
          {saved?.plan && <div className="flex flex-wrap gap-1"><Button onClick={onManual} disabled={pending} variant="ghost" className="px-2 text-sm"><PencilLine className="size-4" />Edit manually</Button><Button onClick={onCopy} disabled={pending} variant="ghost" className="px-2 text-sm"><Copy className="size-4" />Copy and change</Button></div>}
        </div>
        {plan.unresolvedGoals?.map((goal, index) => <p key={index} role="alert" className="mb-3 rounded border border-amber-500 p-3">Unresolved goal: {goal.description} ({goal.status.replaceAll("_", " ")}). Resolve or explicitly exclude this before approval.</p>)}
        {plan.schemaVersion === 2 && <div className="mb-3 space-y-2 text-sm"><p>Actions may happen in either order and overlap unless a relationship below requires otherwise. Final presence is checked independently at the end.</p>{plan.relationships?.map(rel => <p key={rel.id}>{plan.steps.find(step => step.id === rel.from)?.label} {rel.type === "before" ? "must finish before" : rel.type === "overlap" ? "must overlap" : "must use the same item as"} {plan.steps.find(step => step.id === rel.to)?.label}.</p>)}</div>}
        <ol className="divide-y rounded-xl border">{plan.steps.map((step, index) => (
          <li key={step.id} className={`proof-step ${changedIds.includes(step.id) ? "bg-primary/5" : ""}`}>
            <div className="grid grid-cols-[2rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{index + 1}</span>
              <div className="min-w-0">
                <h3 className="break-words text-base font-semibold leading-7">{checkTitle(step)}</h3>
                {step.goalSource && <p className="text-sm">Addresses: {step.goalSource}</p>}{changedIds.includes(step.id) && <p className="text-sm font-medium text-primary">Changed — please review</p>}
                <p className="mt-1 text-base leading-6 text-muted-foreground">{plan.schemaVersion === 2 ? filmingGuidance(step).join(" ") : filmingHints[step.checkType]}</p>
              </div>
              <div className="col-span-2 mt-1 flex flex-wrap items-center gap-1">
                <Button variant="ghost" className="h-11 px-2 text-sm" aria-label={`Filming details for check ${index + 1}`} aria-expanded={expandedChecks.includes(step.id)} aria-controls={`${detailsId}-${index}`} onClick={() => setExpandedChecks((current) => current.includes(step.id) ? current.filter((id) => id !== step.id) : [...current, step.id])}>Filming details<ChevronDown className={`size-4 transition-transform ${expandedChecks.includes(step.id) ? "rotate-180" : ""}`} /></Button>
                {saved?.plan && (!approved || editingApproved) && <>
                  <Button variant="ghost" className="h-11 px-2 text-sm" disabled={pending} aria-label={`Change check ${index + 1}`} onClick={() => setEditing(step)}><PencilLine className="size-4" />Change</Button>
                  <Button variant="ghost" className="h-11 px-2 text-sm text-muted-foreground" disabled={pending || plan.steps.length === 1} aria-label={`Remove check ${index + 1}`} aria-describedby={plan.steps.length === 1 ? "keep-one-check" : undefined} onClick={() => onRemove(step.id)}><Trash2 className="size-4" />Remove</Button>
                </>}
              </div>
              <div id={`${detailsId}-${index}`} hidden={!expandedChecks.includes(step.id)} className="col-span-2 rounded-lg bg-muted/30 p-3"><p className="break-words text-base leading-7">{step.observableEvidence}</p>{step.beforeState && step.afterState && <p className="mt-2 break-words text-sm text-muted-foreground">Before: {step.beforeState}. After: {step.afterState}.</p>}</div>
            </div>
          </li>
        ))}</ol>
        {(!approved || editingApproved) && saved?.plan && plan.steps.length === 1 && <p id="keep-one-check" className="mt-3 text-sm text-muted-foreground">Keep at least one check. You can change it instead.</p>}
        <p className="mt-3 text-sm leading-6 text-muted-foreground">Only visible actions can be checked. Hidden or unclear actions may be uncertain.</p>
        <details className="group mt-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md py-2 text-sm font-medium">What the video can tell us<ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
          <div className="space-y-3 px-4 pb-4 text-sm leading-6 text-muted-foreground">
            <p>{plan.goal}</p>
            <ul className="list-disc space-y-2 pl-4">{plan.limitations.length ? plan.limitations.map((limit, index) => <li key={`${index}-${limit}`}>{limit}</li>) : <li>Only visible evidence can be assessed. Hidden or occluded outcomes remain uncertain.</li>}</ul>
            <details><summary className="min-h-11 cursor-pointer py-2 font-medium text-foreground">Technical details</summary>
              {plan.steps.map((step) => <div key={step.id} className="space-y-1 border-t py-3 text-sm"><p className="font-medium text-foreground">{step.label}</p><p>{checkLabels[step.checkType]} · {step.subjectConcept}{step.targetConcept && <> → {step.targetConcept}</>}</p>{step.beforeState && step.afterState && <p>{step.beforeState} → {step.afterState}</p>}</div>)}
            </details>
          </div>
        </details>
      </div>
      <div className="border-t bg-muted/20 p-4 sm:p-5">
        {saved?.plan && !saved.videoConsentAt && <div className="mb-4 border-b border-border/70 pb-4">
          <div className="grid grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1.5">
          <input id={`${detailsId}-consent`} type="checkbox" checked={videoConsent} onChange={event => setVideoConsent(event.target.checked)} disabled={pending} aria-describedby={`${detailsId}-consent-note`} className="mt-0.5 size-4 accent-primary" />
          <label htmlFor={`${detailsId}-consent`} className="cursor-pointer text-[14px] font-medium leading-5">I have permission to share videos with Meta.</label>
          <div id={`${detailsId}-consent-note`} className="col-start-2 text-[12px] leading-5 text-muted-foreground">
            <span>Meta may use videos to improve its models.</span>{" "}
            <Dialog>
              <DialogTrigger className="inline-flex min-h-6 items-center rounded-sm px-1 align-baseline text-[12px] leading-5 underline underline-offset-4">Details</DialogTrigger>
              <DialogContent className="p-6 sm:max-w-md">
                <DialogTitle className="pr-6 text-lg font-semibold">Video analysis & privacy</DialogTitle>
                <DialogDescription className="text-sm leading-6">Videos are sent to Meta for analysis using Muse Spark (Contributor mode) and SAM 3.1. Meta may use uploads to improve its models.</DialogDescription>
                <div className="space-y-3 text-sm leading-6 text-muted-foreground">
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
          {editingApproved ? <Button onClick={onFinishEditing} disabled={pending} variant="outline">Done editing</Button> : <Button onClick={onRevise} disabled={pending} variant="outline"><PencilLine className="size-4" />Make changes</Button>}
          <Button onClick={downloadPlan} variant="ghost"><ArrowDownToLine className="size-4" />Download plan</Button>
        </div> : !saved?.plan ? <Button onClick={onUseStarter} disabled={pending} className="h-11 w-full gap-2">Use this plan<ArrowRight className="size-4" /></Button> : <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-5">
          <p id="approval-help" className="max-w-[28ch] text-[12px] leading-5 text-muted-foreground">Approve these checks, then choose a video.</p>
          <Button onClick={onVerify} disabled={pending || !canContinue || Boolean(plan.unresolvedGoals?.length)} aria-describedby="approval-help" className="h-11 w-full gap-2 rounded-lg px-4 text-sm sm:w-auto">Approve & continue<ArrowRight className="size-4" /></Button>
        </div>}
      </div>
      {editing && <CheckEditor step={editing} pending={pending} onClose={() => setEditing(null)} onSave={onEdit} onReload={onReload} />}
    </section>
  );
}

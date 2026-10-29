import { useId, useState } from "react";
import { ArrowLeft, ArrowRight, Camera, ChevronDown, Eye, MoveRight, Plus, ScanLine, Shapes, Shuffle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildManualPlan, type ManualPlanInput, type SavedPlan } from "../../../shared/planner";
import { upgradePlan, LIMITS } from "../../../shared/proof-plan";
import { manualCheckReady, manualPreview, manualRequirements, updateManualCheck, type ManualCheck } from "@/lib/manual-plan";
import { VisualCheckFields } from "./visual-check-fields";
import { EvidenceFields } from "./evidence-fields";
import { ProofCanvas } from "./proof-canvas";

export type ManualPlanDraft = Omit<ManualPlanInput, "revision">;
const checkTypeOptions = [
  { value: "visual_check", label: "Describe your check", description: "Any observable action or condition", Icon: Eye },
  { value: "object_enters_region", label: "Move into", description: "An item enters a destination", Icon: MoveRight },
  { value: "visible_state_change", label: "Change state", description: "A visible before and after", Icon: Shuffle },
  { value: "object_present_at_end", label: "Present at end", description: "An item is visible at the end", Icon: ScanLine },
] satisfies { value: ManualCheck["checkType"]; label: string; description: string; Icon: typeof MoveRight }[];
const relationshipOptions = [
  { value: "before", label: "Must finish before" },
  { value: "overlap", label: "Must overlap" },
  { value: "same_instance", label: "Must use the same item as" },
] as const;
const emptyCheck = (): ManualCheck => ({ id: crypto.randomUUID(), checkType: "visual_check", visualCheck: { kind: "action", timing: "anytime" }, label: "", observableEvidence: "", subjectConcept: "", targetConcept: null, beforeState: null, afterState: null });

export function ManualPlanEditor({ saved, pending, onSave, onCancel }: {
  saved: SavedPlan | null; pending: boolean; onSave: (draft: ManualPlanDraft) => Promise<void>; onCancel: () => void;
}) {
  const prefix = useId();
  const [title, setTitle] = useState(saved?.plan?.title ?? "");
  const [steps, setSteps] = useState<ManualCheck[]>(() => saved?.plan ? upgradePlan(saved.plan).steps : [emptyCheck()]);
  const [relationships, setRelationships] = useState(() => saved?.plan ? upgradePlan(saved.plan).relationships ?? [] : []);
  const [unresolvedGoals, setUnresolvedGoals] = useState(saved?.plan?.unresolvedGoals ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const busy = pending || saving;
  const preview = manualPreview(title, steps, relationships);
  const checkOptions = steps.map((step, index) => ({ value: step.id, label: `Check ${index + 1}: ${step.subjectConcept || "Unnamed item"}` }));
  const completeCount = steps.filter(manualCheckReady).length;
  function update(id: string, patch: Partial<ManualCheck>) {
    setSteps(current => current.map(step => step.id === id ? updateManualCheck(step, patch) : step));
  }
  return <section className="manual-builder min-w-0" aria-label="Manual plan builder">
    <div className="manual-builder-layout">
    <form className="plan-panel min-w-0" onInvalidCapture={event => { const details = (event.target as HTMLElement).closest("details"); if (details) details.open = true; }} onSubmit={async event => {
      event.preventDefault();
      if (busy) return;
      setError(null);
      const draft = { goal: saved?.plan?.goal, limitations: saved?.plan?.limitations, relationships, unresolvedGoals, title: title.trim(), steps: steps.map(step => ({ ...step, requirements: step.requirements?.map(req => ({ ...req, subjectConcept: step.subjectConcept.trim(), targetConcept: step.checkType === "object_enters_region" || step.checkType === "visual_check" ? step.targetConcept?.trim() || null : null })), subjectConcept: step.subjectConcept.trim(), targetConcept: step.checkType === "object_enters_region" || step.checkType === "visual_check" ? step.targetConcept?.trim() || null : null,
        beforeState: step.checkType === "visible_state_change" ? step.beforeState?.trim() || null : null, afterState: step.checkType === "visible_state_change" ? step.afterState?.trim() || null : null })) };
      try { buildManualPlan({ ...draft, revision: saved?.revision ?? 0 }); }
      catch { setError(`Review required fields, evidence details, and connections. Use up to ${LIMITS.steps} checks and ${LIMITS.concepts} different objects.`); return; }
      setSaving(true);
      try { await onSave(draft); }
      catch (failure) { setError(failure instanceof Error ? failure.message : "Your checks could not be saved. Your entries are still here."); }
      finally { setSaving(false); }
    }}>
      <div className="manual-builder-header"><span className="eyebrow">BUILD IT YOUR WAY</span><h2>Build your plan manually</h2><p>Describe what the video should show, or start from a template. Review the evidence before approval.</p></div>
      <div className="space-y-5 p-4 sm:p-5">
      <label className="block text-sm font-medium" htmlFor={`${prefix}-title`}>Plan name<Input id={`${prefix}-title`} autoFocus value={title} required maxLength={160} disabled={busy} className="mt-2" placeholder="Give this process a name" onChange={event => setTitle(event.target.value)} /></label>
      <div className="space-y-4">{steps.map((step, index) => <fieldset key={step.id} disabled={busy} className="manual-check">
        <legend><span aria-hidden="true">{index + 1}</span>Check {index + 1}</legend>
        <div className="manual-check-type-heading"><span id={`${prefix}-${step.id}-type`}>Describe a check or choose a template</span><Button type="button" variant="ghost" size="icon" aria-label={`Remove manual check ${index + 1}`} disabled={busy || steps.length === 1 || relationships.some(rel => rel.from === step.id || rel.to === step.id)} onClick={() => setSteps(current => current.filter(item => item.id !== step.id))}><Trash2 className="size-4" /></Button></div>
        <div className="manual-type-options" role="group" aria-labelledby={`${prefix}-${step.id}-type`}>{checkTypeOptions.map(({ value, label, description, Icon }) => <button type="button" key={value} aria-label={label} title={description} aria-pressed={step.checkType === value} onClick={() => update(step.id, { checkType: value })} disabled={busy}>
          <Icon aria-hidden="true" /><span>{label}</span><small>{description}</small>
        </button>)}</div>
        {step.checkType === "visual_check" && <VisualCheckFields disabled={busy} value={step} onChange={patch => update(step.id, patch)} />}
        <div className={step.checkType === "object_enters_region" ? "manual-object-flow" : ""}>
          <label className="manual-object-field" htmlFor={`${prefix}-${step.id}-subject`}><span><Shapes className="size-3.5" aria-hidden="true" />Item to watch</span><Input id={`${prefix}-${step.id}-subject`} value={step.subjectConcept} required maxLength={120} placeholder="Name the visible item" onChange={event => update(step.id, { subjectConcept: event.target.value })} /></label>
          {step.checkType === "object_enters_region" && <><ArrowRight className="manual-flow-arrow" aria-hidden="true" /><label className="manual-object-field" htmlFor={`${prefix}-${step.id}-target`}><span><ScanLine className="size-3.5" aria-hidden="true" />Destination</span><Input id={`${prefix}-${step.id}-target`} value={step.targetConcept ?? ""} required maxLength={120} placeholder="Where should it go?" onChange={event => update(step.id, { targetConcept: event.target.value })} /></label></>}
        </div>
        {step.checkType === "visual_check" && <label className="manual-object-field"><span>Other item or area involved (optional)</span><Input value={step.targetConcept ?? ""} maxLength={120} placeholder="e.g. tabletop" onChange={event => update(step.id, { targetConcept: event.target.value || null })} /></label>}
        {step.checkType === "visible_state_change" && <div className="manual-state-flow"><label className="manual-object-field" htmlFor={`${prefix}-${step.id}-before`}><span>State before</span><Input id={`${prefix}-${step.id}-before`} value={step.beforeState ?? ""} required maxLength={240} placeholder="Initial visible state" onChange={event => update(step.id, { beforeState: event.target.value })} /></label><ArrowRight className="manual-flow-arrow" aria-hidden="true" /><label className="manual-object-field" htmlFor={`${prefix}-${step.id}-after`}><span>State after</span><Input id={`${prefix}-${step.id}-after`} value={step.afterState ?? ""} required maxLength={240} placeholder="Expected visible state" onChange={event => update(step.id, { afterState: event.target.value })} /></label></div>}
        {step.checkType === "object_present_at_end" && <p className="manual-presence-note"><ScanLine className="size-4" aria-hidden="true" />We’ll look for this item in the ending frames.</p>}
        <details className="manual-evidence-details group/evidence"><summary><Camera className="size-4" aria-hidden="true" /><span>Evidence & filming details</span><span className="manual-detail-mode">{step.requirements ? "Customized" : "Automatic"}</span><ChevronDown className="size-3.5 transition-transform group-open/evidence:rotate-180" aria-hidden="true" /></summary>
          <div className="space-y-4 pt-3"><label className="block text-sm" htmlFor={`${prefix}-${step.id}-goal`}>Part of your goal addressed<Input id={`${prefix}-${step.id}-goal`} value={step.goalSource ?? ""} maxLength={1000} placeholder="Optional · defaults to this check" onChange={event => update(step.id, { goalSource: event.target.value || undefined })} /></label>
          {manualCheckReady(step) ? <><p className="text-[12px] leading-5 text-muted-foreground">These requirements define what the camera must show. Review them in the preview, or customize them here.</p><EvidenceFields visualCheck={step.visualCheck} requirements={step.requirements ?? manualRequirements(step)} onChange={requirements => update(step.id, { requirements })} /></> : <p className="text-[12px] leading-5 text-muted-foreground">Fill in the item and {step.checkType === "object_enters_region" ? "destination" : step.checkType === "visual_check" ? "check description" : "visible states"} to generate evidence requirements.</p>}
          </div>
        </details>
        {relationships.some(rel => rel.from === step.id || rel.to === step.id) && <p className="text-[12px] leading-5 text-muted-foreground">Remove this check’s connections before deleting it.</p>}
      </fieldset>)}</div>
      <Button type="button" variant="outline" className="manual-add-check" disabled={busy || steps.length >= LIMITS.steps} onClick={() => setSteps(current => [...current, emptyCheck()])}><Plus className="size-4" />Add check<span>{steps.length}/{LIMITS.steps}</span></Button>
      <fieldset disabled={busy} className="manual-connections"><legend><Shapes className="size-4" aria-hidden="true" />Connect your checks</legend><p>No required order unless you add a connection. Condition checks use their selected time; ordering connects actions.</p>
        {relationships.map(rel => <div key={rel.id} className="manual-relationship-row">
          <Select items={checkOptions} value={rel.from} disabled={busy} onValueChange={value => {
            if (value) setRelationships(items => items.map(item => item.id === rel.id ? { ...item, from: value } : item));
          }}>
            <SelectTrigger aria-label="First check" className="w-full min-w-0 bg-background text-[12px] data-[size=default]:h-11"><SelectValue className="min-w-0 truncate" /></SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {checkOptions.map(option => <SelectItem key={option.value} value={option.value} className="py-2 pr-8 text-sm">{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select items={relationshipOptions} value={rel.type} disabled={busy} onValueChange={value => {
            if (value) setRelationships(items => items.map(item => item.id === rel.id ? { ...item, type: value } : item));
          }}>
            <SelectTrigger aria-label="Relationship" className="w-full min-w-0 bg-background text-[12px] data-[size=default]:h-11"><SelectValue className="min-w-0 truncate" /></SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {relationshipOptions.map(option => <SelectItem key={option.value} value={option.value} className="py-2 pr-8 text-sm">{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select items={checkOptions} value={rel.to} disabled={busy} onValueChange={value => {
            if (value) setRelationships(items => items.map(item => item.id === rel.id ? { ...item, to: value } : item));
          }}>
            <SelectTrigger aria-label="Second check" className="w-full min-w-0 bg-background text-[12px] data-[size=default]:h-11"><SelectValue className="min-w-0 truncate" /></SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {checkOptions.map(option => <SelectItem key={option.value} value={option.value} className="py-2 pr-8 text-sm">{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button type="button" variant="ghost" aria-label="Remove relationship" onClick={() => setRelationships(items => items.filter(item => item.id !== rel.id))}><Trash2 className="size-4" /></Button>
        </div>)}
        <Button type="button" variant="ghost" disabled={busy || steps.length < 2 || relationships.length >= 20} onClick={() => setRelationships(items => [...items, { id: crypto.randomUUID(), type: "before", from: steps[0]!.id, to: steps[1]!.id }])}><Plus className="size-4" />Add relationship</Button>
      </fieldset>
      {unresolvedGoals.map((goal, index) => <div key={index} className="rounded-xl border p-3"><p>Unresolved: {goal.description} ({goal.status.replaceAll("_", " ")})</p><p className="text-sm">Only remove this goal if you explicitly exclude it from this plan. Otherwise refine it through chat.</p><Button type="button" variant="outline" disabled={busy} onClick={() => setUnresolvedGoals(items => items.filter((_, i) => i !== index))}>Exclude this goal from the plan</Button></div>)}
      <p className="text-[12px] leading-5 text-muted-foreground">Up to {LIMITS.steps} checks and {LIMITS.concepts} different objects. Save as a draft, then review and approve before checking a video.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap justify-between gap-3 border-t pt-4"><Button type="button" variant="ghost" disabled={busy} onClick={onCancel}><ArrowLeft className="size-4" />Back</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save my plan"}<ArrowRight className="size-4" /></Button></div>
      </div>
    </form>
    <aside className="manual-live-preview" data-expanded={previewOpen || undefined} aria-label="Live plan preview">
      <div className="manual-preview-heading"><div><Eye className="size-4" aria-hidden="true" /><h3>Live preview</h3><span>{completeCount}/{steps.length} filled</span></div><button type="button" aria-expanded={previewOpen} aria-controls={`${prefix}-preview`} onClick={() => setPreviewOpen(current => !current)}>{previewOpen ? "Hide" : "Show"} preview<ChevronDown className={`size-3.5 ${previewOpen ? "rotate-180" : ""}`} /></button></div>
      <div id={`${prefix}-preview`} className="manual-preview-content">
        {preview ? <><h4 className="manual-preview-title">{preview.title}</h4><ProofCanvas plan={preview} pending={busy} changedIds={[]} /><p className="manual-preview-note">{completeCount < steps.length ? "Only complete checks are shown. " : ""}This preview is unsaved. Save your plan to review and approve it.</p></> : <div className="manual-preview-empty"><span><Shapes className="size-7" aria-hidden="true" /></span><h4>{completeCount ? "Review your check details" : "Your plan takes shape here"}</h4><p>{completeCount ? "Check evidence details, object limits, and connections to see a valid preview." : "Describe a check and name the visible objects. Your visual plan updates as you build."}</p><div aria-hidden="true"><i /><ArrowRight className="size-5" /><i /></div></div>}
      </div>
    </aside>
    </div>
  </section>;
}

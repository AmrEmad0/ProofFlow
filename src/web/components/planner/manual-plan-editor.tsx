import { useId, useState } from "react";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildManualPlan, type ManualPlanInput, type SavedPlan } from "../../../shared/planner";
import { EvidenceFields } from "./evidence-fields";
import { defaultRequirements, upgradePlan, LIMITS } from "../../../shared/proof-plan";

type ManualCheck = ManualPlanInput["steps"][number];
export type ManualPlanDraft = Omit<ManualPlanInput, "revision">;
const checkTypeOptions = [
  { value: "object_enters_region", label: "An item goes inside a destination" },
  { value: "visible_state_change", label: "An item visibly changes state" },
  { value: "object_present_at_end", label: "An item is present at the end" },
] satisfies { value: ManualCheck["checkType"]; label: string }[];
const emptyCheck = (): ManualCheck => ({ id: crypto.randomUUID(), checkType: "object_enters_region", subjectConcept: "", targetConcept: null, beforeState: null, afterState: null, requirements: undefined });

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
  const busy = pending || saving;
  function update(id: string, patch: Partial<ManualCheck>) {
    setSteps(current => current.map(step => step.id === id ? { ...step, ...patch } : step));
  }
  return <section className="plan-panel min-w-0" aria-label="Manual plan builder">
    <div className="border-b p-5"><h2 className="text-xl font-semibold">Build your plan manually</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Name your plan and write the checks you want to verify. Start with your own task.</p></div>
    <form className="space-y-5 p-5" onSubmit={async event => {
      event.preventDefault();
      if (busy) return;
      setError(null);
      const draft = { goal: saved?.plan?.goal, limitations: saved?.plan?.limitations, relationships, unresolvedGoals, title: title.trim(), steps: steps.map(step => ({ ...step, requirements: step.requirements?.map(req => ({ ...req, subjectConcept: step.subjectConcept.trim(), targetConcept: step.checkType === "object_enters_region" ? step.targetConcept?.trim() || null : null })), subjectConcept: step.subjectConcept.trim(), targetConcept: step.checkType === "object_enters_region" ? step.targetConcept?.trim() || null : null,
        beforeState: step.checkType === "visible_state_change" ? step.beforeState?.trim() || null : null, afterState: step.checkType === "visible_state_change" ? step.afterState?.trim() || null : null })) };
      try { buildManualPlan({ ...draft, revision: saved?.revision ?? 0 }); }
      catch { setError(`Fill in every required field. Use up to ${LIMITS.steps} checks and ${LIMITS.concepts} different objects.`); return; }
      setSaving(true);
      try { await onSave(draft); }
      catch (failure) { setError(failure instanceof Error ? failure.message : "Your checks could not be saved. Your entries are still here."); }
      finally { setSaving(false); }
    }}>
      <label className="block text-sm font-medium" htmlFor={`${prefix}-title`}>Plan name<Input id={`${prefix}-title`} autoFocus value={title} required maxLength={160} disabled={busy} className="mt-2" onChange={event => setTitle(event.target.value)} /></label>
      <div className="space-y-4">{steps.map((step, index) => <fieldset key={step.id} disabled={busy} className="min-w-0 space-y-4 rounded-xl border p-4">
        <legend className="px-1 text-sm font-semibold">Check {index + 1}</legend>
        <div className="flex items-end gap-2"><div className="min-w-0 flex-1">
          <label className="text-sm font-medium" htmlFor={`${prefix}-${step.id}-type`}>What should happen?</label>
          <Select items={checkTypeOptions} value={step.checkType} disabled={busy} onValueChange={value => {
            if (value) update(step.id, { checkType: value, targetConcept: null, beforeState: null, afterState: null, requirements: undefined });
          }}>
            <SelectTrigger id={`${prefix}-${step.id}-type`} className="mt-2 w-full min-w-0 bg-background px-3 text-sm data-[size=default]:h-11"><SelectValue /></SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {checkTypeOptions.map(option => <SelectItem key={option.value} value={option.value} className="py-2 pr-8 text-sm">{option.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div><Button type="button" variant="ghost" size="icon" aria-label={`Remove manual check ${index + 1}`} disabled={busy || steps.length === 1 || relationships.some(rel => rel.from === step.id || rel.to === step.id)} onClick={() => setSteps(current => current.filter(item => item.id !== step.id))}><Trash2 className="size-4" /></Button></div>
        <label className="block text-sm font-medium" htmlFor={`${prefix}-${step.id}-subject`}>Item to watch<Input id={`${prefix}-${step.id}-subject`} value={step.subjectConcept} required maxLength={120} className="mt-2" onChange={event => update(step.id, { subjectConcept: event.target.value })} /></label>
        {step.checkType === "object_enters_region" && <label className="block text-sm font-medium" htmlFor={`${prefix}-${step.id}-target`}>Destination<Input id={`${prefix}-${step.id}-target`} value={step.targetConcept ?? ""} required maxLength={120} className="mt-2" onChange={event => update(step.id, { targetConcept: event.target.value })} /></label>}
        {step.checkType === "visible_state_change" && <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium" htmlFor={`${prefix}-${step.id}-before`}>State before<Input id={`${prefix}-${step.id}-before`} value={step.beforeState ?? ""} required maxLength={240} className="mt-2" onChange={event => update(step.id, { beforeState: event.target.value })} /></label><label className="block text-sm font-medium" htmlFor={`${prefix}-${step.id}-after`}>State after<Input id={`${prefix}-${step.id}-after`} value={step.afterState ?? ""} required maxLength={240} className="mt-2" onChange={event => update(step.id, { afterState: event.target.value })} /></label></div>}
        <label className="block text-sm">Part of your goal addressed<Input value={step.goalSource ?? ""} onChange={event => update(step.id, { goalSource: event.target.value || undefined })} /></label>
        <EvidenceFields requirements={step.requirements ?? defaultRequirements({ ...step, label: "", observableEvidence: "" })} onChange={requirements => update(step.id, { requirements })} />
        {relationships.some(rel => rel.from === step.id || rel.to === step.id) && <p className="text-sm">Remove this check’s relationships below before deleting it.</p>}
      </fieldset>)}</div>
      <fieldset className="space-y-3 rounded border p-3"><legend>Relationships</legend><p className="text-sm">Without a temporal relationship, actions may happen in either order and may overlap. List position only controls display order. Final presence is checked independently at the end.</p>
        {relationships.map(rel => <div key={rel.id} className="flex flex-wrap gap-2">
          <select aria-label="First check" value={rel.from} onChange={event => setRelationships(items => items.map(item => item.id === rel.id ? { ...item, from: event.target.value } : item))}>{steps.map((step, i) => <option key={step.id} value={step.id}>Check {i + 1}: {step.subjectConcept}</option>)}</select>
          <select aria-label="Relationship" value={rel.type} onChange={event => setRelationships(items => items.map(item => item.id === rel.id ? { ...item, type: event.target.value as typeof rel.type } : item))}><option value="before">Must finish before</option><option value="overlap">Must overlap</option><option value="same_instance">Must use the same item as</option></select>
          <select aria-label="Second check" value={rel.to} onChange={event => setRelationships(items => items.map(item => item.id === rel.id ? { ...item, to: event.target.value } : item))}>{steps.map((step, i) => <option key={step.id} value={step.id}>Check {i + 1}: {step.subjectConcept}</option>)}</select>
          <Button type="button" variant="ghost" onClick={() => setRelationships(items => items.filter(item => item.id !== rel.id))}>Remove relationship</Button>
        </div>)}
        <Button type="button" variant="outline" disabled={steps.length < 2} onClick={() => setRelationships(items => [...items, { id: crypto.randomUUID(), type: "before", from: steps[0]!.id, to: steps[1]!.id }])}>Add relationship</Button>
      </fieldset>
      {unresolvedGoals.map((goal, index) => <div key={index} className="rounded border p-3"><p>Unresolved: {goal.description} ({goal.status.replaceAll("_", " ")})</p><p className="text-sm">Only remove this goal if you explicitly exclude it from this plan. Otherwise refine it through chat.</p><Button type="button" variant="outline" onClick={() => setUnresolvedGoals(items => items.filter((_, i) => i !== index))}>Exclude this goal from the plan</Button></div>)}
      <Button type="button" variant="outline" disabled={busy || steps.length >= LIMITS.steps} onClick={() => setSteps(current => [...current, emptyCheck()])}><Plus className="size-4" />Add check</Button>
      <p className="text-xs leading-5 text-muted-foreground">Up to {LIMITS.steps} checks and {LIMITS.concepts} different objects. Checks must describe visible actions or states. You’ll review and approve the plan before verification.</p>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <div className="flex flex-wrap justify-between gap-3 border-t pt-4"><Button type="button" variant="ghost" disabled={busy} onClick={onCancel}><ArrowLeft className="size-4" />Back</Button><Button type="submit" disabled={busy}>{busy ? "Saving…" : "Save my plan"}</Button></div>
    </form>
  </section>;
}

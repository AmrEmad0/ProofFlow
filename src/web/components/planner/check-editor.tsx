import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { EditableCheck } from "../../../shared/planner";
import { describeEditedCheck, editableCheckSchema } from "../../../shared/planner";
import { EvidenceFields } from "./evidence-fields";
import type { ProofStep } from "../../../shared/proof-plan";

export function CheckEditor({ step, pending, onClose, onSave, onReload }: {
  step: ProofStep; pending: boolean; onClose: () => void; onSave: (edit: EditableCheck) => Promise<void>; onReload: () => Promise<void>;
}) {
  const prefix = useId();
  const [edit, setEdit] = useState<EditableCheck>({ id: step.id, subjectConcept: step.subjectConcept,
    targetConcept: step.targetConcept, beforeState: step.beforeState, afterState: step.afterState, requirements: step.requirements, goalSource: step.goalSource });
  const [error, setError] = useState<string | null>(null);
  const [reloading, setReloading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const busy = pending || reloading;
  const original = editableCheckSchema.parse({ id: step.id, subjectConcept: step.subjectConcept, targetConcept: step.targetConcept, beforeState: step.beforeState, afterState: step.afterState, requirements: step.requirements, goalSource: step.goalSource });
  const normalized = editableCheckSchema.safeParse(edit);
  const changed = normalized.success && JSON.stringify(normalized.data) !== JSON.stringify(original);
  const preview = describeEditedCheck(step, edit);
  const fields: { key: "subjectConcept" | "targetConcept" | "beforeState" | "afterState"; label: string; hint: string; limit: number }[] = [
    { key: "subjectConcept", label: "Which item?", hint: "Use a short description, like red mug or cardboard box.", limit: 120 },
    ...(step.checkType === "object_enters_region" ? [{ key: "targetConcept" as const, label: "Where should it go?", hint: "For example, cardboard box or open drawer.", limit: 120 }] : []),
    ...(step.checkType === "visible_state_change" ? [
      { key: "beforeState" as const, label: "What should it look like before?", hint: "For example, open.", limit: 240 },
      { key: "afterState" as const, label: "What should it look like afterward?", hint: "For example, closed.", limit: 240 },
    ] : []),
  ];

  return <Dialog open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
    <DialogContent showCloseButton={!busy} className="max-h-[90dvh] overflow-y-auto p-5 sm:max-w-xl sm:p-6">
      <DialogTitle className="pr-10 text-xl font-semibold">Change this check</DialogTitle>
      <DialogDescription className="text-base">Change the items or what the camera should show. Save when it looks right.</DialogDescription>
      <form className="space-y-5" onSubmit={async (event) => {
        event.preventDefault();
        if (!changed || busy) return;
        setError(null); setNotice(null);
        try { await onSave({ ...edit, requirements: edit.requirements?.map(req => ({ ...req, subjectConcept: edit.subjectConcept, targetConcept: edit.targetConcept })) }); onClose(); }
        catch (failure) { setError(failure instanceof Error ? failure.message : "Couldn’t save your change. Your edit is still here."); }
      }}>
        {fields.map(({ key, label, hint, limit }, index) => <div key={key}>
          <label htmlFor={`${prefix}-${key}`} className="mb-2 block text-base font-medium">{label}</label>
          <Input id={`${prefix}-${key}`} autoFocus={index === 0} value={edit[key] ?? ""} required maxLength={limit}
            disabled={busy} aria-describedby={`${prefix}-${key}-hint`} className="h-12 text-base"
            onChange={(event) => setEdit((current) => ({ ...current, [key]: event.target.value }))} />
          <p id={`${prefix}-${key}-hint`} className="mt-2 text-sm text-muted-foreground">{hint}</p>
        </div>)}
        {edit.requirements && <EvidenceFields requirements={edit.requirements} onChange={requirements => setEdit(current => ({ ...current, requirements }))} />}
        <div className="rounded-xl border bg-muted/30 p-4"><p className="text-sm font-medium">What the camera needs to show</p><p className="mt-2 break-words text-base leading-7">{preview.observableEvidence}</p></div>
        {error && <div className="space-y-2"><p role="alert" className="text-base text-destructive">{error}</p>
          <Button type="button" variant="outline" disabled={busy} onClick={async () => {
            setReloading(true);
            try { await onReload(); setError(null); setNotice("Saved draft reloaded. Your edit is still here; review it and save again."); }
            catch (failure) { setError(failure instanceof Error ? failure.message : "Couldn’t reload the saved draft. Try again."); }
            finally { setReloading(false); }
          }}>{reloading ? "Reloading…" : "Reload saved draft"}</Button>
        </div>}
        {notice && <p role="status" className="text-sm leading-6 text-muted-foreground">{notice}</p>}
        <div className="flex flex-wrap justify-end gap-3">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={busy || !changed || fields.some(({ key }) => !edit[key]?.trim())}>{pending ? "Saving…" : "Save change"}</Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { EditableCheck } from "../../../shared/planner";

const evidenceOptions = [
  { value: "action", label: "An action happening" },
  { value: "condition", label: "A visible condition" },
] as const;
const timingOptions = [
  { value: "anytime", label: "At any visible moment" },
  { value: "start", label: "At the start" },
  { value: "end", label: "At the end" },
] as const;

type Fields = Pick<EditableCheck, "label" | "observableEvidence" | "visualCheck">;

export function VisualCheckFields({ value, onChange, disabled = false }: { disabled?: boolean; value: Fields; onChange: (patch: Partial<Fields>) => void }) {
  const id = useId();
  const scope = value.visualCheck ?? { kind: "action", timing: "anytime" };
  return <div className="space-y-3">
    <label className="block text-sm" htmlFor={`${id}-name`}>Check name<Input id={`${id}-name`} value={value.label ?? ""} required maxLength={240} placeholder="e.g. Wipe the tabletop" onChange={event => onChange({ label: event.target.value })} /></label>
    <label className="block text-sm" htmlFor={`${id}-evidence`}>What should the video show?<textarea id={`${id}-evidence`} className="mt-2 min-h-24 w-full rounded-md border bg-background p-3" value={value.observableEvidence ?? ""} required maxLength={600} placeholder="Describe the visible action or condition in your own words." onChange={event => onChange({ observableEvidence: event.target.value })} /></label>
    <div className="flex flex-wrap gap-3">
      <div className="min-w-0 text-sm">
        <label htmlFor={`${id}-kind`}>Evidence to capture</label>
        <Select items={evidenceOptions} value={scope.kind} disabled={disabled} onValueChange={kind => {
          if (kind) onChange({ visualCheck: { kind, timing: "anytime" } });
        }}>
          <SelectTrigger id={`${id}-kind`} className="mt-1 w-full bg-background px-3 text-sm data-[size=default]:h-11"><SelectValue /></SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {evidenceOptions.map(option => <SelectItem key={option.value} value={option.value} className="py-2 pr-8 text-sm">{option.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {scope.kind === "condition" && <div className="min-w-0 text-sm">
        <label htmlFor={`${id}-timing`}>When to check</label>
        <Select items={timingOptions} value={scope.timing} disabled={disabled} onValueChange={timing => {
          if (timing) onChange({ visualCheck: { ...scope, timing } });
        }}>
          <SelectTrigger id={`${id}-timing`} className="mt-1 w-full bg-background px-3 text-sm data-[size=default]:h-11"><SelectValue /></SelectTrigger>
          <SelectContent alignItemWithTrigger={false}>
            {timingOptions.map(option => <SelectItem key={option.value} value={option.value} className="py-2 pr-8 text-sm">{option.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>}
    </div>
  </div>;
}

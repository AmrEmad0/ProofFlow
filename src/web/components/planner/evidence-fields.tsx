import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { ProofStep } from "../../../shared/proof-plan";

export function EvidenceFields({ requirements, onChange, visualCheck }: { requirements: NonNullable<ProofStep["requirements"]>; onChange: (requirements: NonNullable<ProofStep["requirements"]>) => void; visualCheck?: ProofStep["visualCheck"] }) {
  return <div className="space-y-3">{requirements.map((req, index) => <fieldset key={req.id} className="space-y-2 rounded border p-3">
    <label className="block text-sm">{visualCheck?.kind === "condition" ? "What visible evidence establishes this condition?" : req.phase === "before" ? "What must be visible before?" : req.phase === "action" ? "What action must be visible?" : "What must be visible afterward (or at the end)?"}
      <Input required maxLength={600} value={req.description} onChange={event => onChange(requirements.map((item, i) => i === index ? { ...item, description: event.target.value } : item))} /></label>
    <label className="block text-sm">Decisive details that must stay visible (one per line)
      <textarea required className="w-full rounded border bg-background p-2" value={req.decisiveDetails.join("\n")} onChange={event => onChange(requirements.map((item, i) => i === index ? { ...item, decisiveDetails: event.target.value.split("\n") } : item))} /></label>
    {visualCheck?.kind === "action" && req.phase !== "action" && <Button type="button" variant="ghost" onClick={() => onChange(requirements.filter(item => item.id !== req.id))}>Remove {req.phase} requirement</Button>}
  </fieldset>)}
    {visualCheck?.kind === "action" && requirements[0] && <div className="flex flex-wrap gap-2">{(["before", "after"] as const).filter(phase => !requirements.some(req => req.phase === phase)).map(phase => <Button type="button" variant="outline" key={phase} onClick={() => onChange([...requirements, { ...requirements[0]!, id: crypto.randomUUID(), phase, description: "", decisiveDetails: [""] }])}>Add {phase} evidence</Button>)}</div>}
  </div>;
}

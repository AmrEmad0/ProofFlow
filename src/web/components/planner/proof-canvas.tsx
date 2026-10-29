import { useId, useState, type CSSProperties } from "react";
import { ArrowRight, Camera, ChevronDown, CircleDashed, Layers2, MoveRight, PencilLine, ScanLine, Shapes, Shuffle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { canvasObjects, canvasPhases, canvasRelationships, checkLabels } from "@/lib/proof-canvas";
import type { ProofPlan, ProofStep } from "../../../shared/proof-plan";

type Phase = ReturnType<typeof canvasPhases>[number];
type Props = {
  plan: ProofPlan;
  pending: boolean;
  changedIds: string[];
  onEdit?: (step: ProofStep) => void;
  onRemove?: (id: string) => void;
};

function MovementGlyph({ phase }: { phase: Phase["phase"] }) {
  const x = phase === "before" ? 12 : phase === "action" ? 49 : 83;
  return <svg viewBox="0 0 140 72" className="proof-phase-art" fill="none" aria-hidden="true">
    <rect x="69" y="11" width="58" height="50" rx="10" stroke="currentColor" strokeDasharray="4 4" className="proof-region" />
    <path d="M10 64h120" stroke="currentColor" opacity=".12" />
    {phase === "action" && <path d="M12 35h27m-6-5 6 5-6 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
    <rect x={x} y="23" width="28" height="28" rx="7" fill="currentColor" fillOpacity=".1" stroke="currentColor" strokeWidth="1.8" />
    <path d={`M${x + 9} 33h10m-10 7h6`} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>;
}

function PhaseVisual({ step, phase }: { step: ProofStep; phase: Phase }) {
  if (step.checkType === "object_enters_region") return <>
    <MovementGlyph phase={phase.phase} />
    <span className="proof-phase-object">{step.subjectConcept}</span>
    <span className="proof-phase-caption">{phase.phase === "before" ? "Outside" : phase.phase === "action" ? "Crossing into" : "Inside"} <strong>{step.targetConcept}</strong></span>
  </>;
  if (step.checkType === "visible_state_change") return <>
    <span className="proof-state-art" aria-hidden="true">{phase.phase === "action" ? <Shuffle /> : <span className={`proof-state-dot ${phase.phase === "after" ? "proof-state-dot-after" : ""}`} />}</span>
    <span className="proof-phase-object">{phase.phase === "action" ? step.subjectConcept : phase.phase === "before" ? step.beforeState : step.afterState}</span>
    <span className="proof-phase-caption">{phase.phase === "action" ? "Visible transition" : step.subjectConcept}</span>
  </>;
  if (step.checkType === "visual_check") return <>
    <span className="proof-state-art" aria-hidden="true"><Camera /></span>
    <span className="proof-phase-object">{phase.description}</span>
    <span className="proof-phase-caption">{step.subjectConcept}{step.targetConcept ? ` · ${step.targetConcept}` : ""}</span>
  </>;
  return <>
    <span className="proof-presence-art" aria-hidden="true"><ScanLine /><span><Shapes /></span></span>
    <span className="proof-phase-object">{step.subjectConcept}</span>
    <span className="proof-phase-caption">Visible in the ending frames</span>
  </>;
}

function CanvasCheck({ step, index, pending, changed, highlighted, onEdit, onRemove }: {
  step: ProofStep; index: number; pending: boolean; changed: boolean; highlighted: boolean;
  onEdit: Props["onEdit"]; onRemove: Props["onRemove"];
}) {
  const id = useId();
  const [selectedPhase, setSelectedPhase] = useState<Phase["phase"] | "all" | null>(null);
  const phases = canvasPhases(step);
  const visiblePhases = selectedPhase === "all" ? phases : phases.filter(phase => phase.phase === selectedPhase);
  const Icon = step.checkType === "visual_check" ? Camera : step.checkType === "object_enters_region" ? MoveRight : step.checkType === "visible_state_change" ? Shuffle : ScanLine;
  return <li className={`proof-canvas-check ${changed ? "proof-canvas-changed" : ""}`} data-highlighted={highlighted || undefined} style={{ "--check-index": index } as CSSProperties}>
    <div className="proof-check-heading">
      <span className="proof-check-number">{index + 1}</span>
      <div className="min-w-0 flex-1"><span className="proof-check-kind"><Icon className="size-3.5" aria-hidden="true" />{checkLabels[step.checkType]}</span><h3>{step.label}</h3>
        {changed && <span className="proof-changed-label">Changed — please review</span>}
      </div>
    </div>
    <div className={`proof-phase-grid ${phases.length === 1 ? "proof-phase-single" : ""}`}>
      {phases.map(phase => <button type="button" className="proof-phase" key={phase.id} aria-label={`Inspect ${phase.phase} expectation for check ${index + 1}`} aria-expanded={selectedPhase === phase.phase || selectedPhase === "all"} aria-controls={`${id}-details`} onClick={() => setSelectedPhase(current => current === phase.phase ? null : phase.phase)}>
        <span className="proof-phase-label">{step.checkType === "object_present_at_end" ? "At the end" : step.visualCheck?.kind === "condition" ? ({ anytime: "Visible condition", start: "At the start", end: "At the end" }[step.visualCheck.timing]) : phase.phase}<span aria-hidden="true">↗</span></span>
        <PhaseVisual step={step} phase={phase} />
      </button>)}
    </div>
    <div className="proof-check-toolbar">
      <Button variant="ghost" className="h-11 px-2 text-sm" aria-label={`Filming details for check ${index + 1}`} aria-expanded={selectedPhase !== null} aria-controls={`${id}-details`} onClick={() => setSelectedPhase(current => current === "all" ? null : "all")}><Camera className="size-4" />Filming details<ChevronDown className={`size-3.5 ${selectedPhase ? "rotate-180" : ""}`} /></Button>
      {onEdit && <Button variant="ghost" className="h-11 px-2 text-sm" disabled={pending} aria-label={`Change check ${index + 1}`} onClick={() => onEdit(step)}><PencilLine className="size-4" />Change</Button>}
      {onRemove && <Button variant="ghost" className="ml-auto h-11 px-2 text-muted-foreground" disabled={pending} aria-label={`Remove check ${index + 1}`} onClick={() => onRemove(step.id)}><Trash2 className="size-4" /></Button>}
    </div>
    <div id={`${id}-details`} hidden={selectedPhase === null} className="proof-phase-details">
      {visiblePhases.map(phase => <div key={phase.id}><h4>{phase.phase === "after" && step.checkType === "object_present_at_end" ? "At the end" : step.visualCheck?.kind === "condition" ? ({ anytime: "Visible condition", start: "At the start", end: "At the end" }[step.visualCheck.timing]) : phase.phase}</h4><p>{phase.description}</p><div className="proof-detail-chips">{phase.decisiveDetails.map((detail, i) => <span key={i}>{detail}</span>)}</div></div>)}
      <p className="proof-original-evidence">{step.observableEvidence}</p>
      {step.goalSource && <p className="proof-goal-source">Addresses: {step.goalSource}</p>}
    </div>
  </li>;
}

export function ProofCanvas({ plan, pending, changedIds, onEdit, onRemove }: Props) {
  const [selectedObject, setSelectedObject] = useState<string | null>(null);
  const objects = canvasObjects(plan);
  const selected = objects.find(object => object.key === selectedObject);
  const relationships = canvasRelationships(plan);
  return <div className="proof-canvas">
    <div className="proof-canvas-intro"><div><span className="eyebrow">YOUR PROOF CANVAS</span><h3>What we’ll look for</h3></div><span className="proof-canvas-key"><CircleDashed className="size-3.5" aria-hidden="true" />Planned evidence</span></div>
    <div className="proof-object-list" aria-label="Explore objects in this plan"><Shapes className="size-4 text-muted-foreground" aria-hidden="true" />{objects.map(object => <button type="button" className="proof-object-chip" key={object.key} aria-pressed={selected?.key === object.key} onClick={() => setSelectedObject(current => current === object.key ? null : object.key)}>{object.label}<span>{object.checkIds.length}</span></button>)}</div>
    <p className="proof-object-hint" role="status">{selected ? `${selected.checkIds.length} ${selected.checkIds.length === 1 ? "check uses" : "checks use"} ${selected.label}. Select it again to clear the highlight.` : "Explore an object, or select a scene for its exact evidence requirements."}</p>
    {plan.steps.length > 1 && <div className="proof-relationships">
      <p>{relationships.length ? "Connections between checks" : "No required order · actions may overlap"}</p>
      {relationships.map(relationship => {
        const from = plan.steps.findIndex(step => step.id === relationship.from);
        const to = plan.steps.findIndex(step => step.id === relationship.to);
        if (from < 0 || to < 0) return null;
        const Icon = relationship.type === "before" ? ArrowRight : relationship.type === "overlap" ? Layers2 : Shapes;
        const label = relationship.type === "before" ? "finishes before" : relationship.type === "overlap" ? "overlaps" : "same item as";
        return <div className="proof-relationship" key={relationship.id} role="group" aria-label={`${plan.steps[from]!.label} ${label} ${plan.steps[to]!.label}`}><span>Check {from + 1}</span><Icon className="size-3.5" aria-hidden="true" /><strong>{label}</strong><span>Check {to + 1}</span></div>;
      })}
      {plan.steps.some(step => step.checkType === "object_present_at_end") && <span className="proof-end-note">Final presence is checked independently at the end.</span>}
    </div>}
    <ul className="proof-canvas-checks">{plan.steps.map((step, index) => <CanvasCheck key={step.id} step={step} index={index} pending={pending} changed={changedIds.includes(step.id)} highlighted={selected?.checkIds.includes(step.id) ?? false} onEdit={onEdit} onRemove={plan.steps.length > 1 ? onRemove : undefined} />)}</ul>
    <p className="proof-canvas-disclaimer">Diagrams describe the plan. Video evidence comes after approval.</p>
  </div>;
}

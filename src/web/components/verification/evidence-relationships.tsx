import { ArrowRight, Check, ChevronDown, CircleHelp, Layers2, Minus, Play, Shapes } from "lucide-react";
import { evidenceRelationships } from "@/lib/evidence-presentation";
import type { ProofPlan } from "../../../shared/proof-plan";
import type { Finding } from "../../../shared/receipt";

export function EvidenceRelationships({ plan, findings, active, hasMedia, onInspect }: {
  plan: ProofPlan; findings: Finding[]; active: boolean; hasMedia: boolean;
  onInspect: (id: string, startMs: number) => void;
}) {
  const relationships = evidenceRelationships(findings);
  if (!relationships.length) return null;
  return <div className="evidence-relationships" aria-label="Relationship results" role="group">
    <div className="evidence-relationships-heading"><Shapes className="size-3.5" aria-hidden="true" /><h4>How the checks connect</h4><span>{relationships.length}</span></div>
    <div className="space-y-2">{relationships.map(result => {
      const relationship = plan.relationships?.find(item => item.id === result.id);
      const Icon = result.status === "observed" ? Check : result.status === "uncertain" ? CircleHelp : Minus;
      const ConnectionIcon = relationship?.type === "overlap" ? Layers2 : relationship?.type === "same_instance" ? Shapes : ArrowRight;
      const label = relationship?.type === "before" ? "Finishes before" : relationship?.type === "overlap" ? "Overlaps" : relationship?.type === "same_instance" ? "Same item" : "Relationship";
      return <div key={result.id} className="evidence-relationship" data-status={result.status}>
        <div className="evidence-relationship-heading"><span><ConnectionIcon className="size-3.5" aria-hidden="true" />{label}</span><span className="evidence-verdict"><Icon className="size-3" aria-hidden="true" />{result.status.replaceAll("_", " ")}{active && " · confirming"}</span></div>
        {relationship && <div className="evidence-connection">{[relationship.from, relationship.to].map((stepId, index) => {
          const step = plan.steps.find(item => item.id === stepId);
          const finding = findings.find(item => item.stepId === stepId);
          if (!step) return null;
          return <div className="evidence-connection-part" key={stepId}>
            {index > 0 && <ConnectionIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
            <button type="button" disabled={!finding || !hasMedia} onClick={() => finding && onInspect(stepId, finding.startMs ?? 0)} aria-label={`Inspect connected check: ${step.label}`} title={step.label}>
              <span className="evidence-connection-number">{plan.steps.indexOf(step) + 1}</span><span>{step.label}</span>{finding && hasMedia && <Play className="size-3 shrink-0" aria-hidden="true" />}
            </button>
          </div>;
        })}</div>}
        <details className="group/connection"><summary>Relationship details<ChevronDown className="size-3 transition-transform group-open/connection:rotate-180" aria-hidden="true" /></summary><p>{result.description}</p></details>
      </div>;
    })}</div>
  </div>;
}

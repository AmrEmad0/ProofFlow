import { buildManualPlan, describeEditedCheck, type ManualPlanInput } from "../../shared/planner";
import { defaultRequirements } from "../../shared/proof-plan";

export type ManualCheck = ManualPlanInput["steps"][number];

export function manualCheckReady(step: ManualCheck) {
  return Boolean(step.subjectConcept.trim() && (step.checkType === "object_enters_region" ? step.targetConcept?.trim()
    : step.checkType === "visible_state_change" ? step.beforeState?.trim() && step.afterState?.trim()
    : step.checkType === "visual_check" ? step.label?.trim() && step.observableEvidence?.trim() && step.visualCheck : true));
}

function displayCheck(step: ManualCheck) {
  return { ...step,
    subjectConcept: step.subjectConcept.trim() || "Your item",
    targetConcept: step.checkType === "object_enters_region" ? step.targetConcept?.trim() || "your destination" : step.checkType === "visual_check" ? step.targetConcept?.trim() || null : null,
    beforeState: step.checkType === "visible_state_change" ? step.beforeState?.trim() || "in its initial state" : null,
    afterState: step.checkType === "visible_state_change" ? step.afterState?.trim() || "in its resulting state" : null,
  };
}

export function manualRequirements(step: ManualCheck) {
  return defaultRequirements({ ...displayCheck(step), label: step.label ?? "", observableEvidence: step.observableEvidence ?? "" });
}

export function updateManualCheck(step: ManualCheck, patch: Partial<ManualCheck>): ManualCheck {
  const next = { ...step, ...patch };
  if (patch.checkType && patch.checkType !== step.checkType) {
    return { ...next, visualCheck: patch.checkType === "visual_check" ? { kind: "action", timing: "anytime" } : null, targetConcept: null, beforeState: null, afterState: null, requirements: undefined, label: undefined, observableEvidence: undefined };
  }
  if (patch.visualCheck && patch.visualCheck.kind !== step.visualCheck?.kind) return { ...next, requirements: undefined };
  const previousDescription = describeEditedCheck({ ...displayCheck(step), label: "", observableEvidence: "", requirements: undefined }, { ...displayCheck(step), requirements: undefined });
  const nextDescription = describeEditedCheck({ ...displayCheck(next), label: "", observableEvidence: "", requirements: undefined }, { ...displayCheck(next), requirements: undefined });
  if (step.label === previousDescription.label) next.label = nextDescription.label;
  if (step.observableEvidence === previousDescription.observableEvidence) next.observableEvidence = nextDescription.observableEvidence;
  if (step.goalSource === previousDescription.label) next.goalSource = nextDescription.label;
  if (step.requirements && !("requirements" in patch)) {
    const previousDefaults = manualRequirements(step), nextDefaults = manualRequirements(next);
    next.requirements = step.requirements.map(req => {
      const previous = previousDefaults.find(item => item.phase === req.phase);
      const generated = nextDefaults.find(item => item.phase === req.phase);
      return { ...req, subjectConcept: next.subjectConcept.trim(), targetConcept: next.checkType === "object_enters_region" || next.checkType === "visual_check" ? next.targetConcept?.trim() || null : null,
        description: previous?.description === req.description && generated ? generated.description : req.description };
    });
  }
  return next;
}

export function manualPreview(title: string, steps: ManualCheck[], relationships: NonNullable<ManualPlanInput["relationships"]>) {
  const complete = steps.filter(manualCheckReady);
  if (!complete.length) return null;
  try {
    return buildManualPlan({ revision: 0, title: title.trim() || "Untitled plan", steps: complete,
      relationships: relationships.filter(rel => complete.some(step => step.id === rel.from) && complete.some(step => step.id === rel.to)) });
  } catch { return null; }
}

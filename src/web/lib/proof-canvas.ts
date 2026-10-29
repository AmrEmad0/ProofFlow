import { canonicalConcept, defaultRequirements, type CheckType, type ProofPlan, type ProofStep } from "../../shared/proof-plan";

export const checkLabels: Record<CheckType, string> = {
  object_enters_region: "Object movement",
  visible_state_change: "Visible change",
  object_present_at_end: "Present at the end",
  visual_check: "Custom visual check",
};

export function canvasPhases(step: ProofStep) {
  const requirements = step.requirements ?? defaultRequirements(step);
  return (["before", "action", "after"] as const).flatMap(phase => {
    const requirement = requirements.find(req => req.phase === phase);
    return requirement ? [requirement] : [];
  });
}

export function canvasObjects(plan: ProofPlan) {
  const objects = new Map<string, { key: string; label: string; checkIds: string[] }>();
  for (const step of plan.steps) {
    for (const concept of [step.subjectConcept, step.targetConcept]) {
      if (!concept) continue;
      const key = canonicalConcept(concept);
      const object = objects.get(key) ?? { key, label: concept, checkIds: [] };
      if (!object.checkIds.includes(step.id)) object.checkIds.push(step.id);
      objects.set(key, object);
    }
  }
  return [...objects.values()];
}

export function canvasRelationships(plan: ProofPlan): NonNullable<ProofPlan["relationships"]> {
  if (plan.schemaVersion === 2) return plan.relationships ?? [];
  // Version 1 actions were sequential; final presence is independent of that order.
  const actions = plan.steps.filter(step => step.checkType !== "object_present_at_end");
  return actions.slice(1).map((step, index) => ({
    id: `legacy-order-${index}`, type: "before", from: actions[index]!.id, to: step.id,
  }));
}

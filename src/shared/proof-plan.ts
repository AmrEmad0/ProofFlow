import { z } from "zod";

export const LIMITS = {
  steps: 5,
  concepts: 4,
  durationMs: 30_000,
  uploadBytes: 25 * 1024 * 1024,
} as const;

export const checkTypeSchema = z.enum([
  "object_enters_region",
  "visible_state_change",
  "object_present_at_end",
]);

export const evidenceRequirementSchema = z.strictObject({
  id: z.string().trim().min(1).max(80),
  phase: z.enum(["before", "action", "after"]),
  rule: z.enum(["outside", "crossing", "inside", "initial_state", "transition", "resulting_state", "ending_presence"]),
  description: z.string().trim().min(1).max(600),
  subjectConcept: z.string().trim().min(1).max(120),
  targetConcept: z.string().trim().min(1).max(120).nullable(),
  decisiveDetails: z.array(z.string().trim().min(1).max(240)).min(1).max(6),
});
export const relationshipSchema = z.strictObject({
  id: z.string().trim().min(1).max(80),
  type: z.enum(["before", "overlap", "same_instance"]),
  from: z.string().min(1), to: z.string().min(1),
});

export const proofStepSchema = z.strictObject({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(240),
  checkType: checkTypeSchema,
  subjectConcept: z.string().trim().min(1).max(120),
  targetConcept: z.string().trim().min(1).max(120).nullable(),
  beforeState: z.string().trim().min(1).max(240).nullable(),
  afterState: z.string().trim().min(1).max(240).nullable(),
  goalSource: z.string().trim().min(1).max(1000).optional(),
  requirements: z.array(evidenceRequirementSchema).min(1).max(3).optional(),
  observableEvidence: z.string().trim().min(1).max(1000),
}).superRefine((step, ctx) => {
  if (step.checkType === "object_enters_region" && !step.targetConcept) {
    ctx.addIssue({ code: "custom", path: ["targetConcept"], message: "An entry check needs a target region." });
  }
  if (step.checkType === "visible_state_change" && (!step.beforeState || !step.afterState)) {
    ctx.addIssue({ code: "custom", path: ["beforeState"], message: "A state change needs visible before and after states." });
  }
});

// Keep the shape separate so model JSON Schema contains structural constraints;
// cross-field domain rules are always checked locally after parsing.
export const proofPlanShape = z.strictObject({
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  title: z.string().trim().min(1).max(160),
  goal: z.string().trim().min(1).max(2000),
  steps: z.array(proofStepSchema).min(1).max(LIMITS.steps),
  relationships: z.array(relationshipSchema).max(20).optional(),
  unresolvedGoals: z.array(z.strictObject({ description: z.string().trim().min(1).max(1000), status: z.enum(["needs_clarification", "unsupported"]) })).max(20).optional(),
  limitations: z.array(z.string().trim().min(1).max(1000)).max(10),
});

export const proofPlanSchema = proofPlanShape.superRefine((plan, ctx) => {
  if (plan.schemaVersion === 2) {
    const issue = (message: string) => ctx.addIssue({ code: "custom", message });
    if (!plan.relationships || !plan.unresolvedGoals) issue("Version 2 needs explicit relationships and unresolved goals.");
    for (const step of plan.steps) {
      if (step.checkType === "object_present_at_end" && (step.targetConcept || step.beforeState || step.afterState)) issue("Final presence has no target or preceding state change.");
      const rules = step.checkType === "object_enters_region" ? { before: "outside", action: "crossing", after: "inside" }
        : step.checkType === "visible_state_change" ? { before: "initial_state", action: "transition", after: "resulting_state" } : { before: "", action: "", after: "ending_presence" };
      for (const req of step.requirements ?? []) if (req.rule !== rules[req.phase]) issue("Evidence rules must match the supported check type and phase; descriptions cannot add capabilities.");
      const phases = step.requirements?.map(req => req.phase).sort().join(",");
      if (!step.goalSource || phases !== (step.checkType === "object_present_at_end" ? "after" : "action,after,before")) issue("Each check needs its goal source and exactly its supported evidence phases.");
      if (new Set(step.requirements?.map(req => req.id)).size !== step.requirements?.length) issue("Requirement IDs must be unique within a check.");
      for (const req of step.requirements ?? []) if (req.subjectConcept !== step.subjectConcept || req.targetConcept !== step.targetConcept) issue("Requirements must reference the check's approved subject and target.");
    }
    const ids = new Set(plan.steps.map(step => step.id));
    const relations = plan.relationships ?? [];
    if (new Set(relations.map(rel => rel.id)).size !== relations.length) issue("Relationship IDs must be unique.");
    const edges = new Map<string, string[]>();
    for (const rel of relations) {
      if (!ids.has(rel.from) || !ids.has(rel.to) || rel.from === rel.to) issue("Relationships need two different existing checks.");
      const a = plan.steps.find(step => step.id === rel.from), b = plan.steps.find(step => step.id === rel.to);
      if (rel.type === "same_instance" && a?.subjectConcept !== b?.subjectConcept) issue("Same-instance relationships need matching subject concepts.");
      if (rel.type !== "same_instance" && (a?.checkType === "object_present_at_end" || b?.checkType === "object_present_at_end")) issue("Final presence is independent of action order.");
      if (rel.type === "before") edges.set(rel.from, [...edges.get(rel.from) ?? [], rel.to]);
    }
    const reaches = (from: string, to: string, seen = new Set<string>()): boolean => {
      if (seen.has(from)) return false;
      seen.add(from);
      return (edges.get(from) ?? []).some(next => next === to || reaches(next, to, seen));
    };
    for (const id of ids) if (reaches(id, id)) issue("Before relationships cannot contain a cycle.");
    for (const rel of relations) if (rel.type === "overlap" && (reaches(rel.from, rel.to) || reaches(rel.to, rel.from))) issue("Overlap contradicts the required order.");
  }
  if (new Set(plan.steps.map((step) => step.id)).size !== plan.steps.length) {
    ctx.addIssue({ code: "custom", path: ["steps"], message: "Step IDs must be unique." });
  }
  if (trackedConcepts(plan).length > LIMITS.concepts) {
    ctx.addIssue({ code: "custom", path: ["steps"], message: "At most four unique object concepts are supported." });
  }
});

export const approvedPlanSchema = proofPlanSchema.safeExtend({
  approvedVersionId: z.uuid(),
  contractHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export type CheckType = z.infer<typeof checkTypeSchema>;
export type ProofStep = z.infer<typeof proofStepSchema>;
export type ProofPlan = z.infer<typeof proofPlanSchema>;
export type ApprovedPlan = z.infer<typeof approvedPlanSchema>;

export const canonicalConcept = (concept: string) => concept.trim().toLowerCase();

export function trackedConcepts(plan: { steps: ProofStep[] }): string[] {
  return [...new Set(plan.steps.flatMap((step) => [step.subjectConcept, step.targetConcept])
    .filter((concept): concept is string => concept !== null)
    .map(canonicalConcept))];
}

export const planningPlanShape = proofPlanShape.extend({
  schemaVersion: z.literal(2),
  steps: z.array(proofStepSchema.safeExtend({ goalSource: z.string().min(1).max(1000), requirements: z.array(evidenceRequirementSchema).min(1).max(3) })).min(1).max(LIMITS.steps),
  relationships: z.array(relationshipSchema).max(20),
  unresolvedGoals: proofPlanShape.shape.unresolvedGoals.unwrap(),
});

export function filmingGuidance(step: ProofStep): string[] {
  return step.requirements?.map(req => `${req.phase}: ${req.description} Keep visible: ${req.decisiveDetails.join("; ")}.`) ?? [step.observableEvidence];
}

export function upgradePlan(plan: ProofPlan): ProofPlan {
  if (plan.schemaVersion === 2) return plan;
  return proofPlanSchema.parse({ ...plan, schemaVersion: 2, unresolvedGoals: [],
    relationships: plan.steps.filter(step => step.checkType !== "object_present_at_end").slice(1).map((step, i) => ({ id: `legacy-order-${i}`, type: "before", from: plan.steps.filter(s => s.checkType !== "object_present_at_end")[i]!.id, to: step.id })),
    steps: plan.steps.map(step => ({ ...step, goalSource: step.label, requirements: defaultRequirements(step) })) });
}

export function defaultRequirements(step: ProofStep): z.infer<typeof evidenceRequirementSchema>[] {
  const descriptions = step.checkType === "object_enters_region"
    ? { before: `${step.subjectConcept} visibly outside ${step.targetConcept}`, action: `${step.subjectConcept} visibly crossing the opening of ${step.targetConcept}`, after: `${step.subjectConcept} visibly inside ${step.targetConcept}` }
    : { before: `${step.subjectConcept} visibly ${step.beforeState}`, action: `${step.subjectConcept} visibly changing from ${step.beforeState} to ${step.afterState}`, after: step.checkType === "object_present_at_end" ? `${step.subjectConcept} visibly present in the ending frames` : `${step.subjectConcept} visibly ${step.afterState}` };
  return (step.checkType === "object_present_at_end" ? ["after"] as const : ["before", "action", "after"] as const).map(phase => ({ id: `${step.id}-${phase}`, phase, rule: step.checkType === "object_enters_region" ? ({ before: "outside", action: "crossing", after: "inside" } as const)[phase] : step.checkType === "visible_state_change" ? ({ before: "initial_state", action: "transition", after: "resulting_state" } as const)[phase] : "ending_presence", description: descriptions[phase], subjectConcept: step.subjectConcept, targetConcept: step.targetConcept, decisiveDetails: [step.checkType === "object_enters_region" ? "Subject and target opening" : "Subject identity and visible state"] }));
}

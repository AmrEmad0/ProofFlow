import { describe, expect, test } from "bun:test";
import { hashContract } from "../src/server/engine/contract";
import { packproofTemplate } from "../src/shared/packproof";
import { approvedPlanSchema, proofPlanSchema, trackedConcepts } from "../src/shared/proof-plan";
import { findingSchema, isActiveRun } from "../src/shared/receipt";

describe("proof contracts", () => {
  test("PackProof uses three observable steps and three concepts", () => {
    expect(proofPlanSchema.parse(packproofTemplate).steps).toHaveLength(3);
    expect(trackedConcepts(packproofTemplate)).toHaveLength(3);
  });

  test("rejects empty, oversized, and duplicate step lists", () => {
    expect(proofPlanSchema.safeParse({ ...packproofTemplate, steps: [] }).success).toBe(false);
    expect(proofPlanSchema.safeParse({ ...packproofTemplate, steps: [...packproofTemplate.steps, packproofTemplate.steps[0]] }).success).toBe(false);
    const steps = structuredClone(packproofTemplate.steps);
    steps[1]!.id = steps[0]!.id;
    expect(proofPlanSchema.safeParse({ ...packproofTemplate, steps }).success).toBe(false);
  });

  test("rejects unsupported checks, missing entry targets, and incomplete state changes", () => {
    for (const changes of [
      { checkType: "internal_condition" },
      { targetConcept: null },
      { checkType: "visible_state_change", beforeState: "open", afterState: null },
    ]) {
      expect(proofPlanSchema.safeParse({ ...packproofTemplate, steps: [{ ...packproofTemplate.steps[0], ...changes }] }).success).toBe(false);
    }
  });

  test("deduplicates concepts by case and whitespace and rejects a fifth concept", () => {
    const steps = structuredClone(packproofTemplate.steps);
    steps[0]!.subjectConcept = "  CARDBOARD BOX  ";
    expect(trackedConcepts({ steps })).toHaveLength(2);
    steps[0]!.subjectConcept = "blue product";
    steps[1]!.targetConcept = "plastic tray";
    steps[2]!.targetConcept = "shipping label";
    expect(proofPlanSchema.safeParse({ ...packproofTemplate, steps }).success).toBe(false);
  });

  test("approval preserves validation rules and hashes the visible contract", () => {
    const hash = hashContract(packproofTemplate);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    const reordered = Object.fromEntries(Object.entries(packproofTemplate).reverse());
    expect(hashContract(proofPlanSchema.parse(reordered))).toBe(hash);
    expect(hashContract({ ...packproofTemplate, title: "Edited plan" })).not.toBe(hash);
    const approved = { ...packproofTemplate, approvedVersionId: crypto.randomUUID(), contractHash: hash };
    expect(approvedPlanSchema.safeParse(approved).success).toBe(true);
    expect(approvedPlanSchema.safeParse({ ...approved, steps: [] }).success).toBe(false);
  });

  test("findings preserve uncertainty and require ordered evidence windows", () => {
    const finding = { stepId: "insert-slip", status: "uncertain", startMs: 100, endMs: 200, explanation: "Slip occluded", evidence: [] };
    expect(findingSchema.safeParse(finding).success).toBe(true);
    expect(findingSchema.safeParse({ ...finding, status: "passed" }).success).toBe(false);
    expect(findingSchema.safeParse({ ...finding, startMs: 300 }).success).toBe(false);
    expect(findingSchema.safeParse({ ...finding, startMs: null }).success).toBe(false);
    expect(isActiveRun("analyzing")).toBe(true);
    expect(isActiveRun("failed")).toBe(false);
    expect(isActiveRun("completed")).toBe(false);
  });
});

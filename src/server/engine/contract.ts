import { createHash } from "node:crypto";
import { proofPlanSchema, type ProofPlan } from "../../shared/proof-plan";

// Zod emits fields in schema order, so source object property order does not
// affect this hash. Step ordering remains significant to the approved contract.
export function hashContract(plan: ProofPlan): string {
  const validated = proofPlanSchema.parse(plan);
  return createHash("sha256").update(JSON.stringify(validated)).digest("hex");
}

import type { Database } from "bun:sqlite";
import { Elysia, t } from "elysia";
import OpenAI from "openai";
import { applyImprovementSchema, scopeReviewWarnings, improvementProposalSchema, improvementRequestSchema } from "../../shared/plan-improvement";
import { hashContract } from "../engine/contract";
import type { Config } from "../config";
import { requireWorkspaceOrigin, sessionHash } from "../http/session";
import { createMetaClient, MODELS } from "../meta/client";
import { IMPROVEMENT_PROMPT_VERSION, improvePlan, type PlanImprover, type ImprovementCallbacks } from "../planner/improve";
import { PlannerError, plannerStore } from "../planner/store";
import { verificationStore } from "../verification/store";

import { improvementEvents } from "../planner/improvement-stream";

const paramsSchema = t.Object({ id: t.String({ format: "uuid" }) });

export function planImprovementRoutes(db: Database, config: Config, busySessions: Set<string>, improver?: PlanImprover) {
  const attempts = new Map<string, number[]>();
  const plans = plannerStore(db);
  function context(planId: string, owner: string, revision: number, runId: string) {
    const current = plans.read(planId, owner);
    if (current.revision !== revision) throw new PlannerError(409, "This plan changed. Reload it before requesting or saving suggestions.");
    if (!current.plan) throw new PlannerError(400, "Create a plan before improving it.");
    const belongs = db.query("SELECT 1 FROM runs r JOIN plan_versions v ON v.id = r.plan_version_id WHERE r.id = ? AND v.plan_id = ?").get(runId, planId);
    if (!belongs) throw new PlannerError(404, "This recording does not belong to this plan.");
    const run = verificationStore(db).details(runId, owner);
    if (run.state !== "completed" || !run.receipt) throw new PlannerError(409, "Wait for a completed recording before improving this plan.");
    return { current, run };
  }
  return new Elysia()
    .post("/api/plans/:id/improvements", async ({ params, request, body, query, set }) => {
      requireWorkspaceOrigin(request, config);
      set.headers["cache-control"] = "no-store";
      const owner = sessionHash(request);
      const { current, run } = context(params.id, owner, body.revision, body.runId);
      if (!config.modelConfigured && !improver) throw new PlannerError(503, "Meta AI is not configured. You can still edit your plan manually.");
      if (busySessions.has(owner) || busySessions.size >= 2) throw new PlannerError(429, "The planner is busy. Please wait before requesting suggestions.");
      const now = Date.now();
      for (const [key, values] of attempts) if (values.every(at => at <= now - 60_000)) attempts.delete(key);
      const recent = (attempts.get(owner) ?? []).filter(at => at > now - 60_000);
      if (recent.length >= 6) throw new PlannerError(429, "Please wait a minute before requesting more suggestions.");
      attempts.set(owner, [...recent, now]);
      busySessions.add(owner);
      const complete = async (signal: AbortSignal, callbacks: ImprovementCallbacks = {}) => {
        const started = performance.now();
        let outcome = "failed";
        try {
          const generate = improver ?? ((plan, previousRun, feedback, signal, options) => improvePlan(createMetaClient(config), plan, previousRun, feedback, signal, options));
          const proposal = improvementProposalSchema.parse(await generate(current.plan!, run, body, signal, callbacks));
          signal.throwIfAborted();
          context(params.id, owner, body.revision, body.runId);
          outcome = "completed";
          return { revision: current.revision, proposal };
        } catch (error) {
          if (error instanceof PlannerError) throw error;
          if (error instanceof OpenAI.APIError) console.warn("Meta plan improvement request failed", { status: error.status, requestId: error.requestID });
          throw new PlannerError(502, "AI suggestions could not be generated. Your plan is unchanged. Please try again.");
        } finally {
          busySessions.delete(owner);
          console.info("Meta plan improvement request", { model: MODELS.muse, promptVersion: IMPROVEMENT_PROMPT_VERSION, outcome, durationMs: Math.round(performance.now() - started) });
        }
      };
      if (query.stream === "true") {
        set.headers["x-accel-buffering"] = "no";
        return improvementEvents(complete, request.signal);
      }
      return complete(request.signal);
    }, { params: paramsSchema, body: improvementRequestSchema, query: t.Object({ stream: t.Optional(t.Literal("true")) }) })
    .post("/api/plans/:id/improvements/apply", ({ params, request, body, set }) => {
      requireWorkspaceOrigin(request, config);
      set.headers["cache-control"] = "no-store";
      const owner = sessionHash(request);
      const { current, run } = context(params.id, owner, body.revision, body.runId);
      if (busySessions.has(owner)) throw new PlannerError(409, "Wait for the current plan change before saving suggestions.");
      const proposal = body.proposal;
      if (!proposal.plan || hashContract(proposal.plan) === current.contractHash) throw new PlannerError(400, "There are no plan changes to save. Use the filming advice for your next recording.");
      return plans.saveReply(params.id, owner, body.revision,
        `Improve plan for future videos. Source recording: ${run.id} (plan v${run.planVersion}). Issue: ${body.issue}.\nUser feedback: ${body.feedback}`,
        { plan: proposal.plan, reply: [proposal.explanation,
          ...proposal.scopeChanges.map(change => `Scope change: ${change}`),
          ...scopeReviewWarnings(current.plan!, proposal.plan).map(change => `Reviewed evidence change: ${change}`),
          ...proposal.filmingAdvice.map(advice => `Filming advice: ${advice}`),
          "Saved as a draft after review. Review and approve before future verification."].join("\n").slice(0, 4000) });
    }, { params: paramsSchema, body: applyImprovementSchema });
}

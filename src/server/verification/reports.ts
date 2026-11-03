import type { Database } from "bun:sqlite";
import { needsManualReview } from "../../shared/manual-review";
import { isActiveRun } from "../../shared/receipt";
import { reportSchema, type OutcomeCounts, type Report, type ReportFilters, type ReportMetrics } from "../../shared/reports";
import { plannerStore, PlannerError } from "../planner/store";
import { verificationStore } from "./store";

const counts = (): OutcomeCounts => ({ observed: 0, not_observed: 0, uncertain: 0 });
const metrics = (): ReportMetrics => ({ videos: 0, completed: 0, failed: 0, active: 0, analyzedVideos: 0, checks: 0, missingChecks: 0, automatedOnly: 0, reviewRequired: 0, pending: 0, followUp: 0, humanReviewed: 0, reviewEvents: 0, amendments: 0, resolvedUncertainty: 0, changedDecisive: 0 });
function median(values: number[]) {
  if (!values.length) return null;
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle]! : (values[middle - 1]! + values[middle]!) / 2;
}
function validDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function createReport(db: Database, owner: string | null, filters: ReportFilters = {}, now = new Date()): Report {
  if ((filters.from && !validDay(filters.from)) || (filters.to && !validDay(filters.to)) || (filters.from && filters.to && filters.from > filters.to)) throw new PlannerError(400, "Choose a valid, ordered date range.");
  if (filters.planId && !owner) throw new PlannerError(404, "This plan could not be found in your workspace.");
  if (filters.planId && owner) plannerStore(db).read(filters.planId, owner);
  const availablePlans = owner ? db.query<{ id: string; title: string }, [string]>(`SELECT p.id, p.title FROM plans p JOIN planner_owners o ON o.plan_id = p.id WHERE o.session_hash = ? AND p.deleted_at IS NULL ORDER BY p.title, p.id`).all(owner) : [];
  const toExclusive = filters.to ? new Date(new Date(`${filters.to}T00:00:00Z`).getTime() + 86_400_000).toISOString() : null;
  const rows = owner ? db.query<{ id: string; plan_id: string }, [string, string | null, string | null, string | null, string | null, string | null, string | null]>(`SELECT r.id, v.plan_id FROM runs r
    JOIN plan_versions v ON v.id = r.plan_version_id JOIN planner_owners o ON o.plan_id = v.plan_id JOIN plans p ON p.id = v.plan_id
    WHERE o.session_hash = ? AND p.deleted_at IS NULL AND (? IS NULL OR v.plan_id = ?)
      AND (? IS NULL OR r.created_at >= ?) AND (? IS NULL OR r.created_at < ?)
    ORDER BY r.created_at DESC, r.id DESC`).all(owner, filters.planId ?? null, filters.planId ?? null,
    filters.from ? `${filters.from}T00:00:00.000Z` : null, filters.from ? `${filters.from}T00:00:00.000Z` : null, toExclusive, toExclusive) : [];
  const result: Report = { generatedAt: now.toISOString(), from: filters.from ?? null, to: filters.to ?? null,
    plans: availablePlans, totals: metrics(), automated: counts(), current: counts(), manual: counts(),
    processing: { medianMs: null, samples: 0 }, reviewDelay: { medianMs: null, samples: 0 }, days: [], byPlan: [], byCheck: [], records: [] };
  const plans = new Map<string, Report["byPlan"][number]>();
  const checks = new Map<string, Report["byCheck"][number]>();
  const days = new Map<string, Report["days"][number]>();
  const processing: number[] = [], reviewDelays: number[] = [];
  const store = verificationStore(db);
  for (const row of rows) {
    const run = store.details(row.id, owner!);
    let plan = plans.get(row.plan_id);
    if (!plan) {
      plan = { planId: row.plan_id, title: availablePlans.find(item => item.id === row.plan_id)!.title, versions: [], metrics: metrics() };
      plans.set(row.plan_id, plan);
    }
    if (!plan.versions.includes(run.planVersion)) plan.versions.push(run.planVersion);
    const groups = [result.totals, plan.metrics];
    const add = (key: keyof ReportMetrics, amount = 1) => { for (const group of groups) group[key] += amount; };
    add("videos");
    if (run.state === "completed") add("completed");
    else if (run.state === "failed") add("failed");
    else if (isActiveRun(run.state)) add("active");
    const dayKey = run.createdAt.slice(0, 10);
    const day = days.get(dayKey) ?? { date: dayKey, videos: 0, ...counts() };
    days.set(dayKey, day); day.videos++;
    const record: Report["records"][number] = { runId: run.id, planId: row.plan_id, planTitle: run.approvedPlan.title,
      planVersion: run.planVersion, approvedVersionId: run.approvedVersionId, createdAt: run.createdAt, state: run.state,
      taskReference: run.taskReference, error: run.error, durationMs: run.durationMs, processingMs: run.timings.total ?? null,
      missingChecks: 0, warnings: run.warnings.length, checks: [] };
    result.records.push(record);
    if (run.state !== "completed") continue;
    const findings = run.receipt?.findings ?? [];
    record.missingChecks = run.approvedPlan.steps.filter(step => !findings.some(finding => finding.stepId === step.id)).length;
    add("missingChecks", record.missingChecks);
    if (!run.receipt) continue;
    add("analyzedVideos");
    if (typeof run.timings.total === "number" && Number.isFinite(run.timings.total) && run.timings.total >= 0) processing.push(run.timings.total);
    const validReviews = run.manualReviews.filter(review => findings.some(finding => finding.stepId === review.stepId));
    add("reviewEvents", validReviews.length);
    const firstReview = validReviews[0];
    if (firstReview && run.completedAt) {
      const delay = Date.parse(firstReview.reviewedAt) - Date.parse(run.completedAt);
      if (Number.isFinite(delay) && delay >= 0) reviewDelays.push(delay);
    }
    for (const finding of findings) {
      const step = run.approvedPlan.steps.find(item => item.id === finding.stepId);
      if (!step) continue;
      const history = validReviews.filter(review => review.stepId === finding.stepId);
      const latestReview = history.at(-1) ?? null;
      const required = needsManualReview(finding);
      const currentStatus = latestReview?.decision ?? (required && finding.status === "observed" ? "uncertain" : finding.status);
      add("checks"); result.automated[finding.status]++; day[finding.status]++; result.current[currentStatus]++;
      if (required) add("reviewRequired");
      if (required && !latestReview) add("pending");
      if (latestReview?.decision === "uncertain") add("followUp");
      if (latestReview) {
        add("humanReviewed"); result.manual[latestReview.decision]++;
        add("amendments", Math.max(0, history.length - 1));
        if (finding.status === "uncertain" && latestReview.decision !== "uncertain") add("resolvedUncertainty");
        if (finding.status !== "uncertain" && latestReview.decision !== "uncertain" && finding.status !== latestReview.decision) add("changedDecisive");
      } else if (!required) add("automatedOnly");
      record.checks.push({ stepId: step.id, label: step.label, automatedStatus: finding.status, currentStatus, reviewRequired: required,
        startMs: finding.startMs, endMs: finding.endMs, latestReview });
      const checkKey = `${run.approvedVersionId}:${step.id}`;
      const check = checks.get(checkKey) ?? { planId: row.plan_id, approvedVersionId: run.approvedVersionId, planVersion: run.planVersion, planTitle: run.approvedPlan.title, stepId: step.id, label: step.label, checks: 0, reviewRequired: 0, pending: 0, followUp: 0, humanReviewed: 0, ...counts() };
      check.checks++; check[finding.status]++;
      if (required) check.reviewRequired++;
      if (required && !latestReview) check.pending++;
      if (latestReview?.decision === "uncertain") check.followUp++;
      if (latestReview) check.humanReviewed++;
      checks.set(checkKey, check);
    }
  }
  result.byPlan = [...plans.values()].map(plan => ({ ...plan, versions: plan.versions.sort((a, b) => a - b) })).sort((a, b) => b.metrics.pending + b.metrics.followUp - a.metrics.pending - a.metrics.followUp || a.title.localeCompare(b.title));
  result.byCheck = [...checks.values()].sort((a, b) => b.pending + b.followUp - a.pending - a.followUp || b.reviewRequired / b.checks - a.reviewRequired / a.checks || a.label.localeCompare(b.label));
  result.days = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  result.processing = { medianMs: median(processing), samples: processing.length };
  result.reviewDelay = { medianMs: median(reviewDelays), samples: reviewDelays.length };
  return reportSchema.parse(result);
}

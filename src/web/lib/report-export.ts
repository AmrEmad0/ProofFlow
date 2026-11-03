import type { Report } from "../../shared/reports";

export function reportCsv(report: Report) {
  const rows: (string | number | null)[][] = [["Plan", "Approved version ID", "Version", "Run ID", "Recording date UTC", "Run state", "Check", "Automated finding", "Current finding", "Review required", "Human decision", "Human reviewed at UTC", "Human evidence ms", "Automated evidence start ms", "Automated evidence end ms", "Review note", "Processing ms", "Video duration ms", "Missing checks", "Run error"]];
  for (const run of report.records) {
    const base = [run.planTitle, run.approvedVersionId, run.planVersion, run.runId, run.createdAt, run.state];
    if (!run.checks.length) rows.push([...base, "", "", "", "", "", "", "", "", "", "", run.processingMs, run.durationMs, run.missingChecks, run.error]);
    for (const check of run.checks) rows.push([...base, check.label, check.automatedStatus, check.currentStatus, check.reviewRequired ? "yes" : "no", check.latestReview?.decision ?? "", check.latestReview?.reviewedAt ?? "", check.latestReview?.timestampMs ?? null, check.startMs, check.endMs, check.latestReview?.note ?? "", run.processingMs, run.durationMs, run.missingChecks, run.error]);
  }
  return rows.map(row => row.map(value => {
    let text = value === null ? "" : String(value);
    // Keep exported text from becoming spreadsheet formulas.
    if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  }).join(",")).join("\r\n");
}

export function downloadReportCsv(report: Report) {
  const url = URL.createObjectURL(new Blob(["\uFEFF", reportCsv(report)], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  try {
    anchor.href = url; anchor.download = `proofflow-report-${report.generatedAt.slice(0, 10)}.csv`;
    document.body.append(anchor); anchor.click();
  } finally { anchor.remove(); URL.revokeObjectURL(url); }
}

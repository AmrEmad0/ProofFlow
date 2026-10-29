import type { Finding } from "../../shared/receipt";

export function evidenceRelationships(findings: Finding[]) {
  const relationships = new Map<string, NonNullable<Finding["relationships"]>[number]>();
  for (const finding of findings) {
    for (const relationship of finding.relationships ?? []) {
      const previous = relationships.get(relationship.id);
      relationships.set(relationship.id, previous && previous.status !== relationship.status
        ? { ...relationship, status: "uncertain", description: `Relationship reports disagree; review the connected checks. ${previous.description} ${relationship.description}` } : relationship);
    }
  }
  return [...relationships.values()];
}

export function evidenceWindow(finding: Finding, durationMs: number | null) {
  if (!durationMs || finding.startMs === null || finding.endMs === null) return null;
  const start = Math.max(0, Math.min(durationMs, finding.startMs));
  const end = Math.max(start, Math.min(durationMs, finding.endMs));
  return { left: start / durationMs * 100, width: (end - start) / durationMs * 100 };
}

export function formatTime(ms: number) { return `${(ms / 1000).toFixed(1)}s`; }

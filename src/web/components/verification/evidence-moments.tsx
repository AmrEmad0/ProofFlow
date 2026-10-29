import { Play } from "lucide-react";
import { evidenceWindow, formatTime } from "@/lib/evidence-presentation";
import type { Finding } from "../../../shared/receipt";

export function EvidenceMoments({ finding, durationMs, hasMedia, onInspect, conditionLabel }: {
  finding: Finding; durationMs: number | null; hasMedia: boolean;
  onInspect: (id: string, startMs: number) => void;
  conditionLabel?: string;
}) {
  const window = evidenceWindow(finding, durationMs);
  const moments = [...finding.moments ?? []].sort((a, b) => a.timestampMs - b.timestampMs);
  if (!window && !moments.length) return null;
  return <div className="evidence-moments" data-status={finding.status}>
    {window && <span className="sr-only">Evidence window within the recording</span>}
    {window && <div className="evidence-window-rail" aria-hidden="true"><span style={{ left: `${window.left}%`, width: `${window.width}%` }} /></div>}
    {moments.length > 0 && <div className="evidence-moment-list" aria-label="Evidence moments" role="group">{moments.map(moment => <button key={moment.phase} type="button" disabled={!hasMedia} title={moment.description} aria-label={`Inspect ${conditionLabel ?? moment.phase} evidence: ${moment.description}`} onClick={() => onInspect(finding.stepId, moment.timestampMs)}>
      <span className="evidence-moment-phase"><span aria-hidden="true" />{conditionLabel ?? moment.phase}</span><span className="evidence-moment-time"><Play className="size-3" aria-hidden="true" />{formatTime(moment.timestampMs)}</span>
    </button>)}</div>}
  </div>;
}

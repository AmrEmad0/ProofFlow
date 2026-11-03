import type { OutcomeCounts, Report } from "../../../shared/reports";
import type { FindingStatus } from "../../../shared/receipt";

export const outcomeLabels: Record<FindingStatus, string> = { observed: "Observed", not_observed: "Not observed", uncertain: "Uncertain" };
const styles = {
  observed: { stroke: "#047857", dot: "bg-emerald-700" },
  not_observed: { stroke: "#64748b", dot: "bg-slate-500" },
  uncertain: { stroke: "#b45309", dot: "bg-amber-700" },
};
export const outcomes = ["observed", "not_observed", "uncertain"] as const;
export function percent(value: number, total: number) { return total ? `${Math.round(value / total * 100)}%` : "—"; }

export function OutcomeChart({ counts, title, description, onFilter }: { counts: OutcomeCounts; title: string; description: string; onFilter?: (status: FindingStatus) => void }) {
  const total = outcomes.reduce((sum, status) => sum + counts[status], 0);
  let offset = 0;
  return <section className="rounded-xl border bg-card p-5" aria-label={title}><h2 className="text-sm font-semibold">{title}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p><div className="mt-5 flex flex-wrap items-center gap-5">
    <div className="relative size-36 shrink-0"><svg role="img" aria-label={total ? outcomes.map(status => `${outcomeLabels[status]}: ${counts[status]}`).join(", ") : "No findings in this range"} viewBox="0 0 120 120" className="size-full -rotate-90"><circle cx="60" cy="60" r="48" fill="none" stroke="currentColor" className="text-muted" strokeWidth="12" />{total > 0 && outcomes.map(status => {
      const length = counts[status] / total * 301.5929;
      const position = offset; offset += length;
      return <circle key={status} cx="60" cy="60" r="48" fill="none" stroke={styles[status].stroke} strokeWidth="12" strokeDasharray={`${length} ${301.5929 - length}`} strokeDashoffset={-position}><title>{outcomeLabels[status]}: {counts[status]} ({percent(counts[status], total)})</title></circle>;
    })}</svg><div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><strong className="text-2xl tabular-nums">{total.toLocaleString()}</strong><span className="text-[11px] text-muted-foreground">checks</span></div></div>
    <div className="min-w-40 flex-1 space-y-1">{outcomes.map(status => { const content = <><span className={`size-2 shrink-0 rounded-full ${styles[status].dot}`} /><span className="flex-1 text-left">{outcomeLabels[status]}</span><strong className="tabular-nums">{counts[status].toLocaleString()}</strong><span className="w-9 text-right text-[11px] tabular-nums text-muted-foreground">{percent(counts[status], total)}</span></>;
      return onFilter ? <button key={status} onClick={() => onFilter(status)} title={`Show ${outcomeLabels[status].toLowerCase()} checks in the evidence ledger`} className="flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary">{content}</button> : <div key={status} className="flex min-h-10 items-center gap-2 px-2 text-xs">{content}</div>;
    })}</div>
  </div></section>;
}

export function FindingsTrend({ days }: { days: Report["days"] }) {
  const width = Math.max(560, days.length * 38);
  const height = 210;
  const max = Math.max(1, ...days.map(day => day.observed + day.not_observed + day.uncertain));
  const barSpace = (width - 60) / Math.max(1, days.length);
  return <section className="min-w-0 rounded-xl border bg-card p-5" aria-label="Automated findings over time"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-sm font-semibold">Automated findings over time</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">Check counts by recording date, in UTC. Only days with recordings are shown.</p></div><div className="flex flex-wrap gap-3">{outcomes.map(status => <span key={status} className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><span className={`size-2 rounded-full ${styles[status].dot}`} />{outcomeLabels[status]}</span>)}</div></div>
    {days.length ? <div className="mt-4 overflow-x-auto"><svg role="img" aria-label="Stacked bars of observed, not observed, and uncertain findings by recording date; exact values are available in the table below." viewBox={`0 0 ${width} ${height}`} style={{ minWidth: days.length > 14 ? width : undefined }} className="h-56 w-full text-muted-foreground">
      {[...new Set([0, Math.ceil(max / 2), max])].map(tick => <g key={tick}><line x1="40" x2={width - 10} y1={175 - tick / max * 145} y2={175 - tick / max * 145} stroke="currentColor" strokeOpacity="0.15" /><text x="32" y={179 - tick / max * 145} fill="currentColor" fontSize="10" textAnchor="end">{tick}</text></g>)}
      {days.map((day, index) => { let y = 175; const barWidth = Math.min(48, Math.max(8, barSpace - 12)); const x = 40 + index * barSpace + (barSpace - barWidth) / 2; return <g key={day.date}>{outcomes.map(status => {
        const barHeight = day[status] / max * 145; y -= barHeight;
        return <rect key={status} x={x} y={y} width={barWidth} height={barHeight} rx="2" fill={styles[status].stroke}><title>{day.date} UTC · {outcomeLabels[status]}: {day[status]} · {day.videos} videos</title></rect>;
      })}{(index % Math.max(1, Math.ceil(days.length / 10)) === 0 || index === days.length - 1) && <text x={x + barWidth / 2} y="197" fill="currentColor" fontSize="10" textAnchor="middle">{day.date.slice(5)}</text>}</g>; })}
    </svg></div> : <div className="flex h-56 items-center justify-center text-sm text-muted-foreground">Your first analyzed recordings will appear here.</div>}
    {days.length > 0 && <details><summary className="w-fit cursor-pointer py-2 text-xs text-muted-foreground">View chart data</summary><div className="overflow-x-auto"><table className="w-full text-left text-xs"><caption className="sr-only">Automated findings by UTC recording date</caption><thead><tr>{["Date (UTC)", "Videos", "Observed", "Not observed", "Uncertain"].map(label => <th key={label} scope="col" className="p-2 font-medium">{label}</th>)}</tr></thead><tbody>{days.map(day => <tr key={day.date} className="border-t"><th scope="row" className="p-2 font-normal">{day.date}</th><td className="p-2">{day.videos}</td>{outcomes.map(status => <td key={status} className="p-2">{day[status]}</td>)}</tr>)}</tbody></table></div></details>}
  </section>;
}

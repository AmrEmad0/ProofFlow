import { useId, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, CircleHelp, Clock3, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/eden";
import { apiError } from "@/lib/queries";
import { formatTime } from "@/lib/evidence-presentation";
import type { ManualReview } from "../../../shared/manual-review";
import type { FindingStatus } from "../../../shared/receipt";

const choices = [
  { value: "observed", label: "Yes, visible", Icon: Check },
  { value: "not_observed", label: "No, not visible", Icon: Minus },
  { value: "uncertain", label: "Can’t tell", Icon: CircleHelp },
] as const;

export function ManualReviewForm({ runId, stepId, latest, currentTimeMs, onInspect, onSaved }: {
  runId: string; stepId: string; latest?: ManualReview; currentTimeMs: number | null;
  onInspect: (stepId: string, ms: number) => void; onSaved?: () => void;
}) {
  const id = useId();
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [decision, setDecision] = useState<FindingStatus | null>(null);
  const [timestampMs, setTimestampMs] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const save = useMutation({
    mutationFn: async () => {
      if (!decision) throw new Error("Choose what the footage shows.");
      const result = await api.api.runs({ id: runId }).reviews.post({ stepId, decision, timestampMs, note, expectedRevision: latest?.id ?? 0 });
      if (result.error) throw apiError(result.error.value, "Your review could not be saved.");
      return result.data;
    },
    onSuccess: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: ["run", runId] }), client.invalidateQueries({ queryKey: ["reviews"] })]);
      setEditing(false); setDecision(null); setTimestampMs(null); setNote("");
      onSaved?.();
    },
  });
  if (latest && !editing) return <div className="mt-3 rounded-lg border bg-muted/30 p-3 text-xs leading-5">
    <p className="font-semibold">Human review · {choices.find(choice => choice.value === latest.decision)?.label}</p>
    <p className="text-muted-foreground">{new Date(latest.reviewedAt).toLocaleString()}</p>
    {latest.timestampMs !== null && <button type="button" className="min-h-9 text-primary underline" onClick={() => onInspect(stepId, latest.timestampMs!)}>View marked evidence · {formatTime(latest.timestampMs)}</button>}
    {latest.note && <p className="break-words text-muted-foreground">{latest.note}</p>}
    {latest.decision === "uncertain" && <p className="text-muted-foreground">Still unresolved. Clearer footage may be needed.</p>}
    <Button variant="ghost" size="sm" className="mt-1" onClick={() => { setDecision(latest.decision); setTimestampMs(latest.timestampMs); setNote(latest.note); setEditing(true); save.reset(); }}>Change decision</Button>
  </div>;
  return <form className="mt-3 space-y-3 rounded-lg border border-primary/20 bg-primary/[0.03] p-3" onSubmit={event => { event.preventDefault(); save.mutate(); }}>
    <fieldset disabled={save.isPending} className="space-y-3">
      <legend className="text-xs font-semibold">Does the footage show this check?</legend>
      <div className="grid gap-1.5">{choices.map(({ value, label, Icon }) => <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-xs ${decision === value ? "border-primary bg-primary/10" : "bg-card hover:bg-muted/50"}`}><input type="radio" name={`${id}-decision`} checked={decision === value} onChange={() => setDecision(value)} className="accent-primary" /><Icon className="size-3.5" aria-hidden="true" />{label}</label>)}</div>
      {decision === "observed" && <div className="space-y-1"><Button type="button" variant="outline" size="sm" disabled={currentTimeMs === null} onClick={() => setTimestampMs(currentTimeMs)}><Clock3 />{timestampMs === null ? "Mark current video moment" : `Marked ${formatTime(timestampMs)} · Update`}</Button><p className="text-[11px] leading-5 text-muted-foreground">Play or seek the video, then mark the moment showing the action.</p></div>}
      <label className="block text-xs" htmlFor={`${id}-note`}>Review note <span className="text-muted-foreground">(optional)</span></label>
      <textarea id={`${id}-note`} value={note} onChange={event => setNote(event.target.value)} maxLength={1000} rows={2} className="w-full resize-y rounded-md border bg-background px-2 py-2 text-xs" placeholder="What can you see?" />
      <p className="text-[11px] leading-5 text-muted-foreground">“No” means not visible in this footage. Human decisions are saved separately from automated findings.</p>
      {save.error && <p role="alert" className="text-xs text-destructive">{save.error.message}</p>}
      <div className="flex flex-wrap gap-2"><Button type="submit" size="sm" disabled={!decision || (decision === "observed" && timestampMs === null)}>{save.isPending ? "Saving…" : "Save review"}</Button>{editing && <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>}</div>
    </fieldset>
  </form>;
}

import { useEffect, useId, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/eden";
import { apiError } from "@/lib/queries";
import { downloadJson } from "@/lib/feedback";
import { outgoingOverviewSchema, outgoingPayload, type OutgoingPayload } from "../../../shared/outgoing";
import type { RunDetails } from "../../../shared/verification";

export function OutgoingApi({ planId, run, readOnly }: { planId: string; run?: RunDetails; readOnly: boolean }) {
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [endpoint, setEndpoint] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["outgoing", planId, run?.id], queryFn: async () => {
    const result = await api.api.plans({ id: planId }).outgoing.get({ query: run ? { runId: run.id } : {} });
    if (result.error) throw apiError(result.error.value, "Outgoing settings could not be loaded.");
    return outgoingOverviewSchema.parse(result.data);
  }, enabled: open, refetchInterval: open ? 5000 : false, retry: false });
  useEffect(() => { if (query.data) setEndpoint(query.data.endpoint ?? ""); }, [planId, query.data?.endpoint]);
  const save = useMutation({ mutationFn: async (value: string | null) => {
    const result = await api.api.plans({ id: planId }).outgoing.post({ endpoint: value });
    if (result.error) throw apiError(result.error.value, "Outgoing settings could not be saved.");
    return outgoingOverviewSchema.parse(result.data);
  }, onSuccess: async () => { setMessage("Saved. Applies to videos added from now on."); await query.refetch(); }, retry: false });
  let payload: OutgoingPayload | null = null;
  let payloadError: string | null = null;
  if (run?.state === "completed" && run.receipt) {
    try { payload = outgoingPayload(run); } catch { payloadError = "This archived result cannot be converted to an outgoing report."; }
  }
  const delivery = query.data?.delivery;
  return <Dialog open={open} onOpenChange={setOpen}>
    <DialogTrigger render={<Button variant="ghost" size="sm" className="h-9 gap-1.5 px-0 text-xs text-muted-foreground hover:bg-transparent hover:text-foreground" />}><Webhook className="size-3.5" aria-hidden="true" />Send results</DialogTrigger>
    <DialogContent className="max-h-[85dvh] overflow-y-auto p-5 sm:max-w-lg">
      <DialogHeader><DialogTitle>Send results to your system</DialogTitle><DialogDescription>Automatically POST task results after each new video is checked.</DialogDescription></DialogHeader>
      <div className="min-w-0 space-y-4">
      {readOnly ? <p className="text-xs text-muted-foreground">Preview the sample report below. Copy this demo plan to configure your own destination.</p> : <form className="space-y-2" onSubmit={event => { event.preventDefault(); setMessage(null); save.mutate(endpoint.trim() || null); }}>
        <label htmlFor={inputId} className="text-xs font-medium">Destination URL</label>
        <div className="flex flex-col gap-2 sm:flex-row"><Input id={inputId} type="url" placeholder="https://your-system.example/api/video-results" value={endpoint} maxLength={2048} onChange={event => { setEndpoint(event.target.value); setMessage(null); }} disabled={save.isPending || !query.data} /><Button type="submit" variant="outline" disabled={save.isPending || !query.data}>{save.isPending ? "Saving…" : "Save destination"}</Button></div>
        <p className="text-xs leading-5 text-muted-foreground">Use a public HTTPS URL. Applies to new videos; clear to disable.</p>
      </form>}
      {(query.error || save.error) && <p role="alert" className="text-xs text-destructive">{save.error?.message ?? query.error?.message}</p>}
      {message && <p role="status" className="text-xs">{message}</p>}
      {delivery && <p role="status" className="text-xs">Delivery: {delivery.state} · {delivery.attempts}/3 attempts{delivery.httpStatus ? ` · HTTP ${delivery.httpStatus}` : ""}{delivery.error ? ` · ${delivery.error}` : ""}</p>}
      {payload ? <div className="min-w-0 space-y-2 border-t pt-4"><div className="flex items-center justify-between gap-2"><span className="text-xs font-medium">POST body · selected video</span><Button size="sm" variant="ghost" onClick={() => downloadJson(payload, `proofflow-api-${run!.id}.json`, "Evidence")}>Download JSON</Button></div><pre className="max-h-64 overflow-auto rounded-lg bg-muted/60 p-3 text-[11px] leading-5">{JSON.stringify(payload, null, 2)}</pre></div> : <p className="text-xs text-muted-foreground">{payloadError ?? "Results preview appears after the selected video is checked."}</p>}
      </div>
    </DialogContent>
  </Dialog>;
}

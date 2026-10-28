import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, Link2, LoaderCircle, MousePointer2, RotateCw, ScanBarcode, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/eden";
import { apiError, planRunsQuery, planTriggersQuery } from "@/lib/queries";
import { withFeedback } from "@/lib/feedback";
import type { SavedPlan } from "../../../shared/planner";
import { DEMO_FEED_ID, defaultTriggerSettings, recordingSourcesSchema, triggerConfigurationSchema, type TaskSession, type TriggerEvent, type TriggerSettings } from "../../../shared/triggers";

type Action = { type: "feed"; running: boolean } | { type: "settings"; settings: Partial<TriggerSettings> }
  | { type: "event"; source: "manual" | "scanner"; event: TriggerEvent }
  | { type: "regenerate"; action: "start" | "finish" };
const choices = [
  { value: "manual", label: "Manual", icon: MousePointer2 },
  { value: "scanner", label: "Order / barcode", icon: ScanBarcode },
  { value: "api", label: "API link", icon: Link2 },
] as const;
const finishOptions = [
  { value: "manual", label: "Manual" },
  { value: "api", label: "API link" },
] satisfies { value: TriggerSettings["finish"]; label: string }[];
const field = "h-10 w-full min-w-0 rounded-lg border bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

export function PlanTriggers({ saved, onEnsurePlan, onAttach, setup = false, disabled = false }: {
  setup?: boolean; saved: SavedPlan | null; onEnsurePlan: () => Promise<SavedPlan>; onAttach: (task: TaskSession) => void; disabled?: boolean;
}) {
  const finishId = useId();
  const videoSourceId = useId();
  const [editing, setEditing] = useState(false);
  const configuring = setup || editing;
  const client = useQueryClient();
  const query = useQuery(planTriggersQuery(saved?.id ?? null));
  const sources = useQuery({ queryKey: ["recording-sources"], queryFn: async () => {
    const response = await api.api["recording-sources"].get();
    if (response.error) throw apiError(response.error.value, "Recording sources could not be loaded.");
    return recordingSourcesSchema.parse(response.data);
  } });
  useEffect(() => {
    if (saved && query.data?.sessions.some(task => task.runId)) void client.invalidateQueries({ queryKey: planRunsQuery(saved.id).queryKey });
  }, [saved?.id, query.data?.sessions.map(task => task.runId).join(",")]);
  const [reference, setReference] = useState("");
  const retryEvent = useRef<{ signature: string; eventId: string } | null>(null);
  const configured = query.data?.configuration;
  const settings: TriggerSettings = configured?.settings ?? defaultTriggerSettings;
  const active = query.data?.sessions.find(task => task.state === "active");
  const videoSourceOptions = [
    { value: "upload", label: "Attach a video" },
    ...(sources.data ?? []).map(source => ({ value: `${source.kind}:${source.id}`, label: `${source.kind === "demo" ? "Demo" : "Camera"} · ${source.label}` })),
  ];
  const mutation = useMutation({
    scope: { id: "plan-trigger-settings" },
    mutationFn: async (action: Action) => {
      const target = saved ?? await onEnsurePlan();
      const endpoint = api.api.plans({ id: target.id }).triggers;
      if (action.type === "feed") {
        const response = await endpoint.feed.post({ running: action.running });
        if (response.error) throw apiError(response.error.value, "The demo feed could not be updated.");
        await client.invalidateQueries({ queryKey: planRunsQuery(target.id).queryKey });
      } else if (action.type === "settings" || action.type === "regenerate") {
        await client.cancelQueries({ queryKey: planTriggersQuery(target.id).queryKey });
        const latest = client.getQueryData(planTriggersQuery(target.id).queryKey)?.configuration;
        const response = action.type === "settings"
          ? await endpoint.post({ revision: latest?.revision ?? 0, settings: { ...(latest?.settings ?? defaultTriggerSettings), ...action.settings } })
          : await endpoint.links.post({ action: action.action });
        if (response.error) throw apiError(response.error.value, "Your trigger could not be saved.");
        const configuration = triggerConfigurationSchema.parse(response.data);
        client.setQueryData(planTriggersQuery(target.id).queryKey, previous => ({ configuration, sessions: previous?.sessions ?? [] }));
      } else {
        const response = await endpoint.events.post({ source: action.source, ...action.event });
        if (response.error) throw apiError(response.error.value, "The trigger could not be accepted.");
        retryEvent.current = null;
        if (action.event.action === "start") setReference("");
      }
      await client.invalidateQueries({ queryKey: planTriggersQuery(target.id).queryKey });
    },
    retry: false,
  });
  function send(action: TriggerEvent["action"], source: "manual" | "scanner", sessionId?: string) {
    const payload = { action, ...(sessionId ? { sessionId } : {}), ...(action === "start" && reference.trim() ? { reference: reference.trim() } : {}) };
    if (action === "start" && source === "scanner" && !reference.trim()) return;
    const signature = JSON.stringify([source, payload]);
    if (retryEvent.current?.signature !== signature) retryEvent.current = { signature, eventId: crypto.randomUUID() };
    mutation.mutate({ type: "event", source, event: { ...payload, eventId: retryEvent.current.eventId } });
  }
  const busy = disabled || mutation.isPending || Boolean(saved && !query.data);
  const locked = busy || Boolean(active) || Boolean(query.data?.feed?.running);
  const recent = query.data?.sessions.filter(task => task.state !== "active") ?? [];
  return <aside aria-label="Plan triggers" className="min-w-0 rounded-2xl border bg-card/70 p-4 lg:sticky lg:top-6">
    <div className="mb-4 flex items-center gap-2.5"><span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"><Zap className="size-4" aria-hidden="true" /></span><div><h2 className="text-sm font-semibold">Triggers</h2></div>{mutation.isPending && <LoaderCircle className="ml-auto size-3.5 animate-spin text-muted-foreground" aria-label="Saving trigger" />}</div>
    {configuring ? <>
    <p id="start-trigger-label" className="mb-2.5 text-xs font-medium text-muted-foreground">Start</p>
    <div role="radiogroup" aria-labelledby="start-trigger-label" className="grid gap-1">
      {choices.map(({ value, label, icon: Icon }) => <button key={value} type="button" role="radio" aria-checked={settings.start === value} disabled={locked} onClick={() => mutation.mutate({ type: "settings", settings: { start: value } })} className={`flex min-w-0 items-center gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-50 ${settings.start === value ? "border-primary/35 bg-primary/5" : "border-transparent hover:border-border hover:bg-muted/40"}`}>
        <Icon className={`size-4 shrink-0 ${settings.start === value ? "text-primary" : "text-muted-foreground"}`} aria-hidden="true" />
        <span className="min-w-0 flex-1 text-sm font-medium">{label}</span>
        {settings.start === value && <Check className="size-3.5 shrink-0 text-primary" aria-hidden="true" />}
      </button>)}
    </div>
    </> : <div className="space-y-2"><p className="text-sm font-medium">{choices.find(choice => choice.value === settings.start)?.label}</p><p className="text-xs text-muted-foreground">{settings.recording ? `${settings.recording.kind === "demo" ? "Demo replay" : "Camera"} · ${settings.recording.id === DEMO_FEED_ID ? "Folder feed" : settings.recording.id}` : "Attach video after finishing"}</p><Button variant="outline" size="sm" disabled={locked} onClick={() => setEditing(true)}>Edit trigger settings</Button></div>}
    {settings.start === "api" && <TriggerLink action="start" path={configured?.links.start ?? null} disabled={locked} onRegenerate={() => mutation.mutate({ type: "regenerate", action: "start" })} />}
    {!configuring && settings.start === "scanner" && <p className="mt-3 text-xs leading-5 text-muted-foreground">Enter an order or scan a barcode.</p>}
    {configuring && <>
    <div className="mt-5 border-t pt-4">
      <label htmlFor={finishId} className="block text-xs font-medium text-muted-foreground">Finish</label>
      <Select items={settings.recording ? [{ value: "clip", label: "Clip ends" }] : finishOptions} value={settings.finish} disabled={locked || Boolean(settings.recording)} onValueChange={value => {
        if (value) mutation.mutate({ type: "settings", settings: { finish: value } });
      }}>
        <SelectTrigger id={finishId} className="mt-2 w-full min-w-0 rounded-lg bg-background px-3 text-sm text-foreground data-[size=default]:h-10"><SelectValue /></SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {(settings.recording ? [{ value: "clip", label: "Clip ends" }] : finishOptions).map(option => <SelectItem key={option.value} value={option.value} className="py-2 pr-8 text-sm">{option.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
    <div className="mt-4 space-y-2 border-t pt-4">
      <label htmlFor={videoSourceId} className="block text-xs font-medium">Video source</label>
      <Select items={videoSourceOptions} disabled={locked || sources.isPending} value={settings.recording ? `${settings.recording.kind}:${settings.recording.id}` : "upload"} onValueChange={value => {
        if (!value) return;
        const source = sources.data?.find(source => `${source.kind}:${source.id}` === value);
        mutation.mutate({ type: "settings", settings: source ? { recording: { kind: source.kind, id: source.id, seconds: 30 }, finish: "clip" } : { recording: undefined, finish: "manual" } });
      }}>
        <SelectTrigger id={videoSourceId} aria-label="Video source" className="mt-2 w-full min-w-0 rounded-lg bg-background px-3 text-sm data-[size=default]:h-10"><SelectValue /></SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          {videoSourceOptions.map(option => <SelectItem key={option.value} value={option.value} className="py-2 pr-8 text-sm">{option.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {settings.recording && <><label className="block text-xs">Clip length (seconds)<input aria-label="Maximum clip length" type="number" min={1} max={30} className={`${field} mt-2`} disabled={locked} value={settings.recording.seconds} onChange={event => { const seconds = Number(event.target.value); if (Number.isInteger(seconds) && seconds >= 1 && seconds <= 30) mutation.mutate({ type: "settings", settings: { recording: { ...settings.recording!, seconds } } }); }} /></label><p className="text-xs leading-5 text-muted-foreground">{settings.recording.kind === "demo" ? settings.recording.id === DEMO_FEED_ID ? "Each trigger takes the next video. Automatic feed repeats at this interval, looping through the folder." : "Replays this demo clip, then verifies it." : "Records a new clip, then verifies it."}</p></>}
      {sources.error && <p role="alert" className="text-xs text-destructive">{sources.error.message}</p>}
    </div>
    {editing && <Button className="mt-3 w-full" size="sm" disabled={busy} onClick={() => setEditing(false)}>Done editing</Button>}
    </>}
    {settings.finish === "api" && <TriggerLink action="finish" path={configured?.links.finish ?? null} disabled={locked} onRegenerate={() => mutation.mutate({ type: "regenerate", action: "finish" })} />}
    {(!saved || saved.status !== "approved") && <p className="mt-4 text-xs leading-5 text-muted-foreground">Ready after plan approval.</p>}
    {saved?.status === "approved" && !configuring && !active && settings.start !== "api" && <form className="mt-5 space-y-2 border-t pt-4" onSubmit={event => { event.preventDefault(); send("start", settings.start as "manual" | "scanner"); }}>
      <label className="block text-xs font-medium">{settings.start === "scanner" ? "Order reference or barcode" : "Order reference (optional)"}<input className={`${field} mt-2`} value={reference} maxLength={120} required={settings.start === "scanner"} disabled={busy} onChange={event => setReference(event.target.value)} placeholder="ORDER-1042" autoComplete="off" /></label>
      <Button type="submit" disabled={busy} className="h-10 w-full text-sm">{settings.start === "scanner" ? "Start task" : "Start task"}</Button>
    </form>}
    {saved?.status === "approved" && !configuring && settings.recording?.kind === "demo" && settings.recording.id === DEMO_FEED_ID && <div className="mt-4 space-y-2 border-t pt-4">
      <Button className="w-full" variant={query.data?.feed?.running ? "outline" : "default"} disabled={busy} onClick={() => mutation.mutate({ type: "feed", running: !query.data?.feed?.running })}>{query.data?.feed?.running ? "Stop demo feed" : "Start demo feed"}</Button>
      <p role="status" className="text-xs leading-5 text-muted-foreground">{query.data?.feed?.running ? "Feed running. Videos cycle into the verification queue." : "Start automatic feeding, or use the configured trigger for the next video."} Stop cancels waiting demo videos and pauses playback. A verification already in progress may finish.</p>
      <p className="text-xs text-muted-foreground">Waiting: {query.data?.sessions.filter(task => task.captureState && ["queued", "capturing", "captured"].includes(task.captureState)).length ?? 0} · Videos selected: {query.data?.feed?.position ?? 0}</p>
      {query.data?.feed?.error && <p role="alert" className="text-xs text-destructive">{query.data.feed.error}</p>}
    </div>}
    {active && <div className="mt-5 space-y-3 border-t pt-4"><p role="status" className="break-words text-sm font-medium">Active task: {active.reference ?? "In progress"}</p><p className="text-xs leading-5 text-muted-foreground">{active.settings.recording ? `Recording ${active.settings.recording.kind === "demo" ? "demo replay" : "camera clip"} · ${active.captureState === "captured" ? "waiting for verification queue" : active.captureState ?? "queued"}. Verification starts automatically.` : "Task started. Attach its recording after finishing."}</p><div className="flex flex-wrap gap-2">{active.settings.finish === "manual" && <Button size="sm" disabled={busy} onClick={() => send("finish", "manual", active.id)}>Finish task</Button>}<Button size="sm" variant="ghost" disabled={busy} onClick={() => send("cancel", "manual", active.id)}>Cancel task</Button></div></div>}
    {recent.length > 0 && <details className="mt-4 border-t pt-3"><summary className="cursor-pointer py-1 text-xs font-medium text-muted-foreground">Recent tasks · {recent.length}</summary><div className="mt-2 space-y-3">{recent.slice(0, 5).map(task => <div key={task.id} className="min-w-0"><p className="break-words text-xs font-medium">{task.reference ?? "Task"}{task.demoFilename && <span className="mt-1 block font-normal text-muted-foreground">{task.demoFilename}</span>}</p><p className="mt-1 text-[11px] text-muted-foreground">{task.captureError ?? (task.state === "finished" ? task.runId ? "Video attached" : task.captureState === "captured" ? "Waiting for verification" : "Awaiting video" : "Cancelled")}</p>{task.state === "finished" && !task.runId && !task.settings.recording && <Button variant="outline" size="sm" className="mt-2" disabled={busy || !saved?.videoConsentAt} onClick={() => onAttach(task)}>Attach video</Button>}</div>)}</div></details>}
    {(mutation.error || query.error) && <p role="alert" className="mt-3 text-xs leading-5 text-destructive">{mutation.error?.message ?? query.error?.message}<button className="ml-1 underline" onClick={() => { void query.refetch(); }}>Reload</button></p>}
  </aside>;
}

function TriggerLink({ action, path, disabled, onRegenerate }: { action: "start" | "finish"; path: string | null; disabled: boolean; onRegenerate: () => void }) {
  const inputId = useId();
  const url = path ? new URL(path, window.location.origin).href : "";
  return <div className="mt-3 min-w-0">
    <label htmlFor={inputId} className="block text-xs font-medium">{action === "start" ? "Start URL" : "Finish URL"}</label>
    <div className="mt-2 flex min-w-0 items-center rounded-lg border bg-background focus-within:ring-2 focus-within:ring-ring/30">
      <input id={inputId} readOnly value={url} placeholder="Generating your link…" className="h-11 w-0 min-w-0 flex-1 rounded-l-lg bg-transparent px-3 font-mono text-[11px] outline-none" onFocus={event => event.currentTarget.select()} />
      <div className="flex shrink-0 items-center border-l">
        <Button variant="ghost" size="icon" className="size-11 rounded-none text-muted-foreground" disabled={!url} aria-label={`Copy ${action} URL`} title="Copy link" onClick={() => { void withFeedback(navigator.clipboard.writeText(url), { loading: "Copying…", success: "Trigger URL copied", error: "Couldn’t copy URL" }).catch(() => {}); }}><Copy className="size-3.5" /></Button>
        <Button variant="ghost" size="icon" className="size-11 rounded-l-none rounded-r-lg text-muted-foreground" disabled={disabled} aria-label={`Regenerate ${action} URL`} title="Regenerate link" onClick={onRegenerate}><RotateCw className="size-3.5" /></Button>
      </div>
    </div>
  </div>;
}

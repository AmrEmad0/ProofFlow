import { useQuery } from "@tanstack/react-query";
import { LoaderCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { healthQuery, plannerStatusQuery, verificationStatusQuery } from "@/lib/queries";
import { withFeedback } from "@/lib/feedback";
import { LIMITS } from "../../../shared/proof-plan";

export function WorkspaceSettings({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const health = useQuery({ ...healthQuery, enabled: open });
  const planner = useQuery({ ...plannerStatusQuery, enabled: open });
  const video = useQuery({ ...verificationStatusQuery, enabled: open });
  const refreshing = health.isFetching || planner.isFetching || video.isFetching;
  const error = health.error ?? planner.error ?? video.error;

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[85dvh] overflow-y-auto p-6 sm:max-w-lg">
      <DialogTitle className="pr-6 text-lg font-semibold">Workspace settings</DialogTitle>
      <DialogDescription>Server configuration and upload limits.</DialogDescription>
      <section className="rounded-xl border px-4" aria-label="Connection status">
        <StatusRow label="Meta API key" value={planner.data?.configured} positive="Configured" negative="Missing" />
        <StatusRow label="Video verification" value={video.data?.available} positive="Ready" negative="Unavailable" />
        <StatusRow label="FFmpeg" value={health.data?.services.ffmpeg} positive="Ready" negative="Unavailable" />
        <StatusRow label="FFprobe" value={health.data?.services.ffprobe} positive="Ready" negative="Unavailable" />
        <StatusRow label="Database" value={health.data?.services.database} positive="Ready" negative="Unavailable" />
      </section>
      {error && <p role="alert" className="text-sm text-destructive">{error.message}</p>}
      <dl className="space-y-3 text-sm">
        <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">Planning model</dt><dd className="break-all text-right">{planner.data?.model ?? "—"}</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Object tracking</dt><dd>SAM 3.1</dd></div>
        <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Video limits</dt><dd>{LIMITS.durationMs / 1000} sec · {LIMITS.uploadBytes / 1024 / 1024} MB</dd></div>
      </dl>
      <p className="border-t pt-4 text-xs leading-5 text-muted-foreground">Managed in the server’s environment configuration. API keys stay on the server.</p>
      <Button variant="outline" disabled={refreshing} onClick={() => { void withFeedback(Promise.all([health.refetch({ throwOnError: true }), planner.refetch({ throwOnError: true }), video.refetch({ throwOnError: true })]), { loading: "Refreshing status…", success: "Status refreshed", error: "Couldn’t refresh status" }).catch(() => {}); }} className="h-10 gap-2">{refreshing ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}Refresh status</Button>
    </DialogContent>
  </Dialog>;
}

function StatusRow({ label, value, positive, negative }: { label: string; value: boolean | undefined; positive: string; negative: string }) {
  return <div className="flex items-center justify-between gap-3 border-b py-3 text-sm last:border-b-0"><span>{label}</span><span className={`flex items-center gap-1.5 text-xs ${value === undefined ? "text-muted-foreground" : value ? "text-emerald-700" : "text-amber-800"}`}><span className={`size-1.5 rounded-full ${value === undefined ? "bg-muted-foreground" : value ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden="true" />{value === undefined ? "Checking…" : value ? positive : negative}</span></div>;
}

import { LoaderCircle, LockKeyhole, ShieldCheck, Upload, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LIMITS } from "../../../shared/proof-plan";

export function VideoUpload({ file, localUrl, consent, development, uploading, processing, available, retentionHours, version, onChoose, onConsent, onInvalid, onUpload }: {
  file: File | null; localUrl: string | null; consent: boolean; development: boolean;
  uploading: boolean; processing: boolean; available: boolean; retentionHours: number; version: number | null;
  onChoose: (file: File | undefined) => void; onConsent: (consent: boolean) => void;
  onInvalid: (message: string) => void; onUpload: () => void;
}) {
  return <section className="rounded-2xl border bg-card p-5 sm:p-6" aria-label="Upload a new video">
    <div className="mb-5 flex items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-sm font-semibold"><Upload className="size-4 text-primary" aria-hidden="true" />New video</h2><span className="flex items-center gap-1 text-xs text-emerald-700"><LockKeyhole className="size-3" aria-hidden="true" />Plan v{version}</span></div>
    <label className={`flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed bg-muted/20 p-5 text-center focus-within:ring-2 focus-within:ring-primary ${uploading ? "opacity-50" : "cursor-pointer hover:border-primary/50"}`} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!uploading) onChoose(event.dataTransfer.files[0]); }}>
      <input type="file" aria-label="Choose a video recording" accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm" className="sr-only" disabled={uploading} onChange={(event) => { onChoose(event.target.files?.[0]); event.target.value = ""; }} />
      <span className="mb-3 flex size-12 items-center justify-center rounded-xl border bg-background text-primary"><Video className="size-5" aria-hidden="true" /></span><span className="max-w-full break-all text-sm font-medium">{file ? file.name : "Choose a video or drop it here"}</span><span className="mt-2 text-xs text-muted-foreground">{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB · choose another` : `MP4, MOV, WebM · ${LIMITS.durationMs / 1000} sec max · ${LIMITS.uploadBytes / 1024 / 1024} MB max`}</span>
    </label>
    {localUrl && <video src={localUrl} controls playsInline className="mt-4 max-h-64 w-full rounded-lg bg-black" aria-label="Selected recording preview" onLoadedMetadata={(event) => { if (event.currentTarget.duration * 1000 > LIMITS.durationMs) onInvalid("This recording is longer than 20 seconds. Choose a shorter, complete clip."); }} />}
    <label className="mt-5 flex cursor-pointer items-start gap-2.5 text-xs leading-5 text-muted-foreground"><input type="checkbox" checked={development || consent} disabled={development || uploading} onChange={(event) => onConsent(event.target.checked)} className="mt-1 size-3.5 shrink-0 accent-primary" />I have permission to share this recording with Meta for Muse Spark and SAM analysis.</label>
    <p className="mt-2 pl-6 text-[10px] leading-4 text-muted-foreground">Muse uses Contributor mode. Submitted content may be used to improve Meta models. The analysis copy removes audio.</p>
    <Button onClick={onUpload} disabled={!file || !(development || consent) || !available || processing || uploading} className="mt-5 h-11 w-full gap-2 rounded-lg">{uploading ? <><LoaderCircle className="size-4 animate-spin" />Uploading…</> : <><ShieldCheck className="size-4" />Verify video</>}</Button>
    {processing && <p className="mt-3 text-xs leading-5 text-muted-foreground">A video is processing. You can prepare your next recording while it finishes.</p>}
    {!available && <p className="mt-3 text-xs leading-5 text-muted-foreground">Video verification is currently unavailable. Your approved plan is saved.</p>}
    <p className="mt-3 flex items-start gap-1.5 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />Private to this workspace. Expires after {retentionHours} hours.</p>
  </section>;
}

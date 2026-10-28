import { useId, useRef, useState } from "react";
import { Check, LoaderCircle, Upload, Video, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LIMITS } from "../../../shared/proof-plan";

export function VideoUpload({ file, localUrl, uploading, processing, available, retentionHours, version, onChoose, onClear, onInvalid, onUpload }: {
  file: File | null; localUrl: string | null;
  uploading: boolean; processing: boolean; available: boolean; retentionHours: number; version: number | null;
  onChoose: (file: File | undefined) => void;
  onClear: () => void;
  onInvalid: (message: string) => void; onUpload: () => void;
}) {
  const chooser = useRef<HTMLInputElement>(null);
  const descriptionId = useId();
  const [failedPreviewUrl, setFailedPreviewUrl] = useState<string | null>(null);
  const reason = uploading ? "Your video is uploading. Keep this page open until it finishes."
    : processing ? "Another video is being checked. You can prepare this one while it finishes."
    : !available ? "Video checking is currently unavailable. Your approved checks are saved."
    : null;

  return <section className="rounded-2xl border bg-card p-4 sm:p-5" aria-label="Upload a new video">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h2 className="flex items-center gap-2 text-lg font-semibold"><Upload className="size-5 text-primary" aria-hidden="true" />Check a video</h2><span className="flex items-center gap-1.5 text-sm text-emerald-700"><Check className="size-4" aria-hidden="true" />Approved checks · v{version}</span></div>
    <input ref={chooser} type="file" aria-label="Choose a video recording" accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm" className="sr-only" tabIndex={-1} disabled={uploading} onChange={(event) => { onChoose(event.target.files?.[0]); event.target.value = ""; }} />
    <div onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); if (!uploading) onChoose(event.dataTransfer.files[0]); }}>
      {file ? <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/20 p-3">
        <Video className="size-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1 basis-40"><p className="break-all text-base font-medium">{file.name}</p><p className="mt-1 text-sm text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB · selected on this device</p></div>
        <Button variant="outline" disabled={uploading} onClick={() => chooser.current?.click()}>Choose another</Button>
        <Button variant="ghost" size="icon" aria-label="Remove selected video" disabled={uploading} onClick={onClear}><X className="size-4" /></Button>
      </div> : <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-muted/20 px-4 py-6 text-center">
        <Video className="size-7 text-primary" aria-hidden="true" />
        <Button onClick={() => chooser.current?.click()} disabled={uploading}>Choose a video</Button>
        <p className="text-sm leading-6 text-muted-foreground">Or drop it here. MP4, MOV, or WebM · up to {LIMITS.durationMs / 1000} seconds and {LIMITS.uploadBytes / 1024 / 1024} MB.</p>
      </div>}
    </div>
    {file && localUrl && <figure className="mt-4">
      <div className="flex justify-center rounded-xl bg-muted/40 p-2"><video key={localUrl} src={localUrl} controls playsInline preload="metadata" className="block h-auto max-h-72 w-auto max-w-full rounded-lg" aria-label="Selected recording preview" onError={() => setFailedPreviewUrl(localUrl)} onLoadedMetadata={(event) => { if (event.currentTarget.duration * 1000 > LIMITS.durationMs) onInvalid(`This video is longer than ${LIMITS.durationMs / 1000} seconds. Choose a shorter clip that shows the whole task.`); }} /></div>
      {failedPreviewUrl === localUrl && <figcaption className="mt-2 text-sm leading-6 text-muted-foreground">Your browser can’t preview this file. You can choose another or continue to check it.</figcaption>}
    </figure>}
    {file && <div className="mt-4 border-t pt-3">
      <div className="mt-4 flex flex-wrap items-center gap-3"><Button onClick={onUpload} disabled={!available || processing || uploading} aria-describedby={reason ? `${descriptionId}-status` : undefined} className="w-full gap-2 sm:w-auto">{uploading ? <><LoaderCircle className="size-4 animate-spin" />Uploading…</> : <><Upload className="size-4" />Check video</>}</Button>{reason && <p id={`${descriptionId}-status`} role="status" className="min-w-0 flex-1 basis-48 text-sm leading-6 text-muted-foreground">{reason}</p>}</div>
    </div>}
    {!file && reason && <p role="status" className="mt-3 text-sm leading-6 text-muted-foreground">{reason}</p>}
    <p className="mt-3 text-sm leading-6 text-muted-foreground">Videos and evidence saved in this workspace expire after {retentionHours} hours.</p>
  </section>;
}

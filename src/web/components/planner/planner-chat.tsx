import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Package, PencilLine, Workflow, Coffee, PanelTop, Paperclip, X, ImageIcon, Film, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ChatMarkdown } from "./chat-markdown";
import { LIMITS } from "../../../shared/proof-plan";
import type { PlannerPreview, SavedPlan } from "../../../shared/planner";

type Props = {
  saved: SavedPlan | null;
  starter: boolean;
  pending: boolean;
  sending: boolean;
  referenceSending: boolean;
  pendingMessage: string | null;
  partialReply: string;
  planPreview: PlannerPreview | null;
  configured: boolean;
  error: string | null;
  input: string;
  onInputChange: (value: string) => void;
  onSend: (message: string, media?: File) => Promise<void>;
  onApprove: () => Promise<void>;
  onStarter: () => void;
  onManual: () => void;
  onReload: () => void;
};

export function PlannerChat({ saved, starter, pending, sending, referenceSending, pendingMessage, partialReply, planPreview, configured, error, input, onInputChange: setInput, onSend, onApprove, onStarter, onManual, onReload }: Props) {
  const [approvalOpen, setApprovalOpen] = useState(false);
  const [videoConsent, setVideoConsent] = useState(false);
  const [media, setMedia] = useState<File | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [mediaReady, setMediaReady] = useState(false);
  const chooser = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  const isImage = Boolean(media && /\.(png|jpe?g|webp)$/i.test(media.name));
  useEffect(() => {
    if (!media) { setLocalUrl(null); return; }
    const url = URL.createObjectURL(media);
    setLocalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [media]);
  useEffect(() => { setMedia(null); setAttachmentError(null); }, [saved?.id]);
  function choose(file?: File) {
    if (!file) return;
    if (!/\.(png|jpe?g|webp|mp4|mov|webm)$/i.test(file.name)) {
      setAttachmentError("Choose a JPG, PNG, WebP, MP4, MOV, or WebM file.");
      return;
    }
    const image = /\.(png|jpe?g|webp)$/i.test(file.name);
    if (!file.size || file.size > (image ? 10 * 1024 * 1024 : LIMITS.uploadBytes)) {
      setAttachmentError(image ? "Choose a nonempty image up to 10 MB." : "Choose a nonempty video up to 25 MB.");
      return;
    }
    setAttachmentError(null); setMedia(file); setMediaReady(image);
  }
  const history = useRef<HTMLDivElement>(null);
  const followReply = useRef(true);
  const [showLatest, setShowLatest] = useState(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const hasPlan = Boolean(saved?.plan || starter);
  const messages = saved?.messages ?? [];
  const isStarting = !hasPlan && messages.length === 0 && !sending && !partialReply;
  useEffect(() => { followReply.current = true; setShowLatest(false); }, [saved?.id, pendingMessage]);
  useEffect(() => { if (history.current && followReply.current) history.current.scrollTop = history.current.scrollHeight; }, [saved?.id, messages.length, pendingMessage, partialReply, planPreview, error]);

  function scrollToLatest() {
    followReply.current = true;
    setShowLatest(false);
    if (history.current) history.current.scrollTop = history.current.scrollHeight;
  }

  async function send() {
    const message = input.trim() || (media ? "Suggest a Proof Plan for the process in this reference. Help me refine it before approval." : "");
    if (!message || submitting.current || pending || !configured || (media && (!mediaReady || attachmentError))) return;
    submitting.current = true;
    try {
      await onSend(message, media ?? undefined);
      setMedia(null);
      setInput("");
      requestAnimationFrame(() => composer.current?.focus({ preventScroll: true }));
    } catch { /* Keep the error and unsent message available for retry. */ }
    finally { submitting.current = false; }
  }

  return (
    <section className={`chat-panel min-w-0 ${messages.length || sending ? "chat-panel-active" : ""} ${isStarting ? "chat-panel-start" : ""}`} aria-label="Template planning chat">
      <div className="chat-header">
        <span className="chat-avatar"><Workflow className="size-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">Plan assistant</h2></div>
        <span className="chat-header-status"><span className={`size-1.5 rounded-full ${sending ? "bg-primary animate-pulse" : configured ? "bg-emerald-500" : "bg-muted-foreground"}`} />{configured ? "Muse Spark" : "Offline"}</span>
      </div>
      {messages.length === 0 && !sending && !partialReply && <div className="chat-welcome"><h3 className="text-xl font-semibold tracking-tight">{hasPlan ? "What would you like to refine?" : "What should we check?"}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{hasPlan ? "Change a check or ask for filming tips." : "Describe your process. We’ll draft the checks."}</p></div>}
      {(messages.length > 0 || sending || partialReply || planPreview) && <div ref={history} className="chat-history space-y-6 overflow-y-auto p-4 sm:p-5" role="log" aria-label="Planning conversation" aria-live="off" aria-busy={sending} onScroll={(event) => { const element = event.currentTarget; followReply.current = element.scrollHeight - element.scrollTop - element.clientHeight < 64; setShowLatest(!followReply.current); }}>
        {messages.map((message, index) => <div key={`${saved?.id}-${index}`} className={message.role === "user" ? "chat-message-user" : "chat-message-assistant"}>
          {message.role === "assistant" && <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-primary"><Workflow className="size-3" aria-hidden="true" />ProofFlow</p>}
          <MessageContent content={message.content} user={message.role === "user"} />
        </div>)}
        {(sending || partialReply || planPreview) && <>
          <div className="chat-message-user">
            {referenceSending && media && <ReferencePreview key={localUrl} media={media} url={localUrl} isImage={isImage} />}
            {referenceSending && !media && <p className="mb-2 flex items-center gap-2 text-xs font-medium"><Paperclip className="size-3.5" aria-hidden="true" />Reference attached</p>}
            <p className="whitespace-pre-wrap break-words text-sm leading-6">{referenceSending && !input.trim() ? "Help me build a plan from this reference." : pendingMessage}</p>
          </div>
          {partialReply && <div className="pr-2"><p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-primary"><Workflow className="size-3" aria-hidden="true" />ProofFlow</p><div className="chat-reply"><ChatMarkdown content={partialReply} streaming={sending} /></div></div>}
          {sending && planPreview && <div className="rounded-xl border border-primary/20 bg-primary/5 p-4" aria-label="Live plan draft">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Live draft · Not saved yet</p>
            {planPreview.title && <p className="mt-2 break-words text-sm font-medium">{planPreview.title}</p>}
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6">{planPreview.checks.map((label, index) => <li key={index} className="break-words">{label}</li>)}</ol>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">Checks appear as they arrive. Review the complete plan before approving.</p>
          </div>}
          {sending ? <PlannerActivity replying={Boolean(partialReply)} drafting={Boolean(planPreview)} reference={referenceSending} /> : <p className="text-xs text-muted-foreground">This reply wasn’t saved. Your previous checks are unchanged.</p>}
        </>}
      </div>}
      {showLatest && <div className="flex justify-center border-t py-2"><Button variant="outline" className="h-9 rounded-full text-xs" onClick={scrollToLatest}><ArrowDown className="size-3.5" />Latest message</Button></div>}
      <p className="sr-only" role="status">{sending ? "Assistant is responding." : error ? "Message failed. Your draft is preserved." : messages.length ? "Assistant response complete." : ""}</p>
      <div className="chat-composer-area p-4 sm:p-5">
        {saved?.plan && saved.status !== "approved" && <div className="mb-3 rounded-xl border bg-primary/5 p-3">
          <p className="mb-2 text-xs leading-5 text-muted-foreground">Happy with these checks? You can accept the current plan without answering optional questions.</p>
          <Dialog open={approvalOpen} onOpenChange={setApprovalOpen}>
            <DialogTrigger render={<Button variant="outline" disabled={pending || Boolean(saved.plan.unresolvedGoals?.length)} />}>Use this plan</DialogTrigger>
            <DialogContent className="p-6 sm:max-w-md">
              <DialogTitle className="text-lg font-semibold">Use this plan?</DialogTitle>
              <DialogDescription className="text-sm leading-6">Approve version {saved.version} of “{saved.plan.title}” with {saved.plan.steps.length} checks. Your video will be verified against this saved version.</DialogDescription>
              {!saved.videoConsentAt && <label className="flex items-start gap-2 text-sm leading-6"><input type="checkbox" checked={videoConsent} onChange={event => setVideoConsent(event.target.checked)} className="mt-1 size-4 accent-primary" />I have permission to share videos with Meta. Meta may use videos to improve its models.</label>}
              <Button disabled={pending || (!saved.videoConsentAt && !videoConsent)} onClick={async () => { try { await onApprove(); setApprovalOpen(false); } catch { /* The workspace displays approval errors. */ } }}>Approve plan & continue</Button>
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            </DialogContent>
          </Dialog>
          {Boolean(saved.plan.unresolvedGoals?.length) && <p className="mt-2 text-xs leading-5 text-muted-foreground">Resolve or explicitly exclude the unresolved goals in the plan before approval.</p>}
        </div>}

        {error && <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3" role="alert"><p className="text-sm leading-5 text-destructive">{error}</p>{saved && <button onClick={onReload} disabled={pending} className="mt-2 text-xs font-medium underline underline-offset-4">Reload saved draft</button>}</div>}
        {!configured && <p className="mb-4 text-sm leading-6 text-muted-foreground">The assistant is unavailable right now. {hasPlan ? "You can still change your checks directly." : "You can build your plan manually or use an example."}</p>}
        {hasPlan && messages.length === 0 && !input.trim() && <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Suggestions for your assistant">{[
          { label: "Explain this plan", message: "Can you explain what this plan can check?" },
          { label: "Change a check", message: "I’d like to change one of the checks." },
          { label: "Help me film", message: "How should I film these checks?" },
        ].map(({ label, message }) => <Button key={label} variant="outline" className="h-11 px-3 text-xs" disabled={pending || !configured} onClick={() => { setInput(message); composer.current?.focus(); }}>{label}</Button>)}</div>}
        {saved?.referenceMedia && !media && <details className="chat-saved-reference group mb-3 rounded-xl border bg-muted/20 px-3 text-sm">
          <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden"><Paperclip className="size-3.5 shrink-0 text-muted-foreground" /><span className="min-w-0 flex-1 truncate" title={saved.referenceMedia.name}>{saved.referenceMedia.name}</span><span className="text-xs text-muted-foreground">Reference notes</span><ChevronDown className="size-3.5 shrink-0 transition-transform group-open:rotate-180" /></summary>
          <p className="mt-2 whitespace-pre-wrap pb-2 text-xs leading-6 text-muted-foreground">{saved.referenceMedia.summary}</p>
          <p className="pb-3 text-xs text-muted-foreground">Chat uses saved notes. Attach a reference to show new details. This reference has not been verified.</p>
        </details>}
        {attachmentError && <p role="alert" className="mb-3 text-sm text-destructive">{attachmentError}</p>}
        <input ref={chooser} type="file" accept=".jpg,.jpeg,.png,.webp,.mp4,.mov,.webm" aria-label="Choose a reference image or video" className="sr-only" tabIndex={-1} disabled={pending || !configured} onChange={(event) => { choose(event.target.files?.[0]); event.target.value = ""; }} />
        <form data-sending={sending || undefined} onSubmit={(event) => { event.preventDefault(); void send(); }} className="chat-composer @container rounded-2xl border bg-card p-2 transition-shadow focus-within:border-primary/50 focus-within:ring-3 focus-within:ring-primary/5">
          {media && !sending && <div className="reference-attachment">
            <div className="min-w-0 flex-1"><ReferencePreview key={localUrl} media={media} url={localUrl} isImage={isImage} onInvalidVideo={setAttachmentError} onValidVideo={() => setMediaReady(true)} /></div>
            <Button type="button" variant="ghost" size="icon" className="size-9 shrink-0 rounded-full text-muted-foreground hover:bg-primary/10 hover:text-primary" aria-label="Remove reference" disabled={pending} onClick={() => { setMedia(null); setAttachmentError(null); }}><X className="size-3.5" /></Button>
          </div>}
          <label htmlFor="plan-message" className="sr-only">Message ProofFlow</label>
          <Textarea ref={composer} id="plan-message" value={sending ? "" : input} onChange={(event) => setInput(event.target.value)} maxLength={2000} disabled={pending || !configured} placeholder={sending ? "Waiting for reply…" : media ? "What should this process include or change? (optional)" : isStarting ? "e.g. Pack the order, add the receipt, then seal the box…" : "Describe your process or ask for a change…"} className={`max-h-40 overflow-y-auto resize-none border-0 bg-transparent px-2 shadow-none focus-visible:ring-0 ${sending ? "h-11 min-h-0 flex-1 py-3 text-[13px] leading-5" : "min-h-20 py-2 text-base"}`} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
          <div className="composer-toolbar flex items-center justify-between gap-3 px-1 pb-1">
            {!sending && <Button type="button" variant="ghost" aria-label="Attach reference image or video" title="Images up to 10 MB · Videos up to 30 sec / 25 MB" className="gap-2 px-2 text-xs text-muted-foreground" disabled={pending || !configured} onClick={() => chooser.current?.click()}><Paperclip className="size-4" />{media ? "Replace reference" : "Add reference"}</Button>}<span className="ml-auto text-xs text-muted-foreground">{sending ? null : input.length > 1800 ? `${input.length}/2000` : null}</span>
            <Button type="submit" disabled={(!input.trim() && !media) || pending || !configured || Boolean(media && (!mediaReady || attachmentError))} className={`composer-submit h-11 shrink-0 rounded-xl ${isStarting ? "gap-2 px-3.5" : "size-11"}`} aria-label="Send message"><ArrowUp className="size-4" aria-hidden="true" />{isStarting && <span className="hidden sm:inline">Draft plan</span>}</Button>
          </div>
        </form>
        {!hasPlan && messages.length === 0 && !sending && <>
          <div className="process-ideas">
            <span className="starter-label">Try</span>
            <div className="process-idea-grid" aria-label="Process ideas">{[
              { prompt: "Place a mug on a tray", Icon: Coffee },
              { prompt: "Close a drawer", Icon: PanelTop },
            ].map(({ prompt, Icon }) => <button key={prompt} onClick={() => { setInput(prompt); composer.current?.focus(); }} disabled={pending || !configured} className="process-idea"><Icon className="size-3.5 shrink-0" aria-hidden="true" /><span>{prompt}</span></button>)}</div>
          </div>
          <div className="planner-alternatives">
            <Button variant="ghost" className="gap-2 text-xs text-muted-foreground" disabled={pending} onClick={onManual}><PencilLine className="size-3.5" />Build manually</Button>
            <Button variant="ghost" className="gap-2 text-xs text-muted-foreground" disabled={pending} onClick={onStarter}><Package className="size-3.5" />Try packing example</Button>
          </div>
        </>}
      </div>
    </section>
  );
}

function MessageContent({ content, user }: { content: string; user: boolean }) {
  const reference = user ? /^Reference media: ([^\n]+)\n([\s\S]*)$/.exec(content) : null;
  return <>
    {reference && <span className="mb-2 flex min-w-0 items-center gap-2 border-b pb-2 text-xs text-muted-foreground"><Paperclip className="size-3.5 shrink-0" /><span className="truncate" title={reference[1]}>{reference[1]}</span></span>}
    {user ? <p className="whitespace-pre-wrap break-words text-sm leading-7">{reference ? reference[2] : content}</p> : <ChatMarkdown content={content} />}
  </>;
}

function ReferencePreview({ media, url, isImage, onInvalidVideo, onValidVideo }: { media: File; url: string | null; isImage: boolean; onInvalidVideo?: (message: string) => void; onValidVideo?: () => void }) {
  const Icon = isImage ? ImageIcon : Film;
  return <details className="group min-w-0">
    <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg text-left [&::-webkit-details-marker]:hidden">
      <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/8 text-primary">{isImage && url ? <img src={url} alt="" className="size-full object-cover" /> : <Icon className="size-5" aria-hidden="true" />}</span>
      <span className="min-w-0 flex-1"><span className="block truncate text-[13px] font-medium" title={media.name}>{media.name}</span><span className="mt-0.5 block text-[11px] text-muted-foreground">{isImage ? "Image" : "Video"} · {media.size < 1024 * 1024 ? `${Math.ceil(media.size / 1024)} KB` : `${(media.size / (1024 * 1024)).toFixed(1)} MB`} · Reference</span></span>
      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
    </summary>
    {url && (isImage ? <img src={url} alt="Selected process reference" className="mt-3 max-h-64 w-full rounded-lg bg-muted object-contain" /> : <video src={url} controls playsInline preload="metadata" aria-label="Reference video preview" className="mt-3 max-h-64 w-full rounded-lg bg-muted" onError={() => onInvalidVideo?.("This video could not be previewed. Try another MP4, MOV, or WebM file.")} onLoadedMetadata={(event) => { if (!Number.isFinite(event.currentTarget.duration) || event.currentTarget.duration * 1000 > LIMITS.durationMs) onInvalidVideo?.("Choose a video up to 30 seconds."); else onValidVideo?.(); }} />)}
  </details>;
}

function PlannerActivity({ replying, drafting, reference }: { replying: boolean; drafting: boolean; reference: boolean }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 30_000);
    return () => window.clearTimeout(timer);
  }, []);
  if (replying && !drafting) return null;
  const label = drafting ? "Drafting checks" : slow ? "Still working" : reference ? "Reviewing reference" : "Thinking";
  return <div className="planner-activity" role="status">
    <span className="planner-activity-dots" aria-hidden="true"><i /><i /><i /></span>
    <span>{label}<span className="sr-only">. {slow ? "Your request is still in progress." : "Assistant is responding."}</span></span>
  </div>;
}

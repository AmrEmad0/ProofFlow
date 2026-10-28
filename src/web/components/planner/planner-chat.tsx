import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, LoaderCircle, Package, Workflow, Coffee, PanelTop, Paperclip, X, ImageIcon, Film, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { LIMITS } from "../../../shared/proof-plan";
import type { SavedPlan } from "../../../shared/planner";

type Props = {
  saved: SavedPlan | null;
  starter: boolean;
  pending: boolean;
  sending: boolean;
  referenceSending: boolean;
  pendingMessage: string | null;
  partialReply: string;
  configured: boolean;
  error: string | null;
  input: string;
  onInputChange: (value: string) => void;
  onSend: (message: string, media?: File) => Promise<void>;
  onStarter: () => void;
  onReload: () => void;
};

export function PlannerChat({ saved, starter, pending, sending, referenceSending, pendingMessage, partialReply, configured, error, input, onInputChange: setInput, onSend, onStarter, onReload }: Props) {
  const [media, setMedia] = useState<File | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
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
  useEffect(() => { setMedia(null); setConsent(false); setAttachmentError(null); }, [saved?.id]);
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
    setAttachmentError(null); setMedia(file); setConsent(false); setMediaReady(image);
  }
  const history = useRef<HTMLDivElement>(null);
  const followReply = useRef(true);
  const [showLatest, setShowLatest] = useState(false);
  const composer = useRef<HTMLTextAreaElement>(null);
  const hasPlan = Boolean(saved?.plan || starter);
  const messages = saved?.messages ?? [];
  const isStarting = !hasPlan && messages.length === 0 && !sending && !partialReply;
  useEffect(() => { followReply.current = true; setShowLatest(false); }, [saved?.id, pendingMessage]);
  useEffect(() => { if (history.current && followReply.current) history.current.scrollTop = history.current.scrollHeight; }, [saved?.id, messages.length, pendingMessage, partialReply, error]);

  function scrollToLatest() {
    followReply.current = true;
    setShowLatest(false);
    if (history.current) history.current.scrollTop = history.current.scrollHeight;
  }

  async function send() {
    const message = input.trim() || (media ? "Suggest a Proof Plan for the process in this reference. Help me refine it before approval." : "");
    if (!message || submitting.current || pending || !configured || (media && (!consent || !mediaReady || attachmentError))) return;
    submitting.current = true;
    try {
      await onSend(message, media ?? undefined);
      setMedia(null); setConsent(false);
      setInput("");
      requestAnimationFrame(() => composer.current?.focus({ preventScroll: true }));
    } catch { /* Keep the error and unsent message available for retry. */ }
    finally { submitting.current = false; }
  }

  return (
    <section className={`chat-panel min-w-0 ${messages.length || sending ? "chat-panel-active" : ""} ${isStarting ? "chat-panel-start" : ""}`} aria-label="Template planning chat">
      <div className="chat-header">
        <span className="chat-avatar"><Workflow className="size-5" aria-hidden="true" /></span>
        <div className="min-w-0 flex-1"><h2 className="text-sm font-semibold">Plan assistant</h2><p className="mt-0.5 text-xs text-muted-foreground">{hasPlan ? "Refine your checks, one message at a time." : "Build checks for what matters."}</p></div>
        <span className="chat-header-status"><span className={`size-1.5 rounded-full ${sending ? "bg-primary animate-pulse" : configured ? "bg-emerald-500" : "bg-muted-foreground"}`} />{sending ? "Working" : configured ? "Muse Spark" : "Offline"}</span>
      </div>
      {messages.length === 0 && !sending && !partialReply && <div className="chat-welcome"><span className="eyebrow">{hasPlan ? "MAKE IT YOURS" : "YOUR PROCESS, STEP BY STEP"}</span><h3 className="mt-2 text-xl font-semibold tracking-tight">{hasPlan ? "What would you like to refine?" : "What would you like to verify?"}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{hasPlan ? "Ask about a check, change a detail, or get help setting up your camera." : "Describe the actions your video should capture. Add an image or short video for more context."}</p></div>}
      {(messages.length > 0 || sending || partialReply) && <div ref={history} className="chat-history space-y-6 overflow-y-auto p-4 sm:p-5" role="log" aria-label="Planning conversation" aria-live="off" aria-busy={sending} onScroll={(event) => { const element = event.currentTarget; followReply.current = element.scrollHeight - element.scrollTop - element.clientHeight < 64; setShowLatest(!followReply.current); }}>
        {messages.map((message, index) => <div key={`${saved?.id}-${index}`} className={message.role === "user" ? "chat-message-user" : "chat-message-assistant"}>
          {message.role === "assistant" && <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-primary"><Workflow className="size-3" aria-hidden="true" />ProofFlow</p>}
          <MessageContent content={message.content} user={message.role === "user"} />
        </div>)}
        {(sending || partialReply) && <>
          <div className="chat-message-user">
            {referenceSending && media && <ReferencePreview key={localUrl} media={media} url={localUrl} isImage={isImage} />}
            {referenceSending && !media && <p className="mb-2 flex items-center gap-2 text-xs font-medium"><Paperclip className="size-3.5" aria-hidden="true" />Reference attached</p>}
            <p className="whitespace-pre-wrap break-words text-sm leading-6">{referenceSending && !input.trim() ? "Help me build a plan from this reference." : pendingMessage}</p>
          </div>
          {partialReply && <div className="pr-2"><p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-primary"><Workflow className="size-3" aria-hidden="true" />ProofFlow</p><p className="chat-reply whitespace-pre-wrap break-words text-sm leading-7">{partialReply}{sending && <span className="chat-cursor" aria-hidden="true" />}</p></div>}
          {sending ? <p className="flex items-center gap-2.5 py-1 text-xs text-muted-foreground" role="status"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{partialReply ? "Finishing response…" : referenceSending ? "Reading your reference and drafting checks…" : "Thinking…"}</p> : <p className="text-xs text-muted-foreground">This reply wasn’t saved. Your previous checks are unchanged.</p>}
        </>}
      </div>}
      {showLatest && <div className="flex justify-center border-t py-2"><Button variant="outline" className="h-9 rounded-full text-xs" onClick={scrollToLatest}><ArrowDown className="size-3.5" />Latest message</Button></div>}
      <p className="sr-only" role="status">{sending ? "Assistant is responding." : error ? "Message failed. Your draft is preserved." : messages.length ? "Assistant response complete." : ""}</p>
      <div className="chat-composer-area p-4 sm:p-5">
        {error && <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3" role="alert"><p className="text-sm leading-5 text-destructive">{error}</p>{saved && <button onClick={onReload} disabled={pending} className="mt-2 text-xs font-medium underline underline-offset-4">Reload saved draft</button>}</div>}
        {!configured && <p className="mb-4 text-sm leading-6 text-muted-foreground">The assistant is unavailable right now. {hasPlan ? "You can still change your checks directly." : "You can use and change the box packing example."}</p>}
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
        {media && !sending && <div className="mb-3 overflow-hidden rounded-xl border bg-background">
          <div className="flex items-center gap-2 p-3">
            <div className="min-w-0 flex-1"><ReferencePreview key={localUrl} media={media} url={localUrl} isImage={isImage} onInvalidVideo={setAttachmentError} onValidVideo={() => setMediaReady(true)} /></div>
            <Button variant="ghost" size="icon" aria-label="Remove reference" disabled={pending} onClick={() => { setMedia(null); setConsent(false); setAttachmentError(null); }}><X className="size-4" /></Button>
          </div>
          <div className="border-t bg-muted/30 px-3 py-3">
            <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-5"><input type="checkbox" aria-label="I have permission to share this with Meta AI." checked={consent} disabled={pending} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-primary" /><span>I have permission to share this with Meta AI.<span className="mt-1 block text-muted-foreground">Meta may use uploads for training.</span></span></label>
          </div>
        </div>}
        <input ref={chooser} type="file" accept=".jpg,.jpeg,.png,.webp,.mp4,.mov,.webm" aria-label="Choose a reference image or video" className="sr-only" tabIndex={-1} disabled={pending || !configured} onChange={(event) => { choose(event.target.files?.[0]); event.target.value = ""; }} />
        <form onSubmit={(event) => { event.preventDefault(); void send(); }} className="chat-composer @container rounded-2xl border bg-card p-2 transition-shadow focus-within:border-primary/50 focus-within:ring-3 focus-within:ring-primary/5">
          <label htmlFor="plan-message" className="sr-only">Message ProofFlow</label>
          {isStarting && <span className="composer-label" aria-hidden="true">Describe your process</span>}
          <Textarea ref={composer} id="plan-message" value={sending ? "" : input} onChange={(event) => setInput(event.target.value)} maxLength={2000} disabled={pending || !configured} placeholder={sending ? "Your plan assistant is working…" : media ? "What should this process include or change? (optional)" : isStarting ? "e.g. Place the product in the box, add the packing slip, then close the lid…" : "Describe your process or ask for a change…"} className="min-h-20 max-h-40 overflow-y-auto resize-none border-0 bg-transparent px-2 py-2 text-base shadow-none focus-visible:ring-0" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
          <div className="composer-toolbar flex items-center justify-between gap-3 px-1 pb-1">
            <Button type="button" variant="ghost" aria-label="Attach reference image or video" className="gap-2 px-2 text-xs text-muted-foreground" disabled={pending || !configured} onClick={() => chooser.current?.click()}><Paperclip className="size-4" />{media ? "Replace reference" : "Add reference"}</Button><span className="ml-auto text-xs text-muted-foreground">{input.length > 1800 ? `${input.length}/2000` : <span className="hidden @min-[480px]:inline">Shift + Enter for new line</span>}</span>
            <Button type="submit" disabled={(!input.trim() && !media) || pending || !configured || Boolean(media && (!consent || !mediaReady || attachmentError))} className={`composer-submit h-11 shrink-0 rounded-xl ${isStarting ? "gap-2 px-3.5" : "size-11"}`} aria-label="Send message">{sending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <ArrowUp className="size-4" aria-hidden="true" />}{isStarting && <span className="hidden sm:inline">Draft plan</span>}</Button>
          </div>
        </form>
        {!hasPlan && messages.length === 0 && !sending && <>
          <p className="reference-limits">Images up to 10 MB <span aria-hidden="true">·</span> Videos up to 30 sec / 25 MB</p>
          <div className="process-ideas">
            <p className="starter-label">Need a starting point?</p>
            <div className="process-idea-grid" aria-label="Process ideas">{[
              { prompt: "Place a mug on a tray", detail: "Object placement", Icon: Coffee },
              { prompt: "Close a drawer", detail: "A change in state", Icon: PanelTop },
            ].map(({ prompt, detail, Icon }) => <button key={prompt} onClick={() => { setInput(prompt); composer.current?.focus(); }} disabled={pending || !configured} className="process-idea"><Icon className="size-4 shrink-0 text-primary" aria-hidden="true" /><span className="min-w-0"><span className="block text-[13px] font-medium">{prompt}</span><span className="mt-0.5 block text-xs text-muted-foreground">{detail}</span></span><ArrowUp className="idea-arrow size-3.5 shrink-0" aria-hidden="true" /></button>)}</div>
          </div>
          <button onClick={onStarter} disabled={pending} className="starter-example"><span className="starter-example-icon"><Package className="size-5" aria-hidden="true" /></span><span className="min-w-0 flex-1"><span className="block text-[13px] font-semibold">Explore a complete example</span><span className="mt-1 block text-xs text-muted-foreground">Box packing · 3 editable checks</span></span><ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" /></button>
        </>}
      </div>
    </section>
  );
}

function MessageContent({ content, user }: { content: string; user: boolean }) {
  const reference = user ? /^Reference media: ([^\n]+)\n([\s\S]*)$/.exec(content) : null;
  return <>
    {reference && <span className="mb-2 flex min-w-0 items-center gap-2 border-b pb-2 text-xs text-muted-foreground"><Paperclip className="size-3.5 shrink-0" /><span className="truncate" title={reference[1]}>{reference[1]}</span></span>}
    <p className="whitespace-pre-wrap break-words text-sm leading-7">{reference ? reference[2] : content}</p>
  </>;
}

function ReferencePreview({ media, url, isImage, onInvalidVideo, onValidVideo }: { media: File; url: string | null; isImage: boolean; onInvalidVideo?: (message: string) => void; onValidVideo?: () => void }) {
  const Icon = isImage ? ImageIcon : Film;
  return <details className="group min-w-0">
    <summary className="flex cursor-pointer list-none items-center gap-3 rounded-lg text-left [&::-webkit-details-marker]:hidden">
      <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted">{isImage && url ? <img src={url} alt="" className="size-full object-cover" /> : <Icon className="size-5 text-muted-foreground" aria-hidden="true" />}</span>
      <span className="min-w-0 flex-1"><span className="block truncate text-xs font-medium" title={media.name}>{media.name}</span><span className="mt-0.5 block text-xs text-muted-foreground">{isImage ? "Image" : "Video"} · {media.size < 1024 * 1024 ? `${Math.ceil(media.size / 1024)} KB` : `${(media.size / (1024 * 1024)).toFixed(1)} MB`} · Preview</span></span>
      <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
    </summary>
    {url && (isImage ? <img src={url} alt="Selected process reference" className="mt-3 max-h-48 w-full rounded-lg bg-muted object-contain" /> : <video src={url} controls playsInline preload="metadata" aria-label="Reference video preview" className="mt-3 max-h-48 w-full rounded-lg bg-muted" onError={() => onInvalidVideo?.("This video could not be previewed. Try another MP4, MOV, or WebM file.")} onLoadedMetadata={(event) => { if (!Number.isFinite(event.currentTarget.duration) || event.currentTarget.duration * 1000 > LIMITS.durationMs) onInvalidVideo?.("Choose a video up to 30 seconds."); else onValidVideo?.(); }} />)}
  </details>;
}

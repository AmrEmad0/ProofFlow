import { useEffect, useRef } from "react";
import { ArrowRight, ArrowUp, LoaderCircle, Package, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { SavedPlan } from "../../../shared/planner";

type Props = {
  saved: SavedPlan | null;
  starter: boolean;
  pending: boolean;
  sending: boolean;
  pendingMessage: string | null;
  partialReply: string;
  configured: boolean;
  error: string | null;
  input: string;
  onInputChange: (value: string) => void;
  onSend: (message: string) => Promise<void>;
  onStarter: () => void;
  onReload: () => void;
};

export function PlannerChat({ saved, starter, pending, sending, pendingMessage, partialReply, configured, error, input, onInputChange: setInput, onSend, onStarter, onReload }: Props) {
  const history = useRef<HTMLDivElement>(null);
  const followReply = useRef(true);
  const composer = useRef<HTMLTextAreaElement>(null);
  const hasPlan = Boolean(saved?.plan || starter);
  const messages = saved?.messages ?? [];
  useEffect(() => { followReply.current = true; }, [saved?.id, pendingMessage]);
  useEffect(() => { if (history.current && followReply.current) history.current.scrollTop = history.current.scrollHeight; }, [saved?.id, messages.length, pendingMessage, partialReply, error]);

  async function send() {
    const message = input.trim();
    if (!message || pending || !configured) return;
    try {
      await onSend(message);
      setInput("");
      requestAnimationFrame(() => composer.current?.focus({ preventScroll: true }));
    } catch { /* Keep the error and unsent message available for retry. */ }
  }

  return (
    <section className={`chat-panel min-w-0 ${hasPlan ? "border-primary/25" : ""}`} aria-label="Template planning chat">
      <div className="border-b px-5 py-4"><h2 className="flex items-center gap-2 text-base font-semibold"><Sparkles className="size-4 text-primary" aria-hidden="true" />ProofFlow</h2><p className="mt-1 text-sm leading-6 text-muted-foreground">{hasPlan ? "Ask a question or tell me what you’d like to change." : "Let’s work out what your video needs to show."}</p></div>
      {messages.length === 0 && !sending && !partialReply && <div className="px-5 pt-5 text-sm leading-6"><p>{hasPlan ? "We can talk through these checks, adjust them, or figure out how to film them. What would you like help with?" : "What are you trying to show or check? Tell me a little about the task, and we’ll take it from there."}</p></div>}
      {(messages.length > 0 || sending || partialReply) && <div ref={history} className="chat-history space-y-4 overflow-y-auto p-4" role="log" aria-label="Planning conversation" aria-relevant="additions text" aria-busy={sending} onScroll={(event) => { const element = event.currentTarget; followReply.current = element.scrollHeight - element.scrollTop - element.clientHeight < 64; }}>
        {messages.map((message, index) => <div key={`${saved?.id}-${index}`} className={message.role === "user" ? "ml-6 rounded-xl rounded-tr-sm bg-muted px-4 py-3" : "pr-2"}>
          {message.role === "assistant" && <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-primary"><Sparkles className="size-3" aria-hidden="true" />ProofFlow</p>}
          <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>
        </div>)}
        {(sending || partialReply) && <>
          <div className="ml-6 rounded-xl rounded-tr-sm bg-muted px-4 py-3"><p className="whitespace-pre-wrap break-words text-sm leading-6">{pendingMessage}</p></div>
          {partialReply && <div className="pr-2"><p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-primary"><Sparkles className="size-3" aria-hidden="true" />ProofFlow</p><p className="whitespace-pre-wrap break-words text-sm leading-6">{partialReply}</p></div>}
          {sending ? <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />{partialReply ? "Finishing response…" : "Thinking…"}</p> : <p className="text-xs text-muted-foreground">This reply was interrupted. Reload the saved draft before sending again.</p>}
        </>}
      </div>}
      <div className="p-4 sm:p-5">
        {error && <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3" role="alert"><p className="text-sm leading-5 text-destructive">{error}</p>{saved && <button onClick={onReload} disabled={pending} className="mt-2 text-xs font-medium underline underline-offset-4">Reload saved draft</button>}</div>}
        {!configured && <p className="mb-4 text-sm leading-6 text-muted-foreground">The assistant is unavailable right now. {hasPlan ? "You can still change your checks directly." : "You can use and change the box packing example."}</p>}
        {hasPlan && messages.length === 0 && !input.trim() && <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Suggestions for your assistant">{[
          { label: "Explain this plan", message: "Can you explain what this plan can check?" },
          { label: "Change a check", message: "I’d like to change one of the checks." },
          { label: "Help me film", message: "How should I film these checks?" },
        ].map(({ label, message }) => <Button key={label} variant="outline" className="h-11 px-3 text-xs" disabled={pending || !configured} onClick={() => { setInput(message); composer.current?.focus(); }}>{label}</Button>)}</div>}
        <form onSubmit={(event) => { event.preventDefault(); void send(); }} className="rounded-xl border bg-background p-2 transition-shadow focus-within:border-primary/50 focus-within:ring-3 focus-within:ring-primary/5">
          <label htmlFor="plan-message" className="sr-only">Message ProofFlow</label>
          <Textarea ref={composer} id="plan-message" value={input} onChange={(event) => setInput(event.target.value)} maxLength={2000} disabled={pending || !configured} placeholder="Message ProofFlow…" className="min-h-24 resize-none border-0 bg-transparent px-2 py-2 text-base shadow-none focus-visible:ring-0" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
          <div className="flex items-center justify-between gap-3 px-1 pb-1">
            <span className="text-xs text-muted-foreground">{input.length > 1800 ? `${input.length}/2000` : "Shift + Enter for a new line"}</span>
            <Button type="submit" disabled={!input.trim() || pending || !configured} className="size-11 rounded-lg" aria-label="Send message">{sending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <ArrowUp className="size-4" aria-hidden="true" />}</Button>
          </div>
        </form>
        {!hasPlan && messages.length === 0 && !sending && <>
          <div className="mt-4 flex flex-wrap gap-2">{["Place a mug on a tray", "Close a drawer"].map((prompt) => <button key={prompt} onClick={() => { setInput(prompt); composer.current?.focus(); }} disabled={pending || !configured} className="rounded-full border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50">{prompt}</button>)}</div>
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or use an example<span className="h-px flex-1 bg-border" /></div>
          <button onClick={onStarter} disabled={pending} className="flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/3 disabled:opacity-50"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Package className="size-5" aria-hidden="true" /></span><span className="flex-1"><span className="block text-sm font-medium">Box packing</span><span className="mt-1 block text-xs text-muted-foreground">Product, packing slip, close the box.</span></span><ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" /></button>
        </>}
      </div>
    </section>
  );
}

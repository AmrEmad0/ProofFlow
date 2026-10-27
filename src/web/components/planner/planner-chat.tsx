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
  configured: boolean;
  error: string | null;
  input: string;
  onInputChange: (value: string) => void;
  onSend: (message: string) => Promise<void>;
  onStarter: () => void;
  onReload: () => void;
};

export function PlannerChat({ saved, starter, pending, sending, pendingMessage, configured, error, input, onInputChange: setInput, onSend, onStarter, onReload }: Props) {
  const bottom = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const hasPlan = Boolean(saved?.plan || starter);
  const messages = saved?.messages ?? [];
  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [saved?.id, messages.length, pendingMessage, error]);

  async function send() {
    const message = input.trim();
    if (!message || pending || saved?.status === "approved" || !configured) return;
    try {
      await onSend(message);
      setInput("");
      composer.current?.focus();
    } catch { /* Keep the error and unsent message available for retry. */ }
  }

  return (
    <section className="chat-panel min-w-0" aria-label="Template planning chat">
      {hasPlan && <div className="flex items-center gap-2 border-b px-5 py-4"><Sparkles className="size-4 text-primary" aria-hidden="true" /><h2 className="text-sm font-semibold">Edit with AI</h2></div>}
      {(messages.length > 0 || sending) && <div className="chat-history space-y-4 overflow-y-auto p-5" role="log" aria-label="Planning conversation" aria-relevant="additions text">
        {messages.map((message, index) => <div key={`${saved?.id}-${index}`} className={message.role === "user" ? "ml-6 rounded-xl rounded-tr-sm bg-muted px-4 py-3" : "pr-2"}>
          {message.role === "assistant" && <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-primary"><Sparkles className="size-3" aria-hidden="true" />ProofFlow</p>}
          <p className="whitespace-pre-wrap break-words text-sm leading-6">{message.content}</p>
        </div>)}
        {sending && <>
          <div className="ml-6 rounded-xl rounded-tr-sm bg-muted px-4 py-3"><p className="whitespace-pre-wrap break-words text-sm leading-6">{pendingMessage}</p></div>
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status"><LoaderCircle className="size-4 animate-spin" aria-hidden="true" />Updating your checks…</p>
        </>}
        <div ref={bottom} />
      </div>}
      <div className="p-4 sm:p-5">
        {error && <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3" role="alert"><p className="text-sm leading-5 text-destructive">{error}</p>{saved && <button onClick={onReload} disabled={pending} className="mt-2 text-xs font-medium underline underline-offset-4">Reload saved draft</button>}</div>}
        {!configured && <p className="mb-4 text-sm leading-5 text-muted-foreground">AI is unavailable. You can use the box packing example.</p>}
        <form onSubmit={(event) => { event.preventDefault(); void send(); }} className="rounded-xl border bg-background p-2 transition-shadow focus-within:border-primary/50 focus-within:ring-3 focus-within:ring-primary/5">
          <label htmlFor="plan-message" className="sr-only">Describe your task or a change to the proof plan</label>
          <Textarea ref={composer} id="plan-message" value={input} onChange={(event) => setInput(event.target.value)} maxLength={2000} disabled={pending || !configured} placeholder={hasPlan ? "What would you like to change?" : "e.g. Put a product and packing slip in a box, then close it."} className={`${hasPlan ? "min-h-24" : "min-h-32"} resize-none border-0 bg-transparent px-2 py-2 text-sm! shadow-none focus-visible:ring-0`} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
          <div className="flex items-center justify-between gap-3 px-1 pb-1">
            <span className="text-xs text-muted-foreground">{input.length ? `${input.length}/2000` : ""}</span>
            <Button type="submit" disabled={!input.trim() || pending || !configured} className="h-10 gap-2 rounded-lg px-4 text-sm" aria-label={hasPlan ? "Send message" : "Create plan"}>{sending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : hasPlan ? <ArrowUp className="size-4" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}{hasPlan ? "Send" : "Create plan"}</Button>
          </div>
        </form>
        {!hasPlan && <>
          <div className="mt-4 flex flex-wrap gap-2">{["Place a mug on a tray", "Close a drawer"].map((prompt) => <button key={prompt} onClick={() => { setInput(prompt); composer.current?.focus(); }} disabled={pending || !configured} className="rounded-full border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground disabled:opacity-50">{prompt}</button>)}</div>
          <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or use an example<span className="h-px flex-1 bg-border" /></div>
          <button onClick={onStarter} disabled={pending} className="flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/3 disabled:opacity-50"><span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><Package className="size-5" aria-hidden="true" /></span><span className="flex-1"><span className="block text-sm font-medium">Box packing</span><span className="mt-1 block text-xs text-muted-foreground">Product, packing slip, close the box.</span></span><ArrowRight className="size-4 text-muted-foreground" aria-hidden="true" /></button>
        </>}
      </div>
    </section>
  );
}

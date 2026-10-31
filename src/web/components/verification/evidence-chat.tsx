import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpRight, MessageCircle, Play, RotateCcw, Square, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/eden";
import { apiError } from "@/lib/queries";
import { readEvidenceChatStream } from "@/lib/evidence-chat-stream";
import { ChatMarkdown } from "../planner/chat-markdown";
import type { EvidenceChatMessage, EvidenceChatReply } from "../../../shared/evidence-chat";
import type { RunDetails } from "../../../shared/verification";
import { formatTime } from "./verification-checks";

type Message = EvidenceChatMessage & { references?: EvidenceChatReply["references"] };

export function EvidenceChat({ run, selectedId, visible, onInspect }: { visible: boolean; run: RunDetails; selectedId: string | null; onInspect: (stepId: string, timestampMs: number) => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [question, setQuestion] = useState<string | null>(null);
  const [partialReply, setPartialReply] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showLatest, setShowLatest] = useState(false);
  const history = useRef<HTMLDivElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const followReply = useRef(true);
  const selected = run.approvedPlan.steps.find(step => step.id === selectedId);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; request.current?.abort(); };
  }, []);
  useEffect(() => {
    if (history.current && followReply.current) history.current.scrollTop = history.current.scrollHeight;
  }, [messages.length, question, partialReply, sending, error]);

  useEffect(() => {
    if (visible) {
      if (history.current && followReply.current) history.current.scrollTop = history.current.scrollHeight;
      composer.current?.focus({ preventScroll: true });
    }
  }, [visible]);

  async function send(value = input.trim()) {
    if (!value || request.current || messages.length >= 20) return;
    const controller = new AbortController();
    request.current = controller;
    setQuestion(value); setPartialReply(""); setError(null); setInput(""); setSending(true);
    followReply.current = true; setShowLatest(false);
    try {
      const next: EvidenceChatMessage[] = [...messages.map(({ role, content }) => ({ role, content })), { role: "user", content: value }];
      const response = await api.api.runs({ id: run.id }).messages.post({ messages: next }, { query: { stream: "true" }, fetch: { signal: controller.signal } });
      if (response.error) throw apiError(response.error.value, "The evidence assistant could not reply.");
      if (!response.data || !(Symbol.asyncIterator in response.data)) throw new Error("The reply stream could not be opened. Please try again.");
      const answer = await readEvidenceChatStream(response.data, text => { if (mounted.current && !controller.signal.aborted) setPartialReply(text); });
      controller.signal.throwIfAborted();
      if (!mounted.current) return;
      setMessages(previous => [...previous, { role: "user", content: value }, { role: "assistant", content: answer.reply, references: answer.references }]);
      setQuestion(null); setPartialReply("");
    } catch (failure) {
      if (mounted.current) setError(controller.signal.aborted ? "Reply stopped. You can retry or ask another question." : failure instanceof Error ? failure.message : "The reply was interrupted. Please try again.");
    } finally {
      controller.abort();
      if (request.current === controller) request.current = null;
      if (mounted.current) setSending(false);
    }
  }

  function latest() {
    followReply.current = true; setShowLatest(false);
    if (history.current) history.current.scrollTop = history.current.scrollHeight;
  }

  function userMessage(content: string) {
    return <div className="ml-auto w-fit max-w-[90%] rounded-2xl rounded-br-md bg-muted px-3 py-2"><p className="whitespace-pre-wrap break-words text-[13px] leading-6">{content}</p></div>;
  }

  return <section className="flex min-h-0 flex-1 flex-col bg-muted/10 [&_.chat-markdown]:text-[13px] [&_.chat-markdown]:leading-6" aria-label="Evidence assistant">
    <div className="flex shrink-0 items-center justify-between gap-2 border-b bg-card px-4 py-2.5">
      <div className="min-w-0"><p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{selected ? `Check ${run.approvedPlan.steps.indexOf(selected) + 1}` : "This recording"}</p><p className="mt-0.5 truncate text-xs font-medium" title={selected?.label}>{selected?.label ?? "All checks"}</p></div>
      <span className="flex shrink-0 items-center gap-1.5 text-[10px] text-muted-foreground"><span className={`size-1.5 rounded-full ${sending ? "animate-pulse bg-primary" : "bg-emerald-500"}`} />{sending ? "Replying" : "Muse Spark"}</span>
    </div>
    {!messages.length && !question ? <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto px-4 py-5">
      <span className="mb-3 flex size-9 items-center justify-center rounded-xl border border-primary/10 bg-primary/5 text-primary"><MessageCircle className="size-4" /></span>
      <h3 className="text-sm font-semibold tracking-tight">Make sense of the evidence</h3>
      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">Ask why a check got its result or what needs a closer look.</p>
      <div className="mt-4 space-y-2">{[
        { label: selected ? "Why this result?" : "Explain the results", question: selected ? `Why did “${selected.label}” get this result?` : "Explain the results for this video." },
        { label: "What could I film better?", question: "What evidence was missing or unclear, and how could I film it more clearly?" },
      ].map(item => <button type="button" key={item.label} onClick={() => void send(item.question)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border bg-card px-3 py-2 text-left text-xs transition-colors hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{item.label}<ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" /></button>)}</div>
    </div> : <div ref={history} role="log" aria-label="Evidence conversation" aria-live="off" aria-busy={sending} className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4" onScroll={event => {
      const element = event.currentTarget;
      followReply.current = element.scrollHeight - element.scrollTop - element.clientHeight < 64;
      setShowLatest(!followReply.current);
    }}>
        {messages.map((message, index) => <div key={index}>
          {message.role === "user" ? userMessage(message.content) : <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-primary"><Workflow className="size-3.5" />ProofFlow</p>
            <ChatMarkdown content={message.content} />
            {Boolean(message.references?.length) && <div className="mt-3 flex flex-wrap gap-2" aria-label="Video moments">{message.references?.map(reference => <Button key={reference.stepId} variant="outline" className="h-auto min-h-9 min-w-0 max-w-full justify-start gap-2 rounded-lg bg-card px-2.5 py-2 text-left text-[11px]" onClick={() => onInspect(reference.stepId, reference.timestampMs)}><Play className="size-3 shrink-0 text-primary" /><span className="truncate">{reference.label}</span><span className="shrink-0 tabular-nums text-muted-foreground">{formatTime(reference.timestampMs)}</span></Button>)}</div>}
          </div>}
        </div>)}
        {question && <>
          {userMessage(question)}
          <div><p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-primary"><Workflow className="size-3.5" />ProofFlow{partialReply && sending && <span className="text-[11px] font-normal text-muted-foreground">· Writing</span>}</p>
            {partialReply ? <ChatMarkdown content={partialReply} streaming={sending} /> : sending ? <div className="planner-activity"><span className="planner-activity-dots" aria-hidden="true"><i /><i /><i /></span><span>Reviewing the evidence</span></div> : null}
            {error && <div className="mt-2 rounded-lg border border-destructive/20 bg-destructive/5 p-3"><p role="alert" className="text-xs leading-5 text-destructive">{error}</p>{partialReply && <p className="mt-1 text-xs text-muted-foreground">This answer is incomplete.</p>}<Button variant="ghost" className="mt-1 gap-1.5 px-0 text-xs" onClick={() => void send(question)}><RotateCcw className="size-3.5" />Retry</Button></div>}
          </div>
        </>}
      </div>}
      {showLatest && <div className="flex justify-center py-2"><Button variant="outline" className="gap-1.5 rounded-full px-3 text-xs" onClick={latest}><ArrowDown className="size-3.5" />Latest reply</Button></div>}
      <div className="shrink-0 border-t bg-card p-3">
        {selected && messages.length > 0 && !sending && !question && messages.length < 20 && <button type="button" className="mb-2 flex min-h-8 items-center gap-1.5 rounded-md text-[11px] font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" onClick={() => void send(`Why did “${selected.label}” get this result?`)}><MessageCircle className="size-3" />Explain selected check</button>}
        {messages.length >= 20 ? <p className="text-xs text-muted-foreground">This conversation has reached 10 questions.</p> : <form className="flex items-end gap-1 rounded-xl border bg-background p-1.5 focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-primary/10" onSubmit={event => { event.preventDefault(); void send(); }}>
          <Textarea ref={composer} rows={1} aria-label="Question about this video" placeholder={sending ? "Replying…" : "Ask a question…"} value={input} onChange={event => setInput(event.target.value)} disabled={sending} maxLength={2000} className="max-h-24 min-h-10 flex-1 resize-none border-0 bg-transparent px-2 py-2.5 text-[13px] leading-5 shadow-none focus-visible:ring-0" onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
          {sending ? <Button type="button" variant="outline" size="icon" className="size-10 shrink-0 rounded-lg" aria-label="Stop reply" onClick={() => request.current?.abort()}><Square className="size-3 fill-current" /></Button> : <Button type="submit" size="icon" className="size-10 shrink-0 rounded-lg" aria-label="Ask about evidence" disabled={!input.trim()}><ArrowUp className="size-3.5" /></Button>}
        </form>}
        <p className="mt-2 text-center text-[10px] leading-4 text-muted-foreground">Grounded in this recording’s saved evidence</p>
      </div>
      <p className="sr-only" role="status">{sending ? partialReply ? "Assistant is writing." : "Assistant is reviewing the evidence." : error ? "Reply interrupted." : messages.length ? "Reply complete." : ""}</p>
  </section>;
}

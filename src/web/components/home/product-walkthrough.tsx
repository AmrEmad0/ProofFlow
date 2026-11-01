import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUp, Check, CheckCheck, ChevronRight, CircleHelp, FileCheck2, Film, Focus, Image, LockKeyhole, Pause, Play, RotateCcw, ScanLine, Sparkles } from "lucide-react";
import { demoChecks, demoMedia, demoPrompt, demoTime } from "./demo-content";
import { DemoEvidencePlayer } from "./demo-evidence-player";
import "./workspace-demo.css";

type Phase = "compose" | "reference" | "plan" | "ready" | "verify" | "review";

export function ProductWalkthrough() {
  const [replay, setReplay] = useState(0);
  return <section id="product-demo" className="home-container film-demo-section" aria-label="Interactive media-to-evidence product demo">
    <div className="film-demo-heading"><div><span className="home-kicker">A REAL RECORDING. THE WHOLE WORKFLOW.</span><h2>Show it. Plan it. Check what happened.</h2></div><p>A café task is our example.<br />The workflow is yours to adapt.</p></div>
    <MediaWorkflow key={replay} onReplay={() => setReplay(count => count + 1)} />
    <div className="film-demo-attribution"><p>Scripted conversation and illustrative findings; boxes are hand-authored, not live Muse or SAM output.</p><span>Footage: <a href={demoMedia.source} target="_blank" rel="noreferrer">{demoMedia.author} / Pexels</a> · <a href={demoMedia.license} target="_blank" rel="noreferrer">License</a></span></div>
  </section>;
}

function MediaWorkflow({ onReplay }: { onReplay: () => void }) {
  const [phase, setPhase] = useState<Phase>("compose");
  const [characters, setCharacters] = useState(0);
  const [checkCount, setCheckCount] = useState(0);
  const [verificationStep, setVerificationStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [questionAsked, setQuestionAsked] = useState(false);
  const [selected, setSelected] = useState(0);
  const [time, setTime] = useState(0);
  const [seek, setSeek] = useState({ seconds: 0, request: 0 });
  const [tab, setTab] = useState<"reference" | "plan" | "evidence">("reference");
  const root = useRef<HTMLDivElement>(null);
  const history = useRef<HTMLDivElement>(null);
  const automated = ["compose", "reference", "plan", "verify"].includes(phase);
  const approved = phase === "verify" || phase === "review";
  const ready = ["ready", "verify", "review"].includes(phase);
  const current = demoChecks[selected]!;
  const stage = phase === "compose" || phase === "reference" ? 0 : phase === "plan" || phase === "ready" ? 1 : phase === "verify" ? 2 : 3;

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setReducedMotion(true); setCharacters(demoPrompt.length); setCheckCount(3); setPhase("ready"); setTab("plan"); }
    const observer = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)), { threshold: .1 });
    if (root.current) observer.observe(root.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || paused || !automated) return;
    const timeout = window.setTimeout(() => {
      if (phase === "compose") {
        if (characters < demoPrompt.length) setCharacters(value => Math.min(value + 4, demoPrompt.length));
        else setPhase("reference");
      } else if (phase === "reference") { setPhase("plan"); setTab("plan"); }
      else if (phase === "plan") {
        if (checkCount < 3) setCheckCount(value => value + 1);
        else setPhase("ready");
      } else if (phase === "verify") {
        if (verificationStep < 2) setVerificationStep(value => value + 1);
        else { setPhase("review"); setTab("evidence"); setSeek(value => ({ seconds: 9, request: value.request + 1 })); }
      }
    }, phase === "compose" ? 35 : phase === "reference" ? 1400 : phase === "verify" ? 1000 : 500);
    return () => window.clearTimeout(timeout);
  }, [phase, characters, checkCount, verificationStep, paused, visible, automated]);

  useEffect(() => { if (history.current) history.current.scrollTop = history.current.scrollHeight; }, [phase, questionAsked, photoOpen]);

  function showPlan() { setCharacters(demoPrompt.length); setCheckCount(3); setPhase("ready"); setTab("plan"); setPaused(false); }
  function inspect(index: number) { setSelected(index); setSeek(value => ({ seconds: demoChecks[index]!.start, request: value.request + 1 })); setTab("evidence"); }
  const status = phase === "compose" ? "Start with footage, an image, and your own instructions." : phase === "reference" ? "The reference gives context. Your instructions define the task." : phase === "plan" ? "Turning the request into separate, visible checks." : phase === "ready" ? "Your turn: review the plan, then approve the demo run." : phase === "verify" ? "Replaying the verification workflow—not running a live analysis." : "Click a finding to jump to the actual supporting footage.";

  return <div className="film-demo-window" ref={root} data-paused={paused || !visible}>
    <div className="film-demo-toolbar"><span><ScanLine size={19} aria-hidden="true" /><strong>ProofFlow</strong><span className="film-toolbar-slash">/</span><span className="film-toolbar-project">Drink preparation</span></span><div><span className="film-tour-badge">Scripted demo</span>{automated && <button type="button" onClick={() => setPaused(value => !value)} aria-label={paused ? "Resume demo animation" : "Pause demo animation"}>{paused ? <Play size={15} /> : <Pause size={15} />}</button>}<button type="button" onClick={onReplay} aria-label="Replay product demo"><RotateCcw size={15} /></button></div></div>
    <ol className="film-workflow-steps" aria-label="Demo workflow">{["Add context", "Create a plan", "Verify video", "Inspect evidence"].map((label, index) => <li key={label} aria-current={stage === index ? "step" : undefined} data-complete={index < stage}><span>{index < stage ? <Check size={12} aria-hidden="true" /> : index + 1}</span>{label}{index < 3 && <ChevronRight size={13} aria-hidden="true" />}</li>)}</ol>
    <div className="film-workspace">
      <section className="film-chat-panel" aria-label="Scripted conversation with reference media">
        <div className="film-panel-heading"><span><Sparkles size={18} aria-hidden="true" /></span><div><h3>Plan assistant</h3><p>Reference → intent → visible checks</p></div></div>
        <div className="film-chat-history" ref={history} role="region" aria-label="Demo chat history" tabIndex={0}>
          <div className="film-chat-user"><span className="film-speaker">YOU</span><div className="film-chat-attachments"><button type="button" onClick={() => setPhotoOpen(value => !value)} aria-expanded={photoOpen} aria-label="View attached reference photo"><img src={demoMedia.reference} alt="Reference: glass and carafe on the counter" width={648} height={720} /><span><Image size={12} aria-hidden="true" />Reference photo</span></button><button type="button" onClick={() => setTab("reference")} aria-label="View attached reference video"><img src={demoMedia.poster} alt="Video thumbnail: drink being poured into a glass" width={648} height={720} /><span><Film size={12} aria-hidden="true" />24-second clip</span><i><Play size={14} fill="currentColor" aria-hidden="true" /></i></button></div>{photoOpen && <img className="film-expanded-photo" src={demoMedia.reference} alt="Full reference frame showing the empty glass and carafe before pouring" />}<p>{phase === "compose" ? <> {demoPrompt.slice(0, characters)}<span className="film-caret" aria-hidden="true" /></> : demoPrompt}</p></div>
          {phase === "reference" && <div className="film-chat-thinking" role="status"><Sparkles size={15} aria-hidden="true" /><span>Reading the reference and your instructions…</span></div>}
          {["plan", "ready", "verify", "review"].includes(phase) && <div className="film-chat-assistant"><span className="film-speaker"><Sparkles size={12} aria-hidden="true" />PROOFFLOW · SCRIPTED</span><p>The reference shows a carafe and a glass. I’ll make three checks from your instructions, including the stirring step you requested.</p><div className="film-chat-plan-link"><FileCheck2 size={16} aria-hidden="true" /><span>Drink preparation</span><span>{checkCount} checks</span></div><p className="film-chat-note">Review the plan before we check the recording. Visible actions only—no claims about taste or temperature.</p></div>}
          {approved && <div className="film-chat-approved"><LockKeyhole size={15} aria-hidden="true" /><p>You approved version 1. The checks are frozen for this demo run.</p></div>}
          {phase === "review" && <div className="film-chat-assistant"><span className="film-speaker">PROOFFLOW · SCRIPTED</span><p>The example review shows pouring and returning the carafe. Stirring is not visible. Select a finding to inspect its video evidence.</p></div>}
          {questionAsked && <><div className="film-chat-user"><span className="film-speaker">YOU</span><p>Why wasn’t stirring observed?</p></div><div className="film-chat-assistant"><span className="film-speaker">PROOFFLOW · SCRIPTED</span><p>The recording shows pouring, the carafe returning to the counter, and the glass at the end. It doesn’t show stirring. That says nothing about what happened outside this clip.</p><button type="button" className="film-inline-evidence" onClick={() => inspect(2)}><Film size={14} aria-hidden="true" />Review the full clip · 0:00–0:24<ArrowRight size={14} aria-hidden="true" /></button></div></>}
        </div>
        <div className="film-chat-composer">{phase === "compose" ? <><span>Example message · auto-typing</span><button type="button" onClick={showPlan} aria-label="Send example request and show plan"><ArrowUp size={18} /></button></> : phase === "review" && !questionAsked ? <button className="film-followup" type="button" onClick={() => { setQuestionAsked(true); inspect(2); }}><CircleHelp size={16} aria-hidden="true" />Why wasn’t stirring observed?<ArrowRight size={14} aria-hidden="true" /></button> : <><span>{phase === "review" ? "Now ask about your own process." : ready ? "Your plan is ready to review." : "Your plan appears beside the conversation."}</span>{phase === "review" && <Link to="/new" aria-label="Start your own ProofFlow conversation"><ArrowRight size={17} /></Link>}</>}{automated && <button type="button" className="film-skip" onClick={() => phase === "verify" ? (setVerificationStep(2), setPhase("review"), setTab("evidence"), setSeek(value => ({ seconds: 9, request: value.request + 1 }))) : showPlan()}>{phase === "verify" ? "Skip to evidence" : "Show the full plan"}<ArrowRight size={13} aria-hidden="true" /></button>}</div>
      </section>
      <section className="film-review-panel" aria-label="Demo plan and verification workspace">
        <div className="film-panel-tabs" role="group" aria-label="Workspace view"><button type="button" aria-pressed={tab === "reference"} onClick={() => setTab("reference")}><Film size={14} aria-hidden="true" />Reference</button><button type="button" disabled={checkCount === 0} aria-pressed={tab === "plan"} onClick={() => setTab("plan")}><FileCheck2 size={14} aria-hidden="true" />Proof Plan{checkCount > 0 && <span>{checkCount}</span>}</button><button type="button" disabled={phase !== "review"} aria-pressed={tab === "evidence"} onClick={() => setTab("evidence")}><Focus size={14} aria-hidden="true" />Evidence</button></div>
        {tab === "plan" ? <div className="film-plan-view"><div className="film-plan-title"><div><span className="home-kicker">{approved ? "FROZEN PLAN · VERSION 1" : "DRAFT PROOF PLAN"}</span><h3>Drink preparation</h3></div><span className="film-plan-status">{approved ? <LockKeyhole size={13} aria-hidden="true" /> : <FileCheck2 size={13} aria-hidden="true" />}{approved ? "Approved" : "Review first"}</span></div><p className="film-plan-intro">Three expectations, each tied to something the camera can show.</p><ol className="film-plan-cards">{demoChecks.slice(0, checkCount).map((check, index) => <li key={check.id}><div><span>0{index + 1}</span><h4>{check.title}</h4><Focus size={16} aria-hidden="true" /></div><div className="film-plan-transition"><span>{check.before}</span><ArrowRight size={15} aria-hidden="true" /><span>{check.after}</span></div></li>)}</ol><div className="film-plan-reference"><img src={demoMedia.poster} alt="The reference recording used to draft the plan" /><span><Film size={15} aria-hidden="true" /><strong>Reference attached</strong><span>Your instructions define the checks; the reference adds context.</span></span></div>{!approved && <div className="film-plan-approval"><p><LockKeyhole size={15} aria-hidden="true" />Approval freezes the plan used by verification.</p><button className="film-primary" type="button" disabled={phase !== "ready"} onClick={() => { setPhase("verify"); setTab("reference"); setPaused(false); setSeek(value => ({ seconds: 6, request: value.request + 1 })); }}><Check size={16} aria-hidden="true" />Approve plan & see verification<ArrowRight size={16} aria-hidden="true" /></button></div>}{approved && <button type="button" className="film-primary" onClick={() => setTab(phase === "review" ? "evidence" : "reference")}>Return to {phase === "review" ? "evidence" : "verification"}<ArrowRight size={16} aria-hidden="true" /></button>}</div> : <div className="film-evidence-view">
          <DemoEvidencePlayer autoPlay={!reducedMotion && visible && !paused && (phase === "reference" || phase === "verify")} annotations={tab === "evidence" || phase === "verify"} seek={seek} onTime={setTime} />
          {phase === "verify" ? <div className="film-analysis-replay"><span className="home-kicker">VERIFICATION WORKFLOW REPLAY</span>{["Find candidate visual events", "Track the relevant objects", "Evaluate against your approved checks"].map((label, index) => <div key={label} data-active={verificationStep === index} data-done={verificationStep > index}><span>{verificationStep > index ? <Check size={13} aria-hidden="true" /> : index + 1}</span><p>{label}</p>{verificationStep === index && <span className="film-progress-dot" />}</div>)}<p>Illustrated sequence, not a live analysis or timing benchmark.</p></div> : tab === "evidence" ? <div className="film-evidence-results"><div className="film-results-header"><span><CheckCheck size={16} aria-hidden="true" />Example findings</span><span>2 observed · 1 not observed</span></div><div className="film-finding-list">{demoChecks.map((check, index) => <button type="button" key={check.id} aria-pressed={selected === index} onClick={() => inspect(index)}><span className={`film-finding-status ${check.status === "Observed" ? "is-observed" : "is-not-observed"}`}>{check.status === "Observed" ? <Check size={13} aria-hidden="true" /> : <CircleHelp size={13} aria-hidden="true" />}{check.status}</span><span>{check.title}</span><span><Play size={11} aria-hidden="true" />{demoTime(check.start)}–{demoTime(check.end)}</span></button>)}</div><div className="film-evidence-detail" aria-live="polite"><img src={current.thumbnail} alt={`Evidence frame for: ${current.title}`} /><div><span className="home-kicker">{time >= current.start && time <= current.end ? "INSPECTING THE EVIDENCE" : "SELECTED EVIDENCE WINDOW"}</span><h4>{current.title}</h4><p>{current.explanation}</p><button type="button" onClick={() => inspect(selected)}>Jump to {demoTime(current.start)}<ArrowRight size={13} aria-hidden="true" /></button></div></div></div> : <div className="film-reference-context"><span className="home-kicker">START WITH WHAT YOU HAVE</span><h3>A video. A photo. A description.</h3><p>The reference provides context. The conversation turns your expectations into a reviewable plan.</p><div><span><Image size={14} aria-hidden="true" />Reference image</span><span><Film size={14} aria-hidden="true" />Short recording</span><span><Sparkles size={14} aria-hidden="true" />Your instructions</span></div>{phase === "ready" && <button type="button" className="film-primary" onClick={() => setTab("plan")}>Review your draft plan<ArrowRight size={16} aria-hidden="true" /></button>}</div>}</div>}
      </section>
    </div><div className="film-demo-status"><span role="status"><span />{paused && automated ? "Demo paused. Resume when you’re ready." : status}</span><Link to="/new">Try your own task<ArrowRight size={14} aria-hidden="true" /></Link></div>
  </div>;
}

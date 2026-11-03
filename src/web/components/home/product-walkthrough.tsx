import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ArrowUp, Check, CheckCheck, ChevronRight, FileCheck2, Focus, Image, LockKeyhole, Minus, Package, Factory, RotateCcw, ScanLine, Sparkles } from "lucide-react";
import { demoScenarios, type DemoId, type DemoScenario } from "./demo-content";
import { DemoSelector } from "./demo-selector";
import "./workspace-demo.css";

type Phase = "describe" | "plan" | "review";

export function ProductWalkthrough({ demoId, onSelect }: { demoId: DemoId; onSelect: (id: DemoId) => void }) {
  const scenario = demoScenarios[demoId];
  return <section id="product-demo" className="home-container packing-demo-section" aria-labelledby="packing-demo-title">
    <div className="section-intro"><div><span className="home-kicker">TWO WORKFLOWS. THE SAME SIMPLE START.</span><h2 id="packing-demo-title">{scenario.heading}</h2></div><p>Choose an example. Describe, approve, then inspect.</p></div>
    <DemoSelector selected={demoId} onSelect={onSelect} label="Walkthrough example" />
    <ScenarioWalkthrough key={demoId} scenario={scenario} />
  </section>;
}

function ScenarioWalkthrough({ scenario }: { scenario: DemoScenario }) {
  const [phase, setPhase] = useState<Phase>("describe");
  const [selected, setSelected] = useState(0);
  const [showBoxes, setShowBoxes] = useState(true);
  const [view, setView] = useState<"image" | "plan">("image");
  const [questionAsked, setQuestionAsked] = useState(false);
  const demoChecks = scenario.checks;
  const Icon = scenario.id === "packing" ? Package : Factory;
  const current = demoChecks[selected]!;
  const approved = phase === "review";
  const stage = phase === "describe" ? 0 : phase === "plan" ? 1 : 2;

  function reset() { setPhase("describe"); setSelected(0); setView("image"); setShowBoxes(true); setQuestionAsked(false); }
  function inspect(index: number) { setSelected(index); setView("image"); setShowBoxes(true); }

  return <div className="packing-demo-window">
      <div className="packing-toolbar"><span><Icon size={18} aria-hidden="true" /><strong>{scenario.title}</strong><span className="packing-demo-badge">Interactive illustration</span></span><button type="button" onClick={reset} aria-label={`Restart ${scenario.id} example`}><RotateCcw size={16} aria-hidden="true" /></button></div>
      <ol className="packing-progress" aria-label="Example workflow">{["Describe", "Approve plan", "Inspect example"].map((label, index) => <li key={label} aria-current={stage === index ? "step" : undefined} data-complete={index < stage}><span>{index < stage ? <Check size={12} aria-hidden="true" /> : index + 1}</span>{label}{index < 2 && <ChevronRight size={13} aria-hidden="true" />}</li>)}</ol>
      <div className="packing-workspace">
        <section className="packing-chat" aria-label={`Scripted ${scenario.label.toLowerCase()} conversation`}>
          <div className="packing-chat-heading"><span><Sparkles size={18} aria-hidden="true" /></span><div><h3>Your plan assistant</h3><p>A little context. A clear plan.</p></div><span className="packing-scripted">Scripted</span></div>
          <div className="packing-messages" aria-live="polite">
            <div className="packing-message packing-message-user"><span className="packing-speaker">YOU</span><button type="button" className="packing-attachment" onClick={() => setView("image")} aria-label={`View ${scenario.label.toLowerCase()} reference image`}><img src={scenario.image} alt="" width={72} height={52} /><span><strong>{scenario.referenceTitle}</strong><span><Image size={11} aria-hidden="true" />Generated reference image</span></span><ArrowUp size={14} aria-hidden="true" /></button><p>{scenario.prompt}</p></div>
            {phase === "describe" ? <div className="packing-message packing-message-assistant"><span className="packing-speaker"><Sparkles size={12} aria-hidden="true" />PROOFFLOW</span><p>Let’s turn that into three visible checks. You’ll review them first.</p></div> : <div className="packing-message packing-message-assistant"><span className="packing-speaker"><Sparkles size={12} aria-hidden="true" />PROOFFLOW</span><p>{approved ? "Your example plan is approved. Select a finding to see the relevant part of the image." : scenario.draftReply}</p><button type="button" className="packing-plan-attachment" onClick={() => setView("plan")}><FileCheck2 size={18} aria-hidden="true" /><span><strong>{scenario.title}</strong><span>3 checks · {approved ? "approved version 1" : "draft plan"}</span></span><ChevronRight size={15} aria-hidden="true" /></button></div>}
            {approved && <div className="packing-chat-approval"><LockKeyhole size={13} aria-hidden="true" />Version 1 approved for this example.</div>}
            {questionAsked && <div className="packing-message packing-message-assistant"><span className="packing-speaker">{scenario.followupQuestion.toUpperCase()}</span><p>{scenario.followupReply}</p></div>}
          </div>
          <div className="packing-composer">{phase === "describe" ? <button type="button" className="packing-send" onClick={() => { setPhase("plan"); setView("plan"); }}>Create example plan<span><ArrowUp size={17} aria-hidden="true" /></span></button> : phase === "plan" ? <button type="button" className="packing-send" onClick={() => setView("plan")}>Review the three checks<span><ArrowRight size={17} aria-hidden="true" /></span></button> : <button type="button" className="packing-followup" onClick={() => { setQuestionAsked(true); inspect(2); }}>{scenario.followupQuestion}<ArrowRight size={15} aria-hidden="true" /></button>}<span>Have a different process? <Link to="/new">Start your own<ArrowRight size={11} aria-hidden="true" /></Link></span></div>
        </section>
        <section className="packing-inspector" aria-label={`${scenario.label} plan and image review`}>
          <div className="packing-view-tabs" role="group" aria-label="Example view"><button type="button" aria-pressed={view === "image"} onClick={() => setView("image")}><Image size={14} aria-hidden="true" />{approved ? "Example evidence" : "Reference image"}</button><button type="button" disabled={phase === "describe"} aria-pressed={view === "plan"} onClick={() => setView("plan")}><FileCheck2 size={14} aria-hidden="true" />Proof Plan{approved && <LockKeyhole size={11} aria-hidden="true" />}</button></div>
          {view === "plan" ? <div className="packing-plan-view"><div className="packing-plan-heading"><span className="home-kicker">{approved ? "APPROVED · VERSION 1" : "YOUR DRAFT PROOF PLAN"}</span><h3>{scenario.title}</h3><p>Three things the camera should be able to show.</p></div><ol className="packing-plan-checks">{demoChecks.map((check, index) => <li key={check.id}><span>0{index + 1}</span><div><h4>{check.title}</h4><p>{check.requirement}</p></div><Focus size={16} aria-hidden="true" /></li>)}</ol><div className="packing-plan-footnote"><LockKeyhole size={14} aria-hidden="true" />Approval freezes this version of the checks.</div>{approved ? <button type="button" className="packing-primary" onClick={() => setView("image")}>Inspect the example<ArrowRight size={16} aria-hidden="true" /></button> : <button type="button" className="packing-primary" onClick={() => { setPhase("review"); setView("image"); }}><Check size={16} aria-hidden="true" />Approve plan & inspect example<ArrowRight size={16} aria-hidden="true" /></button>}</div> : <div className="packing-image-view">
            <div className="packing-image-stage"><img src={scenario.image} alt={scenario.imageAlt} width={1536} height={1024} loading="lazy" />{approved && showBoxes && <div className="packing-object-box" style={{ left: `${current.box.x}%`, top: `${current.box.y}%`, width: `${current.box.width}%`, height: `${current.box.height}%` }} aria-hidden="true"><span>{current.label}</span><i /><i /><i /><i /></div>}<span className="packing-image-caption"><Image size={11} aria-hidden="true" />AI-generated still image</span>{approved && <button type="button" className="packing-toggle-boxes" aria-label="Toggle example annotation" aria-pressed={showBoxes} onClick={() => setShowBoxes(value => !value)}><Focus size={16} aria-hidden="true" /></button>}</div>
            {approved ? <div className="packing-example-review"><div className="packing-results-title"><CheckCheck size={16} aria-hidden="true" /><h3>Illustrative findings</h3><span>Not live analysis</span></div><div className="packing-findings">{demoChecks.map((check, index) => <button type="button" key={check.id} aria-pressed={selected === index} onClick={() => inspect(index)}><span className={check.status === "Observed" ? "packing-status-observed" : "packing-status-missing"}>{check.status === "Observed" ? <Check size={14} aria-hidden="true" /> : <Minus size={14} aria-hidden="true" />}</span><span>{check.title}</span><span>{check.status}</span><Focus size={13} aria-hidden="true" /></button>)}</div><p className="packing-finding-detail" aria-live="polite">{current.explanation}</p></div> : <div className="packing-reference-note"><span><ScanLine size={20} aria-hidden="true" /></span><div><h3>Your process is the starting point.</h3><p>Give the assistant context. Review the checks before any verification.</p></div></div>}
          </div>}
        </section>
      </div>
      <div className="packing-demo-disclosure"><Image size={13} aria-hidden="true" /><p>AI-generated image, scripted chat, and authored annotations. This illustrates the interface; real verification uses your video.</p></div>
    </div>;
}

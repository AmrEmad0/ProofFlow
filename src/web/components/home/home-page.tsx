import { PACK_DEMO } from "../../../shared/demo";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, CircleHelp, Eye, FileCheck2, Film, Focus, Layers3, MessageSquareText, Minus, ScanLine } from "lucide-react";
import { ProductWalkthrough } from "./product-walkthrough";
import { DevelopmentStory, WorkflowExamples } from "./workflow-story";
import { TrackedVideo } from "./tracked-video";
import { type DemoId } from "./demo-content";
import "./home.css";

function Brand() {
  return <Link to="/" className="home-brand" aria-label="ProofFlow home"><span><ScanLine size={21} aria-hidden="true" /></span>ProofFlow<span className="brand-period">.</span></Link>;
}

const questions = [
  { question: "Do I need to train an AI model?", answer: "No. ProofFlow uses existing Muse Spark and SAM 3.1 models. You define and approve a Proof Plan, rather than collecting a training dataset or fine-tuning a model. Hosting and Meta model usage can still incur costs." },
  { question: "Can I use a different workflow?", answer: "Yes. Create a plan for the visible actions and conditions that matter to you. Edit and approve a new version when your procedure changes. Exact counts, measurements, duration guarantees, and hidden outcomes are not supported." },
  { question: "What do I need for a real run?", answer: "An approved Proof Plan and a clear MP4, MOV, or WebM recording, up to 30 seconds and 25 MB. Live features require configured server-side Meta model access. The homepage plays a prerecorded tracked video. Interactive examples use AI-generated still images, scripted chat, and authored annotations. Neither performs live verification." },
  { question: "What if the camera doesn’t show enough?", answer: "A finding can be uncertain. Missing tracks and hidden actions do not prove something never happened. Each run uses the frozen plan you approved, with video evidence for you to inspect." },
];

export function HomePage() {
  const [demoId, setDemoId] = useState<DemoId>("packing");
  return <div className="proof-home">
    <header className="home-header home-container"><Brand /><nav aria-label="Main navigation"><a href="#why-proofflow">Why ProofFlow</a><a href="#product-demo">See it work</a><a href="#workflows">Use cases</a></nav><Link to="/new" className="home-button home-button-dark home-nav-cta">Open ProofFlow<ArrowRight size={16} aria-hidden="true" /></Link></header>
    <main id="main-content">
      <section className="home-hero home-container">
        <div className="home-hero-copy"><div className="hero-eyebrow"><span />VISUAL AI FOR EVERYDAY WORK</div><h1>Your workflow.<br />Your know-how.<br /><span>Now, checkable.</span></h1><p>Turn the procedures you know into visual checks. Describe the task, approve the plan, and review your video evidence.</p><div className="hero-actions"><Link to="/new" className="home-button home-button-primary">Create your Proof Plan<ArrowRight size={17} aria-hidden="true" /></Link><Link to="/plans/$planId" params={{ planId: PACK_DEMO.planId }} className="home-button home-button-outline">Try the example<ArrowRight size={16} aria-hidden="true" /></Link></div><div className="hero-footnote"><span><Check size={14} aria-hidden="true" />No custom model training</span><span><Check size={14} aria-hidden="true" />No labeled training dataset required</span></div></div>
        <TrackedVideo />
      </section>
      <div className="home-model-strip home-container"><span>POWERED BY META MODELS</span><div><span className="meta-mark" aria-hidden="true">∞</span><strong>Muse Spark</strong><span className="model-strip-plus">+</span><Focus size={19} aria-hidden="true" /><strong>SAM 3.1</strong></div><p>Existing models. Your procedure.</p></div>
      <DevelopmentStory />
      <section id="how-it-works" className="home-container home-how-rail" aria-label="How ProofFlow works">{[{ icon: MessageSquareText, title: "Describe the task", text: "Your words. Your procedure." }, { icon: FileCheck2, title: "Approve the plan", text: "You decide what to check." }, { icon: Film, title: "Inspect the evidence", text: "See what your video supports." }].map(({ icon: Icon, title, text }, index) => <div key={title}><span className="home-how-icon"><Icon size={21} aria-hidden="true" /></span><span><span className="home-how-number">0{index + 1}</span><h2>{title}</h2><p>{text}</p></span>{index < 2 && <ArrowRight size={18} aria-hidden="true" />}</div>)}</section>
      <ProductWalkthrough demoId={demoId} onSelect={setDemoId} />
      <WorkflowExamples />
      <section className="home-evidence-section"><div className="home-container home-evidence-grid"><div className="evidence-copy"><span className="home-kicker">EVIDENCE YOU CAN INSPECT</span><h2>A finding you can<br />look into.</h2><p>Open the moments and object tracks behind a finding. Keep human judgment in the loop.</p><div className="evidence-model-flow" aria-label="How the evidence is produced"><span><MessageSquareText size={19} aria-hidden="true" /><strong>Muse Spark</strong><small>Proposes events</small></span><ArrowRight size={15} aria-hidden="true" /><span><Focus size={19} aria-hidden="true" /><strong>SAM 3.1</strong><small>Tracks objects</small></span><ArrowRight size={15} aria-hidden="true" /><span><Layers3 size={19} aria-hidden="true" /><strong>ProofFlow</strong><small>Evaluates evidence</small></span></div><span className="evidence-principle"><Eye size={16} aria-hidden="true" />Visible evidence, with room for uncertainty.</span></div><div className="home-verdicts"><div className="verdicts-heading"><ScanLine size={17} aria-hidden="true" />Three ways to describe the evidence</div>{[{ icon: Check, title: "Observed", className: "observed", text: "The available visual evidence supports the check." }, { icon: Minus, title: "Not observed", className: "not-observed", text: "Not seen in the evidence. It may have happened out of view." }, { icon: CircleHelp, title: "Uncertain", className: "uncertain", text: "The view is incomplete, ambiguous, or conflicting." }].map(({ icon: Icon, title, className, text }) => <div className="home-verdict" key={title}><span className={`verdict-icon ${className}`}><Icon size={18} aria-hidden="true" /></span><div><h3>{title}</h3><p>{text}</p></div></div>)}</div></div></section>
      <section id="questions" className="home-container home-questions"><div><span className="home-kicker">GOOD TO KNOW</span><h2>A clearer picture.</h2><p>Start with one visible procedure.</p></div><div className="home-faq">{questions.map(({ question, answer }) => <details key={question}><summary>{question}<span aria-hidden="true">+</span></summary><p>{answer}</p></details>)}</div></section>
      <section className="home-container home-final-section"><div className="home-final-cta"><span className="final-scan" aria-hidden="true"><ScanLine size={110} strokeWidth={.7} /></span><div><span className="home-kicker">SMALL BUSINESS. SMALL TEAM. YOU.</span><h2>You know the work.<br />Start with that.</h2><p>One procedure. Your own Proof Plan. No custom model training.</p><Link to="/new" className="home-button home-button-primary">Create your Proof Plan<ArrowRight size={17} aria-hidden="true" /></Link></div></div></section>
    </main><footer className="home-footer home-container"><Brand /><p>Describe your process. Review the evidence.</p><a href="#questions">Questions<ArrowRight size={14} aria-hidden="true" /></a></footer>
  </div>;
}

import { ArrowRight, Check, Cpu, FileCheck2, ImagePlus, MessageSquareText, Package, ScanLine, SlidersHorizontal, Tag, Wrench } from "lucide-react";
import { demoMedia, demoScenarios, type DemoId } from "./demo-content";
import { DemoSelector } from "./demo-selector";

const developmentWork = [
  { icon: ImagePlus, title: "Collect", cost: "Training footage", className: "data" },
  { icon: Tag, title: "Label", cost: "Annotation time", className: "labels" },
  { icon: Cpu, title: "Train", cost: "Expertise + compute", className: "compute" },
  { icon: SlidersHorizontal, title: "Maintain", cost: "Ongoing evaluation", className: "maintenance" },
];

export function WorkflowIllustration({ demoId, onSelect }: { demoId: DemoId; onSelect: (id: DemoId) => void }) {
  const scenario = demoScenarios[demoId];
  return <div className="workflow-hero-examples">
    <DemoSelector selected={demoId} onSelect={onSelect} label="Hero example" />
    <div className="workflow-hero-visual">
      <div className="workflow-photo"><img src={scenario.image} alt={scenario.imageAlt} width={1536} height={1024} fetchPriority="high" /><span className="workflow-photo-label"><ScanLine size={13} aria-hidden="true" />A WORKFLOW YOU ALREADY KNOW</span><span className="workflow-photo-credit">AI-generated illustration</span></div>
      <div className="workflow-floating-prompt"><span><MessageSquareText size={15} aria-hidden="true" />IN YOUR WORDS</span><p>“{scenario.heroPrompt}”</p></div>
      <a href="#product-demo" className="workflow-floating-plan"><span className="workflow-plan-symbol"><FileCheck2 size={23} aria-hidden="true" /></span><span><strong>{scenario.title}</strong><span>3 checks. Ready for your review.</span></span><ArrowRight size={18} aria-hidden="true" /></a>
    </div>
  </div>;
}

export function DevelopmentStory() {
  return <section id="why-proofflow" className="home-section home-container home-development" aria-labelledby="development-title">
    <div className="section-intro"><div><span className="home-kicker">SKIP THE CUSTOM TRAINING PROJECT</span><h2 id="development-title">Your workflow shouldn’t need<br />an AI development budget.</h2></div><p>Custom computer vision can mean data, specialists, and compute. ProofFlow starts with the procedure you know.</p></div>
    <div className="development-comparison">
      <div className="development-custom"><div className="development-route-label"><span />CUSTOM MODEL DEVELOPMENT</div><div className="development-pipeline">{developmentWork.map(({ icon: Icon, title, cost, className }, index) => <div className="development-node" key={title}><div className={`development-mini ${className}`} aria-hidden="true">{className === "data" ? <><i /><i /><i /><ImagePlus size={21} /></> : className === "labels" ? <><span className="mini-label-box" /><Tag size={22} /></> : className === "compute" ? <><Cpu size={34} /><i /><i /><i /></> : <><SlidersHorizontal size={30} /><span className="mini-maintenance-line" /></>}</div><h3><Icon size={13} aria-hidden="true" />{title}</h3><p>{cost}</p>{index < 3 && <ArrowRight className="development-node-arrow" size={15} aria-hidden="true" />}</div>)}</div></div>
      <div className="development-proofflow"><div className="development-route-label"><span />THE PROOFFLOW STARTING POINT</div><div className="development-simple"><span className="development-chat-icon"><MessageSquareText size={32} strokeWidth={1.4} aria-hidden="true" /></span><p>“Here’s how<br />we do it.”</p><ArrowRight size={22} aria-hidden="true" /><span className="development-plan-icon"><FileCheck2 size={31} strokeWidth={1.4} aria-hidden="true" /><span>Your Proof Plan</span></span></div><div className="development-benefits"><span><Check size={12} aria-hidden="true" />No training dataset</span><span><Check size={12} aria-hidden="true" />No model to retrain</span></div></div>
    </div>
  </section>;
}

export function WorkflowExamples() {
  return <section id="workflows" className="home-section home-container home-workflow-examples" aria-labelledby="workflows-title">
    <div className="section-intro"><div><span className="home-kicker">BUILT AROUND YOUR PROCEDURE</span><h2 id="workflows-title">For your business.<br />And your own projects.</h2></div><p>One platform. A different plan for each visible task.</p></div>
    <div className="workflow-examples-grid">
      <article className="workflow-example"><div className="workflow-example-photo"><img src={demoMedia.packing} alt="AI-generated example of a small business packing station" width={1536} height={1024} loading="lazy" /><span><Package size={14} aria-hidden="true" />SMALL BUSINESSES & TEAMS</span></div><div className="workflow-example-copy"><h3>Make your routine checkable.</h3><p>Packing an order. Preparing a station. Setting up the next job.</p><div className="workflow-example-tags"><span>Product visible</span><span>Slip visible</span><span>Box closed</span></div></div></article>
      <article className="workflow-example"><div className="workflow-example-photo"><img src={demoMedia.workbench} alt="AI-generated maker workbench with tools in a tray and an open drawer" width={1536} height={1024} loading="lazy" /><span><Wrench size={14} aria-hidden="true" />MAKERS & INDIVIDUALS</span></div><div className="workflow-example-copy"><h3>Bring your own way of working.</h3><p>Resetting a workspace. Putting tools away. Following a personal checklist.</p><div className="workflow-example-tags"><span>Tools in tray</span><span>Drawer closed</span></div></div></article>
    </div>
    <p className="workflow-reuse-note">Illustrative use cases and AI-generated images. Define visible checks; update the plan without retraining.</p>
  </section>;
}

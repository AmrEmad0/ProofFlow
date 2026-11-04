import { ArrowRight, ClipboardCheck, ScanEye, Sparkles, Video } from "lucide-react";

const examples = [
  {
    image: { src: "/images/planner-workflows.webp", panel: 0 },
    reviewNote: null,
    title: "Pack an order", category: "Order fulfillment", detail: "Product in. Receipt in. Box closed.",
    prompt: "Put the product in the box, add the receipt, then close the box.",
    checks: ["Product moves into the box", "Receipt is added", "Box changes from open to closed"],
    filming: "Keep the box opening in view so each item entering it is visible.",
  },
  {
    image: { src: "/images/planner-workflows.webp", panel: 1 },
    reviewNote: null,
    title: "Prepare a takeaway order", category: "Food service", detail: "Lid on. Food and napkin packed.",
    prompt: "Fit the lid onto the takeaway cup, place the wrapped sandwich and a napkin in the paper bag, then fold the top of the bag closed.",
    checks: ["Lid is fitted onto the cup", "Wrapped sandwich and napkin go into the bag", "Bag top is folded closed"],
    filming: "Keep the cup and bag opening visible. Show each item before it goes in, then show the folded bag top.",
  },
  {
    image: { src: "/images/planner-single-tray.webp", panel: null },
    title: "Review assembly-line kits", category: "Overhead line inspection", detail: "One tray per clip. Review possible missing parts.",
    prompt: "Review the kit tray in this inspection clip before sealing. It should contain one metal housing, one orange gasket, and two metal brackets. Flag any missing or unclear items for review.",
    checks: ["One metal housing", "One orange gasket", "Two metal brackets"],
    filming: "Capture one tray per inspection clip from above, with the entire tray and its compartments clearly visible.",
    reviewNote: "Review the captured tray alongside its video evidence before it moves to the next station. If a compartment is blocked from view, its result stays uncertain so you can decide what needs a closer look.",
  },
];

export function PlannerExamples({ input, disabled, onSelect }: { input: string; disabled: boolean; onSelect: (prompt: string) => void }) {
  const selected = examples.find(example => example.prompt === input);
  return <div className="process-examples">
    <div className="process-examples-heading"><h2>Start with a real-world task</h2><span>Choose one to try</span></div>
    <div className="process-example-grid">{examples.map(example => <button type="button" key={example.title} disabled={disabled} onClick={() => onSelect(example.prompt)} className="process-example" aria-label={`Use example: ${example.title}`} aria-pressed={selected === example}>
      <span className="process-example-art" aria-hidden="true"><img src={example.image.src} alt="" width={example.image.panel === null ? 1254 : 2048} height={example.image.panel === null ? 1254 : 683} style={{ left: `${(example.image.panel ?? 0) * -100}%`, width: example.image.panel === null ? "100%" : "300%" }} /></span>
      <span className="process-example-copy"><span className="process-example-category">{example.category}</span><span className="process-example-title">{example.title}<ArrowRight className="size-3.5" aria-hidden="true" /></span><span className="process-example-description">{example.detail}</span></span>
    </button>)}</div>
    <p className="process-art-note">AI-generated illustrations · Select an example to customize it</p>
    {selected && <div className="process-example-preview" role="region" aria-label={`${selected.title} example guide`}>
      <p className="text-xs font-semibold">{selected.reviewNote ? "Expected in each tray" : "What to make visible"}</p>
      <ol>{selected.checks.map((check, index) => <li key={check}><span>{index + 1}</span>{check}</li>)}</ol>
      <p className="process-filming-tip"><Video className="size-4 shrink-0" aria-hidden="true" /><span>{selected.filming}</span></p>
      {selected.reviewNote && <div className="mt-3 rounded-lg border border-primary/15 bg-card p-3"><p className="text-xs font-semibold">Focus on kits that need attention</p><p className="mt-1 text-[12px] leading-5 text-muted-foreground">{selected.reviewNote}</p></div>}
    </div>}
  </div>;
}

export function PlannerHowItWorks() {
  return <section className="planner-how" aria-labelledby="planner-how-title">
    <div className="planner-how-heading"><span className="planner-how-eyebrow">FROM INSTRUCTIONS TO EVIDENCE</span><h2 id="planner-how-title">Your process. A plan. Moments you can inspect.</h2><p>Decide what matters before the video is checked.</p></div>
    <ol className="planner-how-grid">{[
      { Icon: Sparkles, title: "Describe the task", text: "Name the objects and visible actions. Muse Spark helps turn your instructions into a draft plan." },
      { Icon: ClipboardCheck, title: "Review & approve", text: "Edit the checks and filming details. Your approval freezes the plan version used for verification." },
      { Icon: ScanEye, title: "Add video. Inspect evidence.", text: "Muse Spark proposes events and SAM 3.1 tracks objects. ProofFlow evaluates the evidence against your checks." },
    ].map(({ Icon, title, text }, index) => <li key={title}><span className="planner-how-icon"><Icon className="size-4" aria-hidden="true" /></span><span className="planner-how-number">0{index + 1}</span><h3>{title}</h3><p>{text}</p></li>)}</ol>
    <div className="planner-evidence-note"><span className="planner-evidence-label">A result you can question</span><p>Review findings as <strong>observed</strong>, <strong>not observed</strong>, or <strong>uncertain</strong>, with video moments to inspect. An obstructed view or lost track can leave a check uncertain; video cannot prove hidden outcomes.</p></div>
  </section>;
}

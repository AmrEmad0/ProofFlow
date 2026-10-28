import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ClipboardCheck, Film, MessageSquare, Package, ScanLine } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export const Route = createFileRoute("/")({ component: HomePage });

const steps = [
  { icon: MessageSquare, title: "Describe the task", text: "Start a new plan and explain what should happen on camera. Include the objects involved and the visible result you expect." },
  { icon: ClipboardCheck, title: "Review and approve", text: "Refine the checks with the assistant or edit them yourself. Approve the plan when it matches your task. Approval freezes the version used for verification." },
  { icon: Film, title: "Upload and inspect", text: "Upload a video using your approved plan. Review each finding alongside its video evidence, then reuse the same checks for another video." },
];

function HomePage() {
  return <div className="mx-auto max-w-6xl px-5 sm:px-8">
    <header className="flex min-h-20 flex-wrap items-center justify-between gap-4 border-b py-4">
      <Link to="/" className="flex items-center gap-2.5 text-lg font-semibold tracking-tight" aria-label="ProofFlow home"><span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"><ScanLine className="size-5" aria-hidden="true" /></span>ProofFlow</Link>
      <nav aria-label="Main navigation" className="flex items-center gap-5"><a href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground">How to use it</a><Link to="/new" className={buttonVariants({ className: "h-11" })}>New plan<ArrowRight aria-hidden="true" /></Link></nav>
    </header>
    <main id="main-content" className="pb-16">
      <section className="max-w-3xl pt-14 pb-12 sm:pt-20 sm:pb-16">
        <p className="mb-5 text-sm font-medium text-primary">From a task to reviewable video evidence</p>
        <h1 className="text-4xl leading-tight font-semibold tracking-tight sm:text-5xl">Define what should happen.<br />See what the video shows.</h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">ProofFlow turns your task into a Proof Plan: a checklist of visible actions and outcomes. Approve the checks, upload your video, and inspect the evidence for each finding.</p>
        <div className="mt-8 flex flex-wrap gap-3"><Link to="/new" className={buttonVariants()}>Create a new plan<ArrowRight aria-hidden="true" /></Link><Link to="/packproof" className={buttonVariants({ variant: "outline" })}><Package aria-hidden="true" />Try the box packing example</Link></div>
      </section>
      <section id="how-it-works" className="scroll-mt-6 border-t py-10">
        <h2 className="text-2xl font-semibold tracking-tight">Your first verification, step by step</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-3">{steps.map(({ icon: Icon, title, text }, index) => <li key={title} className="rounded-2xl border bg-card p-6"><div className="mb-6 flex items-center justify-between"><Icon className="size-6 text-primary" aria-hidden="true" /><span className="text-sm text-muted-foreground">0{index + 1}</span></div><h3 className="text-lg font-semibold">{title}</h3><p className="mt-3 leading-7 text-muted-foreground">{text}</p></li>)}</ol>
      </section>
      <section className="grid gap-8 rounded-2xl border bg-card p-6 sm:p-8 md:grid-cols-2">
        <div><h2 className="text-xl font-semibold">Write checks the camera can answer</h2><p className="mt-3 leading-7 text-muted-foreground">Be specific about what changes. For example: “Place the item inside the box, then close the lid.” Keep the relevant objects and actions visible throughout the recording.</p><p className="mt-3 leading-7 text-muted-foreground">Saved plans stay in the workspace sidebar. Open one to review its checks or verify another video. Choose Make changes to edit approved checks. Only saving changed checks creates a draft that needs approval again.</p></div>
        <div><h2 className="text-xl font-semibold">Understand the findings</h2><dl className="mt-3 space-y-3 leading-7"><div><dt className="font-medium">Observed</dt><dd className="text-muted-foreground">The visual evidence supports the check. Open the linked evidence to inspect it.</dd></div><div><dt className="font-medium">Not observed</dt><dd className="text-muted-foreground">The check was not observed in the available video evidence.</dd></div><div><dt className="font-medium">Uncertain</dt><dd className="text-muted-foreground">The evidence is insufficient or ambiguous. A missed track alone does not prove an action never happened.</dd></div></dl></div>
      </section>
      <p className="mt-6 max-w-3xl text-sm leading-6 text-muted-foreground">Muse Spark proposes visual events, SAM 3.1 tracks object geometry, and ProofFlow evaluates the evidence. Findings describe what is visible; they do not certify hidden contents or outcomes outside the camera’s view.</p>
    </main>
    <footer className="border-t py-6 text-sm text-muted-foreground">Powered by Meta Muse Spark & SAM 3.1</footer>
  </div>;
}

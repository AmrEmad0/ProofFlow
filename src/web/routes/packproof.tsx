import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { packproofQuery } from "@/lib/queries";

export const Route = createFileRoute("/packproof")({ component: Packproof });

function Packproof() {
  const template = useQuery(packproofQuery);
  return (
    <div className="mx-auto max-w-2xl space-y-7">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft className="size-4" aria-hidden="true" />Back</Link>
      {template.isPending ? <Skeleton className="h-64 w-full" aria-label="Loading plan" /> : template.isError ? <p role="alert">{template.error.message}</p> : <>
        <div className="space-y-3"><Badge variant="outline">Template · awaiting human review</Badge><h1 className="text-3xl font-semibold tracking-tight">{template.data.title}</h1><p className="text-muted-foreground">{template.data.goal}</p></div>
        <ol className="space-y-4">{template.data.steps.map((step, index) => <li key={step.id}>
          <Card><CardHeader><CardTitle>{index + 1}. {step.label}</CardTitle></CardHeader><CardContent className="space-y-3 text-sm"><p>{step.observableEvidence}</p><p className="text-muted-foreground">Track: {step.subjectConcept}{step.targetConcept ? ` → ${step.targetConcept}` : ""}</p></CardContent></Card>
        </li>)}</ol>
        <section className="rounded-lg border bg-background p-5"><h2 className="mb-3 text-sm font-semibold">What this plan can establish</h2><ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">{template.data.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul></section>
        <p className="text-sm text-muted-foreground">Plan editing, approval, video upload, and evidence analysis are coming next. No analysis has run.</p>
      </>}
    </div>
  );
}

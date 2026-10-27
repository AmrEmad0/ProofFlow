import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Package, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { healthQuery } from "@/lib/queries";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  const health = useQuery(healthQuery);
  return (
    <div className="space-y-10">
      <section className="max-w-2xl space-y-5">
        <Badge variant="outline">Early development</Badge>
        <h1 className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">Make the visible<br />evidence clear.</h1>
        <p className="max-w-xl text-base leading-relaxed text-muted-foreground">Define what a recording should show. Review a short proof plan and its limits before recording your evidence.</p>
        <Link to="/packproof" className={buttonVariants({ size: "lg" })}>Explore PackProof <ArrowUpRight aria-hidden="true" /></Link>
      </section>
      <div className="grid gap-5 md:grid-cols-2">
        <Card>
          <CardHeader><Package className="mb-2 size-6" aria-hidden="true" /><CardTitle>A clear packing plan</CardTitle><CardDescription>Product in. Packing slip in. Box closed.</CardDescription></CardHeader>
          <CardContent className="text-sm leading-relaxed text-muted-foreground">Explore three observable checks and the evidence each one needs. A template is a starting point for human review.</CardContent>
        </Card>
        <Card>
          <CardHeader><Video className="mb-2 size-6" aria-hidden="true" /><CardTitle>Keep the action visible</CardTitle><CardDescription>Up to 20 seconds · 25 MB · 3 steps</CardDescription></CardHeader>
          <CardContent className="text-sm leading-relaxed text-muted-foreground">Hidden actions and occluded objects can leave a result uncertain. Video upload and analysis are still being built.</CardContent>
        </Card>
      </div>
      <p className="text-xs text-muted-foreground" role="status">
        {health.isPending ? "Checking service readiness…" : health.isError ? health.error.message : "API, SQLite, FFmpeg, and FFprobe are ready."}
      </p>
    </div>
  );
}

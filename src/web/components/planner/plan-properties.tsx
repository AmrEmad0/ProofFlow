import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { SavedPlan } from "../../../shared/planner";
import { LIMITS, trackedConcepts } from "../../../shared/proof-plan";

export function PlanProperties({ saved, open, onOpenChange, pending, onRevise }: { saved: SavedPlan | null; open: boolean; onOpenChange: (open: boolean) => void; pending: boolean; onRevise: () => void }) {
  const plan = saved?.plan;
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[85dvh] overflow-y-auto p-6 sm:max-w-lg">
      <DialogTitle className="pr-10 text-lg font-semibold">About this plan</DialogTitle>
      <DialogDescription>{plan?.title ?? "Untitled plan"}</DialogDescription>
      <dl className="grid grid-cols-2 gap-x-5 gap-y-4 border-y py-4 text-sm">
        <div><dt className="text-xs text-muted-foreground">Status</dt><dd className="mt-1 font-medium">{saved?.status === "approved" ? "Approved · ready to use" : "Draft"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Version</dt><dd className="mt-1 font-medium">{saved?.version ?? "No checks yet"}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Checks</dt><dd className="mt-1 font-medium">{plan?.steps.length ?? 0}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Video limit</dt><dd className="mt-1 font-medium">{LIMITS.durationMs / 1000} sec · {LIMITS.uploadBytes / 1024 / 1024} MB</dd></div>
        {saved?.approvedAt && <div className="col-span-2"><dt className="text-xs text-muted-foreground">Approved</dt><dd className="mt-1">{new Date(saved.approvedAt).toLocaleString()}</dd></div>}
      </dl>
      {plan && <>
        <div><h3 className="mb-2 text-xs font-medium text-muted-foreground">Task</h3><p className="text-sm leading-6">{plan.goal}</p></div>
        <div><h3 className="mb-2 text-xs font-medium text-muted-foreground">Items in the video</h3><div className="flex flex-wrap gap-2">{trackedConcepts(plan).map((concept) => <span key={concept} className="rounded-md border bg-muted/30 px-2 py-1 text-xs">{concept}</span>)}</div></div>
      </>}
      {saved?.status === "approved" ? <><p className="text-sm leading-6 text-muted-foreground">Changes open a new draft. Earlier videos keep their approved checks.</p><Button onClick={() => { onOpenChange(false); onRevise(); }} disabled={pending} variant="outline" className="mt-2">Make changes</Button></> : <p className="text-sm text-muted-foreground">Choose Change beside a check to edit it, or ask the assistant for help.</p>}
    </DialogContent>
  </Dialog>;
}

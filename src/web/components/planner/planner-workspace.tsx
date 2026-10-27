import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/eden";
import { apiError, plannerStatusQuery, plansQuery, savedPlanQuery } from "@/lib/queries";
import { savedPlanSchema, type SavedPlan } from "../../../shared/planner";
import { packproofTemplate } from "../../../shared/packproof";
import { PlanPreview } from "./plan-preview";
import { PlannerChat } from "./planner-chat";
import { VerificationWorkspace } from "../verification/verification-workspace";

type Action = { type: "create"; template: "blank" | "packproof" } | { type: "send"; message: string } | { type: "approve" } | { type: "revise" };

function lastTemplate(): string | null {
  try { return localStorage.getItem("proofflow.activeTemplate"); } catch { return null; }
}

export function PlannerWorkspace({ initialStarter = false }: { initialStarter?: boolean }) {
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(() => initialStarter ? null : lastTemplate());
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [view, setView] = useState<"plan" | "video">("plan");
  const heading = useRef<HTMLHeadingElement>(null);
  const health = useQuery(plannerStatusQuery);
  const templates = useQuery(plansQuery);
  const current = useQuery(savedPlanQuery(activeId));
  const saved = current.data ?? null;
  const configured = health.data?.configured ?? false;

  function select(id: string | null, keepInput = false) {
    setActiveId(id);
    setError(null);
    if (!keepInput) { setInput(""); setView("plan"); }
    try {
      if (id) localStorage.setItem("proofflow.activeTemplate", id);
      else localStorage.removeItem("proofflow.activeTemplate");
    } catch { /* Saved templates remain available through the workspace list. */ }
  }

  function remember(value: SavedPlan) {
    queryClient.setQueryData(savedPlanQuery(value.id).queryKey, value);
    select(value.id, true);
    void queryClient.invalidateQueries({ queryKey: plansQuery.queryKey, exact: true });
  }

  async function create(template: "blank" | "packproof") {
    const { data, error: failure } = await api.api.plans.post({ template });
    if (failure) throw apiError(failure.value, "Your template could not be created.");
    const value = savedPlanSchema.parse(data);
    remember(value);
    return value;
  }

  const mutation = useMutation({
    mutationFn: async (action: Action) => {
      setError(null);
      if (action.type === "create") return create(action.template);
      let target = saved;
      if (!target && action.type === "send" && !activeId) target = await create(initialStarter ? "packproof" : "blank");
      if (!target) throw new Error("Load or create a template to continue.");
      const endpoint = api.api.plans({ id: target.id });
      const response = action.type === "send"
        ? await endpoint.messages.post({ message: action.message, revision: target.revision })
        : action.type === "revise"
          ? await endpoint.revise.post({ revision: target.revision })
          : await endpoint.approve.post({ revision: target.revision, contractHash: target.contractHash ?? "" });
      if (response.error) throw apiError(response.error.value, "Your change could not be saved. Please try again.");
      return savedPlanSchema.parse(response.data);
    },
    onSuccess: (value, action) => {
      remember(value);
      if (action.type === "create") setInput("");
    },
    onError: (failure) => setError(failure instanceof Error ? failure.message : "Your change could not be saved."),
    retry: false,
  });

  const pending = mutation.isPending;
  const sending = pending && mutation.variables?.type === "send";
  const loading = Boolean(activeId) && current.isPending;
  const starter = !saved && !activeId && initialStarter;
  const displayedError = error ?? (current.isError ? current.error.message : health.isError ? health.error.message : null);

  function act(action: Action) { mutation.mutate(action); }

  const approved = saved?.status === "approved";
  const hasPlan = Boolean(saved?.plan || starter);
  const videoView = approved && view === "video";
  const step = videoView ? 2 : hasPlan ? 1 : 0;

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [approved, hasPlan, view]);

  return (
    <div className="workspace-enter mx-auto max-w-6xl">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="relative flex min-w-0 max-w-80 flex-1 items-center gap-2">
          <label htmlFor="saved-templates" className="sr-only">Open a saved template</label>
          <select id="saved-templates" value={activeId ?? ""} onChange={(event) => select(event.target.value || null)} disabled={pending} className="w-full min-w-0 appearance-none truncate rounded-md bg-transparent py-2 pl-1 pr-7 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <option value="">{starter ? "Box packing example" : "New plan"}</option>
            {templates.data?.map((template) => <option key={template.id} value={template.id}>{template.title}{template.status === "approved" ? " · Approved" : " · Draft"}</option>)}
          </select>
          <ChevronDown className="pointer-events-none absolute right-1 size-4 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="sr-only text-xs text-muted-foreground sm:not-sr-only" role="status">{pending ? "Saving…" : saved ? "Saved" : ""}</span>
          <Button variant="outline" disabled={pending} onClick={() => { select(null); if (initialStarter) act({ type: "create", template: "blank" }); }} className="h-9 gap-1.5 bg-card px-3 text-xs"><Plus className="size-3.5" />New plan</Button>
        </div>
      </div>
      <ol className="workflow-steps mb-6" aria-label="Verification progress">
        {["Create plan", "Review checks", "Verify video"].map((label, index) => (
          <li key={label} aria-current={step === index ? "step" : undefined} className={`${step === index ? "is-current" : step > index ? "is-complete" : ""} ${approved && index === 1 ? "is-approved" : ""}`}>
            {approved && index > 0 && index !== step ? <button aria-label={label} disabled={pending} onClick={() => setView(index === 2 ? "video" : "plan")} className="flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"><span className="step-number">{step > index || index === 1 ? <Check className="size-3.5" aria-hidden="true" /> : index + 1}</span>{label}</button> : <span className="flex items-center gap-2"><span className="step-number">{step > index || (approved && index === 1) ? <Check className="size-3.5" aria-hidden="true" /> : index + 1}</span>{label}</span>}
          </li>
        ))}
      </ol>
      <div className="mb-6">
        <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none sm:text-3xl">{videoView ? "Verify your video" : approved ? "Your plan is ready" : hasPlan ? "Review your checks" : "What should the video show?"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{videoView ? "Upload a recording of the approved checks." : approved ? "Add a video to check it against this plan." : hasPlan ? "Check the actions below, then approve your plan." : "Describe the task. We’ll turn it into visible checks."}</p>
      </div>
      {templates.isError && <p role="alert" className="mb-4 text-sm text-destructive">{templates.error.message} <button className="underline underline-offset-2" onClick={() => void templates.refetch()}>Retry</button></p>}
      {displayedError && (approved || loading) && <p role="alert" className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{displayedError}</p>}
      {loading ? <Skeleton className="h-96 rounded-2xl" aria-label="Loading saved plan" /> : videoView ? <VerificationWorkspace key={saved.versionId} saved={saved} /> : <div className={approved ? "mx-auto max-w-3xl" : hasPlan ? "grid items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" : "mx-auto max-w-2xl"}>
        {hasPlan && <PlanPreview key={`${activeId}-${saved?.revision ?? "preview"}`} saved={saved} starter={starter ? packproofTemplate : null} pending={pending || current.isError} onApprove={() => act({ type: "approve" })} onRevise={() => act({ type: "revise" })} onUseStarter={() => act({ type: "create", template: "packproof" })} onVerify={() => setView("video")} />}
        {!approved && <PlannerChat saved={saved} starter={starter} pending={pending} sending={sending} pendingMessage={sending && mutation.variables?.type === "send" ? mutation.variables.message : null} configured={configured} error={displayedError} input={input} onInputChange={setInput} onSend={async (message) => { await mutation.mutateAsync({ type: "send", message }); }} onStarter={() => act({ type: "create", template: "packproof" })} onReload={() => { setError(null); void current.refetch(); }} />}
      </div>}
      {current.isError && <Button variant="outline" className="mt-3 h-9 gap-2" onClick={() => select(null)}><RotateCcw className="size-3.5" />Back to a new plan</Button>}
      <footer className="mt-8 pb-2 text-center text-xs text-muted-foreground">Powered by Meta Muse Spark & SAM 3.1</footer>
    </div>
  );
}

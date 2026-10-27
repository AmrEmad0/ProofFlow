import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { withFeedback } from "@/lib/feedback";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { api } from "@/lib/eden";
import { apiError, plannerStatusQuery, planRunsQuery, plansQuery, savedPlanQuery } from "@/lib/queries";
import { deletePlanResultSchema, savedPlanSchema, type EditableCheck, type SavedPlan } from "../../../shared/planner";
import { packproofTemplate } from "../../../shared/packproof";
import { PlanPreview } from "./plan-preview";
import { PlannerChat } from "./planner-chat";
import { PlanProperties } from "./plan-properties";
import { DeletePlanDialog } from "./delete-plan-dialog";
import { WorkspaceSidebar } from "../workspace/workspace-sidebar";
import { WorkspaceSettings } from "../workspace/workspace-settings";
import { VerificationWorkspace } from "../verification/verification-workspace";

type Action = { type: "create"; template: "blank" | "packproof" } | { type: "send"; message: string } | { type: "approve" } | { type: "revise" } | { type: "copy" } | { type: "edit"; steps: EditableCheck[] } | { type: "restore"; versionId: string };

const actionFeedback = {
  create: { loading: "Creating draft…", success: "Draft created", error: "Couldn’t create draft" },
  send: { loading: "Working on your plan…", success: "Reply received", error: "Couldn’t send message" },
  approve: { loading: "Approving plan…", success: "Plan approved", error: "Couldn’t approve plan" },
  revise: { loading: "Creating draft…", success: "New draft created", error: "Couldn’t create draft" },
  copy: { loading: "Copying your checks…", success: "Copy ready to change", error: "Couldn’t copy plan" },
  edit: { loading: "Saving your checks…", success: "Checks saved", error: "Couldn’t save checks" },
  restore: { loading: "Undoing the change…", success: "Previous checks restored", error: "Couldn’t undo the change" },
};

function lastTemplate(): string | null {
  try { return localStorage.getItem("proofflow.activeTemplate"); } catch { return null; }
}

function rememberedMessage(id: string | null): string {
  try { return sessionStorage.getItem(`proofflow.message.${id ?? "new"}`) ?? ""; } catch { return ""; }
}

function rememberMessage(id: string | null, message: string) {
  try {
    const key = `proofflow.message.${id ?? "new"}`;
    if (message) sessionStorage.setItem(key, message);
    else sessionStorage.removeItem(key);
  } catch { /* Unsent text stays available in memory when browser storage is unavailable. */ }
}

function editableChecks(saved: SavedPlan): EditableCheck[] {
  return saved.plan!.steps.map(({ id, subjectConcept, targetConcept, beforeState, afterState }) => ({ id, subjectConcept, targetConcept, beforeState, afterState }));
}

export function PlannerWorkspace({ initialStarter = false }: { initialStarter?: boolean }) {
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(() => initialStarter ? null : lastTemplate());
  const [error, setError] = useState<string | null>(null);
  const [input, setInput] = useState(() => rememberedMessage(initialStarter ? null : lastTemplate()));
  const [undo, setUndo] = useState<{ planId: string; versionId: string; revision: number; changedIds: string[]; message: string } | null>(null);
  const [view, setView] = useState<"auto" | "plan" | "video" | "upload">("auto");
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const health = useQuery(plannerStatusQuery);
  const templates = useQuery(plansQuery);
  const current = useQuery(savedPlanQuery(activeId));
  const saved = current.data ?? null;
  const approvedVersionId = saved?.status === "approved" ? saved.versionId : null;
  const previousRuns = useQuery({ ...planRunsQuery(approvedVersionId), enabled: Boolean(approvedVersionId) && view === "auto" });
  const configured = health.data?.configured ?? false;

  function select(id: string | null, keepInput = false) {
    setActiveId(id);
    setError(null);
    if (!keepInput) { setInput(rememberedMessage(id)); setView("auto"); setPropertiesOpen(false); setUndo(null); }
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

  async function create(template: "blank" | "packproof", preserveMessage = false) {
    const { data, error: failure } = await api.api.plans.post({ template });
    if (failure) throw apiError(failure.value, "Your template could not be created.");
    const value = savedPlanSchema.parse(data);
    if (preserveMessage) rememberMessage(value.id, input);
    remember(value);
    return value;
  }

  async function save(action: Action) {
    setError(null);
    if (action.type === "create") return create(action.template);
    let target = saved;
    if (!target && action.type === "send" && !activeId) target = await create(initialStarter ? "packproof" : "blank", true);
    if (!target) throw new Error("Load or create a template to continue.");
    const endpoint = api.api.plans({ id: target.id });
    const response = action.type === "send"
      ? await endpoint.messages.post({ message: action.message, revision: target.revision })
      : action.type === "revise"
        ? await endpoint.revise.post({ revision: target.revision })
        : action.type === "edit"
          ? await endpoint.checks.post({ revision: target.revision, steps: action.steps })
        : action.type === "restore"
          ? await endpoint.restore.post({ revision: target.revision, versionId: action.versionId })
        : action.type === "copy"
          ? await endpoint.copy.post({ revision: target.revision })
        : await endpoint.approve.post({ revision: target.revision, contractHash: target.contractHash ?? "" });
    if (response.error) throw apiError(response.error.value, "Your change could not be saved. Please try again.");
    return savedPlanSchema.parse(response.data);
  }

  const mutation = useMutation({
    mutationFn: (action: Action) => withFeedback(save(action), {
      ...actionFeedback[action.type],
      success: (value) => action.type === "send" && value.plan && value.version !== saved?.version
        ? saved?.plan ? "Plan updated" : "Plan created"
        : actionFeedback[action.type].success,
    }),
    onSuccess: (value, action) => {
      if ((action.type === "send" || action.type === "edit") && saved?.versionId && value.versionId !== saved.versionId) {
        const changedIds = value.plan?.steps.filter((step) => JSON.stringify(step) !== JSON.stringify(saved.plan?.steps.find((previous) => previous.id === step.id))).map((step) => step.id) ?? [];
        const removed = (saved.plan?.steps.length ?? 0) > (value.plan?.steps.length ?? 0);
        setUndo({ planId: value.id, versionId: saved.versionId, revision: value.revision, changedIds, message: removed ? "Check removed. You can undo this change." : "Checks updated. Review the changes below." });
      } else setUndo(null);
      remember(value);
      if (action.type === "send") {
        rememberMessage(saved?.id ?? activeId, "");
        rememberMessage(value.id, "");
      }
      if (action.type === "create" || action.type === "copy") {
        setInput("");
        setView("plan");
        setPropertiesOpen(false);
      }
    },
    onError: (failure) => setError(failure instanceof Error ? failure.message : "Your change could not be saved."),
    retry: false,
  });

  async function deletePlan(id: string) {
    const { data, error: failure } = await api.api.plans({ id }).delete();
    if (failure) throw apiError(failure.value, "The plan could not be deleted.");
    return deletePlanResultSchema.parse(data);
  }

  const removePlan = useMutation({
    mutationFn: (id: string) => withFeedback(deletePlan(id), { loading: "Deleting plan…", success: "Plan deleted", error: "Couldn’t delete plan" }),
    onSuccess: (_result, id) => {
      if (id === activeId) select(null);
      queryClient.removeQueries({ queryKey: savedPlanQuery(id).queryKey, exact: true });
      queryClient.setQueryData(plansQuery.queryKey, (items) => items?.filter((item) => item.id !== id));
      void queryClient.invalidateQueries({ queryKey: plansQuery.queryKey, exact: true });
      setDeleteTarget(null);
    },
    onError: (_error, id) => {
      void queryClient.invalidateQueries({ queryKey: savedPlanQuery(id).queryKey, exact: true });
      void queryClient.invalidateQueries({ queryKey: plansQuery.queryKey, exact: true });
    },
    retry: false,
  });

  const pending = mutation.isPending || removePlan.isPending;
  const sending = mutation.isPending && mutation.variables?.type === "send";
  const openingVideos = Boolean(approvedVersionId) && view === "auto" && previousRuns.isPending;
  const loading = (Boolean(activeId) && current.isPending) || openingVideos;
  const starter = !saved && !activeId && initialStarter;
  const displayedError = error ?? (current.isError ? current.error.message : health.isError ? health.error.message : null);

  function act(action: Action) { mutation.mutate(action); }

  async function editCheck(edit: EditableCheck) {
    if (!saved) throw new Error("Open a saved draft before changing a check.");
    if (!saved.plan?.steps.some((step) => step.id === edit.id)) throw new Error("This check was removed in another tab. Cancel to review the saved checks.");
    await mutation.mutateAsync({ type: "edit", steps: editableChecks(saved).map((step) => step.id === edit.id ? edit : step) });
  }

  function removeCheck(id: string) {
    if (saved) act({ type: "edit", steps: editableChecks(saved).filter((step) => step.id !== id) });
  }

  async function reloadDraft() {
    await withFeedback(current.refetch({ throwOnError: true }), { loading: "Reloading draft…", success: "Draft reloaded", error: "Couldn’t reload draft" });
    setError(null);
  }

  function openUpload() {
    setView("upload");
  }

  const approved = saved?.status === "approved";
  const hasPlan = Boolean(saved?.plan || starter);
  const videoView = approved && (view === "video" || view === "upload" || (view === "auto" && (previousRuns.isError || Boolean(previousRuns.data?.length))));
  const step = videoView ? 2 : hasPlan ? 1 : 0;

  useEffect(() => {
    if (approved && view === "auto" && (previousRuns.isError || previousRuns.data?.length)) setView("video");
  }, [approved, view, previousRuns.isError, previousRuns.data]);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [activeId, approved, hasPlan, view, videoView, openingVideos]);

  return (
    <SidebarProvider style={{ "--sidebar-width-icon": "4rem" } as CSSProperties}>
      <WorkspaceSidebar plans={templates.data ?? []} activeId={activeId} pending={pending} loading={templates.isPending} error={templates.error?.message ?? null} canInspect={Boolean(saved)} onSelect={(id) => {
        select(id);
        void withFeedback(queryClient.fetchQuery(savedPlanQuery(id)), { loading: "Opening plan…", success: "Plan opened", error: "Couldn’t open plan" }).catch(() => {});
      }} onNew={() => {
        select(null);
        if (initialStarter) act({ type: "create", template: "blank" });
        else toast.add({ type: "info", title: "Ready for a new plan" });
      }} onExample={() => act({ type: "create", template: "packproof" })} onProperties={() => setPropertiesOpen(true)} onDelete={(plan) => { removePlan.reset(); setDeleteTarget(plan); }} onSettings={() => setSettingsOpen(true)} onRetry={() => { void withFeedback(templates.refetch({ throwOnError: true }), { loading: "Reloading plans…", success: "Plans reloaded", error: "Couldn’t reload plans" }).catch(() => {}); }} />
      <SidebarInset id="main-content" className="min-w-0">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4 sm:px-8">
          <SidebarTrigger aria-label="Toggle plans sidebar" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{saved?.plan?.title ?? (starter ? "Box packing example" : "New plan")}</span>
          <span className="shrink-0 text-xs text-muted-foreground" role="status">{pending ? "Saving…" : saved ? "Saved" : ""}</span>
        </header>
        <div className="px-4 pt-6 pb-8 sm:px-8 sm:pt-7">
          <div className={`workspace-enter mx-auto ${videoView ? "max-w-[1500px]" : "max-w-6xl"}`}>
            <ol className="workflow-steps mb-6" aria-label="Verification progress">
              {["Create plan", "Review checks", "Verify video"].map((label, index) => (
                <li key={label} aria-current={step === index ? "step" : undefined} className={`${step === index ? "is-current" : step > index ? "is-complete" : ""} ${approved && index === 1 ? "is-approved" : ""}`}>
                  {approved && index > 0 && index !== step ? <button aria-label={label} disabled={pending} onClick={() => setView(index === 2 ? "video" : "plan")} className="flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"><span className="step-number">{step > index || index === 1 ? <Check className="size-3.5" aria-hidden="true" /> : index + 1}</span>{label}</button> : <span className="flex items-center gap-2"><span className="step-number">{step > index || (approved && index === 1) ? <Check className="size-3.5" aria-hidden="true" /> : index + 1}</span>{label}</span>}
                </li>
              ))}
            </ol>
            <div className="mb-6">
              <h1 ref={heading} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none sm:text-3xl">{openingVideos ? "Opening your plan" : videoView ? "Videos & evidence" : approved ? "Your plan is ready" : hasPlan ? "Review your checks" : "What should the video show?"}</h1>
              <p className="mt-2 text-base leading-7 text-muted-foreground">{openingVideos ? "Loading your videos and saved checks." : videoView ? "Use the same approved checks for each new video." : approved ? "Use these checks for a video, or make a copy for a similar task." : hasPlan ? "Tell the assistant what to change, then review and approve your checks." : "Describe the task. We’ll turn it into a short checklist."}</p>
            </div>
            {undo && saved?.id === undo.planId && saved.revision === undo.revision && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-primary/5 p-4"><p role="status" className="text-base">{undo.message}</p><Button variant="outline" disabled={pending} onClick={() => act({ type: "restore", versionId: undo.versionId })}><RotateCcw />Undo change</Button></div>}
            {displayedError && (approved || loading) && <p role="alert" className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{displayedError}</p>}
            {!loading && approved && <div hidden={!videoView}><VerificationWorkspace key={saved.versionId} saved={saved} visible={Boolean(videoView)} startNewUpload={view === "upload"} onReviewPlan={() => setView("plan")} /></div>}
            {loading ? <Skeleton className="h-96 rounded-2xl" aria-label={openingVideos ? "Loading plan videos" : "Loading saved plan"} /> : videoView ? null : <div className={approved ? "mx-auto max-w-3xl" : hasPlan ? "grid items-start gap-5 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]" : "mx-auto max-w-2xl"}>
              {!approved && <PlannerChat saved={saved} starter={starter} pending={pending} sending={sending} pendingMessage={sending && mutation.variables?.type === "send" ? mutation.variables.message : null} configured={configured} error={displayedError} input={input} onInputChange={(message) => { setInput(message); rememberMessage(activeId, message); }} onSend={async (message) => { await mutation.mutateAsync({ type: "send", message }); }} onStarter={() => act({ type: "create", template: "packproof" })} onReload={() => { void reloadDraft().catch(() => {}); }} />}
              {hasPlan && <PlanPreview key={activeId ?? "preview"} saved={saved} starter={starter ? packproofTemplate : null} pending={pending || current.isError} onApprove={() => act({ type: "approve" })} onRevise={() => act({ type: "revise" })} onCopy={() => act({ type: "copy" })} onEdit={editCheck} onRemove={removeCheck} onReload={reloadDraft} changedIds={undo?.planId === saved?.id ? undo?.changedIds ?? [] : []} onUseStarter={() => act({ type: "create", template: "packproof" })} onVerify={openUpload} />}
            </div>}
            {current.isError && <Button variant="outline" className="mt-3 h-9 gap-2" onClick={() => select(null)}><RotateCcw className="size-3.5" />Back to a new plan</Button>}
            <footer className="mt-8 pb-2 text-center text-xs text-muted-foreground">Powered by Meta Muse Spark & SAM 3.1</footer>
          </div>
        </div>
      </SidebarInset>
      <PlanProperties saved={saved} open={propertiesOpen} onOpenChange={setPropertiesOpen} pending={pending} onRevise={() => { setView("plan"); act({ type: "revise" }); }} />
      <WorkspaceSettings open={settingsOpen} onOpenChange={setSettingsOpen} />
      <DeletePlanDialog target={deleteTarget} pending={removePlan.isPending} error={removePlan.error?.message ?? null} onClose={() => setDeleteTarget(null)} onConfirm={() => { if (deleteTarget) removePlan.mutate(deleteTarget.id); }} />
    </SidebarProvider>
  );
}

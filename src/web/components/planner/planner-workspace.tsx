import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { withFeedback } from "@/lib/feedback";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { api } from "@/lib/eden";
import { readPlannerStream } from "@/lib/planner-stream";
import { apiError, plannerStatusQuery, planRunsQuery, plansQuery, savedPlanQuery } from "@/lib/queries";
import { deletePlanResultSchema, savedPlanSchema, type EditableCheck, type PlannerPreview, type SavedPlan } from "../../../shared/planner";
import { packproofTemplate } from "../../../shared/packproof";
import { PlanPreview } from "./plan-preview";
import { PlannerChat } from "./planner-chat";
import { PlanProperties } from "./plan-properties";
import { DeletePlanDialog } from "./delete-plan-dialog";
import { WorkspaceSidebar } from "../workspace/workspace-sidebar";
import { WorkspaceSettings } from "../workspace/workspace-settings";
import { VerificationWorkspace } from "../verification/verification-workspace";
import { PlanTriggers } from "../triggers/plan-triggers";
import type { TaskSession } from "../../../shared/triggers";
import { ManualPlanEditor, type ManualPlanDraft } from "./manual-plan-editor";

type Action = { type: "create"; template: "blank" | "packproof" } | { type: "send"; message: string; media?: File } | { type: "approve" } | { type: "copy" } | { type: "edit"; steps: EditableCheck[] } | { type: "restore"; versionId: string } | { type: "manual"; draft: ManualPlanDraft };

const actionFeedback = {
  create: { loading: "Creating draft…", success: "Draft created", error: "Couldn’t create draft" },
  send: { loading: "Working on your plan…", success: "Reply received", error: "Couldn’t send message" },
  approve: { loading: "Preparing your checks…", success: "Ready for your video", error: "Couldn’t prepare checks" },
  copy: { loading: "Copying your checks…", success: "Copy ready to change", error: "Couldn’t copy plan" },
  edit: { loading: "Saving your checks…", success: "Checks saved", error: "Couldn’t save checks" },
  restore: { loading: "Undoing the change…", success: "Previous checks restored", error: "Couldn’t undo the change" },
  manual: { loading: "Saving your plan…", success: "Plan saved for review", error: "Couldn’t save your plan" },
};

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
  return saved.plan!.steps.map(({ id, subjectConcept, targetConcept, beforeState, afterState, requirements, goalSource, visualCheck, label, observableEvidence }) => ({ id, subjectConcept, targetConcept, beforeState, afterState, requirements, goalSource, visualCheck, label, observableEvidence }));
}

export function PlannerWorkspace({ initialStarter = false, planId = null }: { initialStarter?: boolean; planId?: string | null }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(planId);
  const [error, setError] = useState<string | null>(null);
  const [planPreview, setPlanPreview] = useState<PlannerPreview | null>(null);
  const [partialReply, setPartialReply] = useState("");
  const requestController = useRef<AbortController | null>(null);
  useEffect(() => () => requestController.current?.abort(), []);
  const [input, setInput] = useState(() => rememberedMessage(planId));
  const [undo, setUndo] = useState<{ planId: string; versionId: string; revision: number; changedIds: string[]; message: string } | null>(null);
  const [view, setView] = useState<"auto" | "plan" | "video" | "upload">("auto");
  const [task, setTask] = useState<TaskSession | null>(null);
  const [editingApproved, setEditingApproved] = useState(false);
  const [manualEditing, setManualEditing] = useState(false);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [preparingTrigger, setPreparingTrigger] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const health = useQuery(plannerStatusQuery);
  const templates = useQuery(plansQuery);
  const current = useQuery(savedPlanQuery(activeId));
  const saved = current.data ?? null;
  const approvedVersionId = saved?.status === "approved" ? saved.versionId : null;
  const previousRuns = useQuery({ ...planRunsQuery(saved?.id ?? null) });
  const configured = health.data?.configured ?? false;

  function select(id: string | null, keepInput = false) {
    if (id !== activeId) setTask(null);
    setActiveId(id);
    setError(null);
    if (!keepInput) {
      setManualEditing(false);
      setPartialReply(""); setPlanPreview(null); setEditingApproved(false); setInput(rememberedMessage(id)); setView("auto"); setPropertiesOpen(false); setUndo(null);
      heading.current?.focus({ preventScroll: true });
      window.scrollTo({ top: 0 });
    }
    if (id) void navigate({ to: "/plans/$planId", params: { planId: id } });
    else void navigate({ to: "/new" });
  }

  useEffect(() => {
    if (planId === activeId) return;
    setActiveId(planId);
    setManualEditing(false);
    setTask(null);
    setEditingApproved(false);
    setError(null);
    setPartialReply(""); setPlanPreview(null);
    setInput(rememberedMessage(planId));
    setView("auto");
    setPropertiesOpen(false);
    setUndo(null);
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [planId]);

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
    queryClient.setQueryData(savedPlanQuery(value.id).queryKey, value);
    void queryClient.invalidateQueries({ queryKey: plansQuery.queryKey, exact: true });
    return value;
  }

  async function ensureTriggerPlan() {
    if (saved) return saved;
    setPreparingTrigger(true);
    try {
      const value = await create(initialStarter ? "packproof" : "blank", true);
      remember(value);
      return value;
    } finally {
      setPreparingTrigger(false);
    }
  }

  async function save(action: Action) {
    setError(null);
    if (action.type === "create") {
      if (saved && !saved.plan && action.template === "packproof") {
        const response = await api.api.plans({ id: saved.id }).starter.post({ revision: saved.revision });
        if (response.error) throw apiError(response.error.value, "The example could not be added to your plan.");
        return savedPlanSchema.parse(response.data);
      }
      return create(action.template);
    }
    let target = saved;
    if (!target && (action.type === "send" || action.type === "manual") && !activeId) {
      target = await create(action.type === "manual" ? "blank" : initialStarter ? "packproof" : "blank", true);
      if (action.type === "manual") remember(target);
    }
    if (!target) throw new Error("Load or create a template to continue.");
    const endpoint = api.api.plans({ id: target.id });
    if (action.type === "manual") {
      const response = await endpoint.manual.post({ revision: target.revision, ...action.draft });
      if (response.error) throw apiError(response.error.value, "Your manual plan could not be saved.");
      return savedPlanSchema.parse(response.data);
    }
    if (action.type === "send") {
      setPartialReply(""); setPlanPreview(null);
      const controller = new AbortController();
      requestController.current = controller;
      try {
        const { data, error: failure } = action.media
          ? await endpoint.reference.post({ media: action.media, message: action.message, revision: String(target.revision), consent: "true" }, { query: { stream: "true" }, fetch: { signal: controller.signal } })
          : await endpoint.messages.post({ message: action.message, revision: target.revision }, { query: { stream: "true" }, fetch: { signal: controller.signal } });
        if (failure) throw apiError(failure.value, "Your message could not be sent. Please try again.");
        if (!data || !(Symbol.asyncIterator in data)) throw new Error("The chat stream could not be opened. Please try again.");
        return await readPlannerStream(data, setPartialReply, setPlanPreview);
      } finally {
        controller.abort();
        if (requestController.current === controller) requestController.current = null;
      }
    }
    const response = action.type === "edit"
          ? await endpoint.checks.post({ revision: target.revision, steps: action.steps })
        : action.type === "restore"
          ? await endpoint.restore.post({ revision: target.revision, versionId: action.versionId })
        : action.type === "copy"
          ? await endpoint.copy.post({ revision: target.revision })
        : await endpoint.approve.post({ revision: target.revision, contractHash: target.contractHash ?? "", videoConsent: true });
    if (response.error) throw apiError(response.error.value, "Your change could not be saved. Please try again.");
    return savedPlanSchema.parse(response.data);
  }

  const mutation = useMutation({
    mutationFn: (action: Action) => action.type === "send" ? save(action) : withFeedback(save(action), {
      ...actionFeedback[action.type],
    }),
    onSuccess: (value, action) => {
      if ((action.type === "send" || action.type === "edit") && saved?.versionId && value.versionId !== saved.versionId) {
        const changedIds = value.plan?.steps.filter((step) => JSON.stringify(step) !== JSON.stringify(saved.plan?.steps.find((previous) => previous.id === step.id))).map((step) => step.id) ?? [];
        const removed = (saved.plan?.steps.length ?? 0) > (value.plan?.steps.length ?? 0);
        setUndo({ planId: value.id, versionId: saved.versionId, revision: value.revision, changedIds, message: removed ? "Check removed. You can undo this change." : "Checks updated. Review the changes below." });
      } else setUndo(null);
      remember(value);
      if (action.type === "manual") { setManualEditing(false); setView("plan"); }
      if (value.status !== "approved") { setEditingApproved(false); setView("plan"); }
      if (action.type === "approve") openUpload();
      if (action.type === "send") {
        setPartialReply(""); setPlanPreview(null);
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

  const pending = mutation.isPending || removePlan.isPending || preparingTrigger;
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
    setPartialReply(""); setPlanPreview(null);
  }

  function openEditor() {
    setView("plan");
    setEditingApproved(true);
  }

  function openUpload() {
    setEditingApproved(false);
    setView("upload");
  }

  const approved = saved?.status === "approved";
  const hasPlan = Boolean(saved?.plan || starter);
  const videoView = Boolean(saved) && (view === "video" || (approved && (view === "upload" || (view === "auto" && (previousRuns.isError || Boolean(previousRuns.data?.length))))));
  const step = videoView ? 1 : 0;

  useEffect(() => {
    if (approved && view === "auto" && (previousRuns.isError || previousRuns.data?.length)) setView("video");
  }, [approved, view, previousRuns.isError, previousRuns.data]);

  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, []);

  const pageHeading = <div className="min-w-0">
    <h1 ref={heading} tabIndex={-1} className={`font-semibold tracking-tight outline-none ${videoView ? "text-2xl" : "text-2xl sm:text-3xl"}`}>{openingVideos ? "Opening your plan" : videoView ? "Videos & evidence" : manualEditing ? "Build your own plan" : editingApproved ? "Edit your checks" : approved ? "Your plan is ready" : hasPlan ? "Review your checks" : "Create your proof plan"}</h1>
    <p className={videoView ? "sr-only" : "mt-2 text-base leading-7 text-muted-foreground"}>{openingVideos ? "Loading your videos and saved checks." : videoView ? "Inspect each check alongside its video evidence." : manualEditing ? "Choose visible actions, name the objects, and watch your plan take shape. Save a draft, then review and approve it." : editingApproved ? "Save your changes, then use the updated checks for a video." : approved ? "Ask a question, revise your plan, or check a video." : hasPlan ? "Adjust the checks here, then choose Check a video when you’re ready." : "Describe your process or add a reference. Review and approve the suggested checks before verifying a video."}</p>
  </div>;

  return (
    <SidebarProvider style={{ "--sidebar-width-icon": "4rem" } as CSSProperties}>
      <WorkspaceSidebar plans={templates.data ?? []} activeId={activeId} pending={pending} loading={templates.isPending} error={templates.error?.message ?? null} canInspect={Boolean(saved)} onSelect={(id) => {
        select(id);
        void queryClient.fetchQuery(savedPlanQuery(id)).catch((error: unknown) => {
          toast.add({ type: "error", title: "Couldn’t open plan", description: error instanceof Error ? error.message : "Please try again.", timeout: 8000 });
        });
      }} onNew={() => {
        select(null);
        toast.add({ type: "info", title: "Ready for a new plan" });
      }} onExample={() => act({ type: "create", template: "packproof" })} onProperties={() => setPropertiesOpen(true)} onDelete={(plan) => { removePlan.reset(); setDeleteTarget(plan); }} onSettings={() => setSettingsOpen(true)} onRetry={() => { void withFeedback(templates.refetch({ throwOnError: true }), { loading: "Reloading plans…", success: "Plans reloaded", error: "Couldn’t reload plans" }).catch(() => {}); }} />
      <SidebarInset id="main-content" className="min-w-0">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4 sm:px-8">
          <SidebarTrigger aria-label="Toggle plans sidebar" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{saved?.plan?.title ?? (starter ? "Box packing example" : "New plan")}</span>
          <span className="shrink-0 text-xs text-muted-foreground" role="status">{sending ? "Replying…" : pending ? "Saving…" : saved ? "Saved" : ""}</span>
        </header>
        <div className={videoView ? "px-4 pt-4 pb-6 sm:px-6" : "px-4 pt-6 pb-8 sm:px-8 sm:pt-7"}>
          <div className={`workspace-enter mx-auto ${videoView || hasPlan ? "max-w-[1500px]" : "max-w-[1100px]"}`}>
            <ol hidden={Boolean(videoView)} className={videoView ? "hidden" : `workflow-steps mb-6 ${!hasPlan ? "workflow-steps-start" : ""}`} aria-label="Verification progress">
              {["Create plan", "Verify video"].map((label, index) => (
                <li key={label} aria-current={step === index ? "step" : undefined} className={step === index ? "is-current" : step > index ? "is-complete" : ""}>
                  {videoView && index === 0 ? <button aria-label={label} disabled={pending} onClick={() => setView("plan")} className="flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"><span className="step-number"><Check className="size-3.5" aria-hidden="true" /></span>{label}</button> : <span className="flex items-center gap-2"><span className="step-number">{index + 1}</span>{label}</span>}
                </li>
              ))}
            </ol>
            {!videoView && <div className="mb-6 grid gap-6 lg:grid-cols-[230px_minmax(0,1fr)]"><div className={`min-w-0 flex flex-wrap items-start justify-between gap-4 lg:col-start-2 ${!hasPlan ? "planner-intro" : ""}`}>{pageHeading}{Boolean(previousRuns.data?.length) && <Button variant="outline" onClick={() => { setEditingApproved(false); setView("video"); }}>Videos & evidence ({previousRuns.data!.length})</Button>}</div></div>}
            {undo && saved?.id === undo.planId && saved.revision === undo.revision && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-primary/5 p-4"><p role="status" className="text-base">{undo.message}</p><Button variant="outline" disabled={pending} onClick={() => act({ type: "restore", versionId: undo.versionId })}><RotateCcw />Undo change</Button></div>}
            {displayedError && (videoView || loading) && <p role="alert" className="mb-4 rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">{displayedError}</p>}
            <div className={loading ? "" : "grid items-start gap-6 lg:grid-cols-[230px_minmax(0,1fr)]"}>
            {!loading && <PlanTriggers key={saved?.id ?? "new"} setup={!videoView} saved={saved} disabled={pending} onEnsurePlan={ensureTriggerPlan} onAttach={task => { setTask(task); setEditingApproved(false); setView("video"); }} />}
            <div className="min-w-0">
            {!loading && saved && (approved || videoView || Boolean(previousRuns.data?.length)) && <div hidden={!videoView}><VerificationWorkspace key={saved.id} saved={saved} heading={videoView ? pageHeading : null} visible={Boolean(videoView)} startNewUpload={view === "upload"} task={task} onClearTask={() => setTask(null)} onReviewPlan={() => setView("plan")} /></div>}
            {loading ? <Skeleton className="h-96 rounded-2xl" aria-label={openingVideos ? "Loading plan videos" : "Loading saved plan"} /> : videoView ? null : manualEditing ? <ManualPlanEditor saved={saved} pending={pending} onSave={async draft => { await mutation.mutateAsync({ type: "manual", draft }); }} onCancel={() => setManualEditing(false)} /> : <div className={hasPlan ? "grid items-start gap-5 2xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]" : "min-w-0"}>
              <PlannerChat saved={saved} starter={starter} pending={pending} sending={sending} partialReply={partialReply} planPreview={planPreview} referenceSending={sending && mutation.variables?.type === "send" && Boolean(mutation.variables.media)} pendingMessage={(sending || partialReply) && mutation.variables?.type === "send" ? mutation.variables.message : null} configured={configured} error={displayedError} input={input} onInputChange={(message) => { setInput(message); rememberMessage(activeId, message); }} onSend={async (message, media) => { await mutation.mutateAsync({ type: "send", message, media }); }} onStarter={() => act({ type: "create", template: "packproof" })} onManual={() => setManualEditing(true)} onReload={() => { void reloadDraft().catch(() => {}); }} />
              {hasPlan && <PlanPreview key={activeId ?? "preview"} saved={saved} starter={starter ? packproofTemplate : null} pending={pending || current.isError} editingApproved={editingApproved} onFinishEditing={() => setEditingApproved(false)} onRevise={openEditor} onCopy={() => act({ type: "copy" })} onEdit={editCheck} onRemove={removeCheck} onReload={reloadDraft} changedIds={undo?.planId === saved?.id ? undo?.changedIds ?? [] : []} onUseStarter={() => act({ type: "create", template: "packproof" })} onManual={() => setManualEditing(true)} onVerify={() => approved && saved?.videoConsentAt ? openUpload() : act({ type: "approve" })} />}
            </div>}
            </div>
            </div>
            {current.isError && <Button variant="outline" className="mt-3 h-9 gap-2" onClick={() => select(null)}><RotateCcw className="size-3.5" />Back to a new plan</Button>}
            <footer className="mt-8 pb-2 text-center text-xs text-muted-foreground">Powered by Meta Muse Spark & SAM 3.1</footer>
          </div>
        </div>
      </SidebarInset>
      <PlanProperties saved={saved} open={propertiesOpen} onOpenChange={setPropertiesOpen} pending={pending} onRevise={openEditor} />
      <WorkspaceSettings open={settingsOpen} onOpenChange={setSettingsOpen} />
      <DeletePlanDialog target={deleteTarget} pending={removePlan.isPending} error={removePlan.error?.message ?? null} onClose={() => setDeleteTarget(null)} onConfirm={() => { if (deleteTarget) removePlan.mutate(deleteTarget.id); }} />
    </SidebarProvider>
  );
}

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useToastManager } from "@/components/ui/toast";
import { runDetailsQuery } from "@/lib/queries";
import { isActiveRun } from "../../../shared/receipt";

const storageKey = "proofflow.pendingVerifications";
const pendingSchema = z.array(z.uuid()).max(20);
const VerificationFeedbackContext = createContext<((id: string) => void) | null>(null);

function pendingRuns(): string[] {
  try {
    const parsed = pendingSchema.safeParse(JSON.parse(sessionStorage.getItem(storageKey) ?? "[]"));
    return parsed.success ? [...new Set(parsed.data)] : [];
  } catch { return []; }
}

export function VerificationFeedbackProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { add: addToast } = useToastManager();
  const [ids, setIds] = useState(pendingRuns);
  const watched = useRef(new Set(ids));
  const announced = useRef(new Set<string>());
  const unavailable = useRef(new Set<string>());
  const notified = useRef(new Set<string>());
  const results = useQueries({ queries: ids.map(runDetailsQuery) });
  const watch = useCallback((id: string) => {
    if (watched.current.has(id)) return;
    watched.current.add(id);
    setIds((current) => [...current, id]);
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem(storageKey, JSON.stringify(ids)); } catch { /* Tracking continues in memory when browser storage is unavailable. */ }
  }, [ids]);

  useEffect(() => {
    const settled = new Set<string>();
    results.forEach((result, index) => {
      const id = ids[index]!;
      const toastId = `verification-${id}`;
      const run = result.data;
      if (run && !isActiveRun(run.state)) {
        if (!notified.current.has(id)) {
          notified.current.add(id);
          addToast({ id: toastId, type: run.state === "completed" ? "success" : "error", title: run.state === "completed" ? "Findings ready" : "Video verification failed", description: run.state === "completed" ? run.approvedPlan.title : run.error ?? "No verdict was produced. Please try another recording.", timeout: 6000 });
          void queryClient.invalidateQueries({ queryKey: ["runs"] });
        }
        settled.add(id);
      } else if (result.error && "status" in result.error && (result.error.status === 404 || result.error.status === 403)) {
        if (!notified.current.has(id)) {
          notified.current.add(id);
          addToast({ id: toastId, type: "warning", title: "Video run unavailable", description: "It may have been deleted or expired." });
        }
        settled.add(id);
      } else if (result.isError && !unavailable.current.has(id)) {
        unavailable.current.add(id);
        addToast({ type: "error", title: "Couldn’t check video status", description: "We’ll keep trying automatically." });
      } else if (!announced.current.has(id)) {
        announced.current.add(id);
        addToast({ id: toastId, type: "loading", title: "Verifying video…", timeout: 0 });
      }
    });
    if (settled.size) setIds((current) => current.filter((id) => !settled.has(id)));
  }, [ids, results, queryClient, addToast]);

  return <VerificationFeedbackContext.Provider value={watch}>{children}</VerificationFeedbackContext.Provider>;
}

export function useVerificationFeedback() {
  const watch = useContext(VerificationFeedbackContext);
  if (!watch) throw new Error("Verification feedback requires its provider.");
  return watch;
}

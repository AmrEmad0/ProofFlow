import { toast } from "@/components/ui/toast";

type TaskMessages<T> = {
  loading: string;
  success: string | ((result: T) => string);
  error: string;
};

export function withFeedback<T>(task: Promise<T>, messages: TaskMessages<T>): Promise<T> {
  return toast.promise(task, {
    loading: { title: messages.loading },
    success: (result) => ({ title: typeof messages.success === "function" ? messages.success(result) : messages.success, timeout: 4000 }),
    error: (error: unknown) => ({ title: messages.error, description: error instanceof Error ? error.message : "Please try again.", timeout: 8000 }),
  });
}

export function downloadJson(value: unknown, filename: string, label: "Plan" | "Evidence" | "Model diagnostics") {
  let url: string | undefined;
  let link: HTMLAnchorElement | undefined;
  try {
    url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
    link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.hidden = true;
    document.body.append(link);
    link.click();
    toast.add({ type: "success", title: `${label} download started` });
  } catch {
    toast.add({ type: "error", title: `${label} download failed`, description: "Please try again." });
  } finally {
    link?.remove();
    if (url) URL.revokeObjectURL(url);
  }
}

import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";

type Props = {
  target: { id: string; title: string } | null;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

export function DeletePlanDialog({ target, pending, error, onClose, onConfirm }: Props) {
  return <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
    <DialogContent role="alertdialog" showCloseButton={!pending} className="p-6 sm:max-w-md">
      <DialogTitle className="pr-6 text-lg font-semibold">Delete plan?</DialogTitle>
      <DialogDescription className="break-words text-sm leading-6">Remove “{target?.title}” and delete its videos and evidence? This cannot be undone.</DialogDescription>
      <p className="text-xs leading-5 text-muted-foreground">Approved versions remain as locked records.</p>
      {error && <p role="alert" className="text-sm leading-5 text-destructive">{error}</p>}
      <DialogFooter className="mt-2"><Button variant="outline" disabled={pending} onClick={onClose} className="h-10 px-4">Cancel</Button><Button variant="destructive" disabled={pending} onClick={onConfirm} className="h-10 gap-2 bg-red-700 px-4 text-white hover:bg-red-800 dark:bg-red-700 dark:hover:bg-red-800">{pending && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}{pending ? "Deleting…" : "Delete plan"}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

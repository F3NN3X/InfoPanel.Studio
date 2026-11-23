import { CircleAlert, CircleCheck } from "lucide-react";
import { ToastCard } from "@/components/ui/toast-provider";

export interface AddToastState {
  id: number;
  message: string;
  /** An add (it has an Undo); a failure has none. */
  added: boolean;
}

/** The Add panel's toast: bottom centre of the canvas (rules §4), with Undo after an add. */
export function AddToast({ toast, onUndo }: { toast: AddToastState; onUndo: () => void }) {
  return (
    <ToastCard
      key={toast.id}
      role="status"
      data-testid="add-toast"
      icon={
        toast.added ? (
          <CircleCheck className="h-4 w-4 shrink-0 text-ui-ok" aria-hidden />
        ) : (
          <CircleAlert className="h-4 w-4 shrink-0 text-ui-warn" aria-hidden />
        )
      }
      actions={toast.added ? [{ label: "Undo", onClick: onUndo }] : undefined}
      className="add-toast-in pointer-events-auto max-w-[min(560px,calc(100%-32px))] px-3 py-2.25"
    >
      {toast.message}
    </ToastCard>
  );
}

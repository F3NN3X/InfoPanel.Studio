import { CircleAlert, CircleCheck } from "lucide-react";

export interface AddToastState {
  id: number;
  message: string;
  /** An add (it has an Undo); a failure has none. */
  added: boolean;
}

const LINK = "shrink-0 cursor-pointer font-medium text-ui-1 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent";

/** The Add panel's toast: bottom centre of the canvas (rules §4), with Undo after an add. */
export function AddToast({ toast, onUndo }: { toast: AddToastState; onUndo: () => void }) {
  return (
    <div
      key={toast.id}
      role="status"
      data-testid="add-toast"
      className="add-toast-in pointer-events-auto flex max-w-[min(560px,calc(100%-32px))] items-center gap-3 rounded-ui-menu border border-ui-menu bg-ui-hover px-3 py-2.25 font-ui text-caption text-ui-1 shadow-[0_10px_30px_#0009]"
    >
      {toast.added ? (
        <CircleCheck className="h-4 w-4 shrink-0 text-ui-ok" aria-hidden />
      ) : (
        <CircleAlert className="h-4 w-4 shrink-0 text-ui-warn" aria-hidden />
      )}
      <span className="min-w-0 flex-1 text-pretty">{toast.message}</span>
      {toast.added && (
        <button type="button" onClick={onUndo} className={LINK}>
          Undo
        </button>
      )}
    </div>
  );
}

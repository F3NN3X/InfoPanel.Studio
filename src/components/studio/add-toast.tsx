import { CircleAlert, CircleCheck } from "lucide-react";

export interface AddToastState {
  id: number;
  message: string;
  /** An add (it has an Undo); a failure has none. */
  added: boolean;
}

/** The Add panel's toast (handoff SPEC §7.4): bottom centre of the canvas, with Undo after an add. */
export function AddToast({ toast, onUndo }: { toast: AddToastState; onUndo: () => void }) {
  return (
    <div
      key={toast.id}
      role="status"
      className="add-toast-in pointer-events-auto flex max-w-[min(560px,calc(100%-32px))] items-center gap-3 rounded-[9px] border border-ui-strong bg-[#1c1c21] py-2 pl-3.5 pr-2 font-ui text-[12.5px] text-ui-1 shadow-[0_10px_30px_rgba(0,0,0,.5)]"
    >
      {toast.added ? (
        <CircleCheck className="h-[18px] w-[18px] shrink-0 text-[oklch(0.80_0.14_150)]" aria-hidden />
      ) : (
        <CircleAlert className="h-[18px] w-[18px] shrink-0 text-[oklch(0.80_0.13_60)]" aria-hidden />
      )}
      <span className="min-w-0 truncate">{toast.message}</span>
      {toast.added && (
        <button
          type="button"
          onClick={onUndo}
          className="h-[26px] shrink-0 rounded-md border border-ui-strong px-2.5 text-[12px] font-medium text-ui-1 hover:bg-ui-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent"
        >
          Undo
        </button>
      )}
    </div>
  );
}

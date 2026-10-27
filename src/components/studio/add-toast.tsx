import { CircleAlert, CircleCheck } from "lucide-react";

export interface AddToastState {
  id: number;
  message: string;
  /** An add (it has an Undo); a failure has none. */
  added: boolean;
  /** The added part has an On InfoPanel choice (a screen made for InfoPanel): Change shows it. */
  change?: boolean;
}

const LINK = "shrink-0 cursor-pointer font-semibold text-ui-1 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent";

/** The Add panel's toast (Edit v3 SPEC §9.6): top centre of the canvas, with Undo after an add and Change on an InfoPanel screen. */
export function AddToast({ toast, onUndo, onChange }: { toast: AddToastState; onUndo: () => void; onChange?: () => void }) {
  return (
    <div
      key={toast.id}
      role="status"
      data-testid="add-toast"
      className="add-toast-in pointer-events-auto flex max-w-[min(560px,calc(100%-32px))] items-center gap-3 rounded-[9px] border border-[#2e2e36] bg-[#1a1a1f] px-3 py-[9px] font-ui text-[12px] text-ui-1 shadow-[0_10px_30px_#0009]"
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
      {toast.added && toast.change && onChange && (
        <button type="button" onClick={onChange} className={LINK}>
          Change
        </button>
      )}
    </div>
  );
}

/** Change: the On InfoPanel control of the part just added (selected), once the inspector shows it. */
export function focusOnInfoPanel() {
  let tries = 0;
  const go = () => {
    const el = document.querySelector<HTMLElement>('[data-testid="on-infopanel"] [role="radio"][aria-checked="true"], [data-testid="on-infopanel"] button, [data-testid="on-infopanel"]');
    if (el) {
      if (!el.hasAttribute("tabindex") && !(el instanceof HTMLButtonElement)) el.tabIndex = -1;
      el.scrollIntoView({ block: "nearest" });
      el.focus();
    } else if (++tries < 20) requestAnimationFrame(go);
  };
  requestAnimationFrame(go);
}

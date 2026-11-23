import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DismissContext, FAILURE, ToastContext, toastDuration, type ShowToast, type ToastOptions } from "./toast";

/** The toolbar's distance from the canvas bottom (16 px), unless a phone's sheet lifts it. */
const BAR_BOTTOM = 16;

/** Where a toast rests on Edit's canvas: over the bottom toolbar (42 px) and a gap, lifted with the toolbar by a phone's sheet. */
export function overToolbar(barBottom: number = BAR_BOTTOM): number {
  return barBottom + 60;
}

/** Where a toast sits: bottom centre of Edit's canvas (`data-toast-anchor`, its `data-toast-bar` the toolbar's lift), over the bottom toolbar (rules §4). */
function anchored(): { bottom: number; left: number } | null {
  const el = document.querySelector<HTMLElement>("[data-toast-anchor]");
  const r = el?.getBoundingClientRect();
  return r && r.width > 0 ? { bottom: window.innerHeight - r.bottom + overToolbar(el?.dataset.toastBar ? Number(el.dataset.toastBar) : undefined), left: r.left + r.width / 2 } : null;
}

interface ToastState {
  id: number;
  message: string;
  action?: ToastOptions["action"];
  error: boolean;
  ms: number | null;
  at: { bottom: number; left: number } | null;
}

/** One live region (always mounted, positioned where the toast shows) and the card inside it while there is one. */
function ToastSlot({ live, toast, arm, dismiss }: { live: "polite" | "assertive"; toast: ToastState | null; arm: (ms: number | null) => void; dismiss: () => void }) {
  // Only a toast with a button or a long life takes the pointer; a plain one stays click-through.
  const interactive = !!toast && (!!toast.action || toast.error);
  return (
    <div
      role="status"
      aria-live={live}
      style={toast?.at ? { bottom: toast.at.bottom, left: toast.at.left } : undefined}
      onPointerEnter={() => arm(null)}
      onPointerLeave={() => toast && arm(toast.ms)}
      onFocus={() => arm(null)}
      onBlur={() => toast && arm(toast.ms)}
      className={cn("fixed bottom-10.5 left-1/2 z-[100] -translate-x-1/2", !interactive && "pointer-events-none")}
    >
      {toast && (
        <div
          key={toast.id}
          className="flex items-center gap-3 rounded-ui-menu border border-ui-menu bg-ui-raised px-4 py-2.5 font-ui text-body text-ui-1 shadow-ui-float"
        >
          {toast.message}
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action?.onClick();
                dismiss();
              }}
              className="rounded-ui-sm font-medium text-ui-2 hover:text-ui-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent"
            >
              {toast.action.label}
            </button>
          )}
          {interactive && (
            <button
              type="button"
              aria-label="Dismiss"
              onClick={dismiss}
              className="-mr-1 grid h-5 w-5 place-items-center rounded-ui-sm text-ui-hint hover:text-ui-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Hosts the toast: bottom centre, in Edit over the canvas's toolbar, elsewhere just above the window's edge (never
 * over a screen's header and tabs); a raised card. A plain confirmation goes after ~1.8 s; a
 * failure after 8 s; one with an action (Undo) stays until dismissed. Hovering or focusing it pauses the timer. The
 * text is announced through two live regions kept mounted (polite, and an alert for failures) so it is reliably read.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const nextId = useRef(0);
  const shown = useRef<number | null>(null);

  const arm = useCallback((ms: number | null) => {
    clearTimeout(timer.current);
    if (ms !== null) timer.current = setTimeout(() => setToast(null), ms);
  }, []);

  const show = useCallback<ShowToast>(
    (message, options) => {
      const ms = toastDuration(message, options);
      const error = options?.error ?? FAILURE.test(message);
      const id = nextId.current++;
      shown.current = id;
      setToast({ id, message, action: options?.action, error, ms, at: anchored() });
      arm(ms);
      return id;
    },
    [arm]
  );

  const dismiss = useCallback((id: number) => {
    if (shown.current !== id) return;
    shown.current = null;
    clearTimeout(timer.current);
    setToast(null);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      <DismissContext.Provider value={dismiss}>{children}</DismissContext.Provider>
      {/* Both live regions stay mounted (a region added together with its text is often not announced). */}
      <ToastSlot live="polite" toast={toast && !toast.error ? toast : null} arm={arm} dismiss={() => setToast(null)} />
      <ToastSlot live="assertive" toast={toast?.error ? toast : null} arm={arm} dismiss={() => setToast(null)} />
    </ToastContext.Provider>
  );
}

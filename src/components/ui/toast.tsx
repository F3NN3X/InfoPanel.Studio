import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** How long a plain confirmation stays up. */
export const TOAST_MS = 1800;
/** How long a failure stays up unless dismissed; a toast with an action stays until it is dismissed or used. */
export const TOAST_ERROR_MS = 8000;

/** A toast with one button (Undo after a delete); it stays up `ms` (default `TOAST_MS`). */
export interface ToastOptions {
  action?: { label: string; onClick: () => void };
  ms?: number;
  /** A failure: announced assertively and kept up longer. Also inferred from "Not saved…", "Couldn’t…". */
  error?: boolean;
}

type ShowToast = (message: string, options?: ToastOptions) => void;

const ToastContext = createContext<ShowToast>(() => {});

const FAILURE = /^(not\s|couldn[’']t|could not|can[’']t|failed)|couldn[’']t/i;

/** How long a toast stays: `null` = until dismissed (it carries an action). */
export function toastDuration(message: string, options?: ToastOptions): number | null {
  if (options?.action) return options.ms ?? null;
  if (options?.error ?? FAILURE.test(message)) return Math.max(options?.ms ?? 0, TOAST_ERROR_MS);
  return options?.ms ?? TOAST_MS;
}

/** `const toast = useToast(); toast("Copied")` — a no-op outside a provider. */
export function useToast(): ShowToast {
  return useContext(ToastContext);
}

/** Where a toast sits: top centre of Edit's canvas (`data-toast-anchor`), 14px under the page tabs (SPEC §9.6). */
function anchored(): { top: number; left: number } | null {
  const r = document.querySelector("[data-toast-anchor]")?.getBoundingClientRect();
  return r && r.width > 0 ? { top: r.top + 14, left: r.left + r.width / 2 } : null;
}

interface ToastState {
  id: number;
  message: string;
  action?: ToastOptions["action"];
  error: boolean;
  ms: number | null;
  at: { top: number; left: number } | null;
}

/** One live region (always mounted, positioned where the toast shows) and the card inside it while there is one. */
function ToastSlot({ live, toast, arm, dismiss }: { live: "polite" | "assertive"; toast: ToastState | null; arm: (ms: number | null) => void; dismiss: () => void }) {
  // Only a toast with a button or a long life takes the pointer; a plain one stays click-through.
  const interactive = !!toast && (!!toast.action || toast.error);
  return (
    <div
      role="status"
      aria-live={live}
      style={toast?.at ? { top: toast.at.top, left: toast.at.left, bottom: "auto" } : undefined}
      onPointerEnter={() => arm(null)}
      onPointerLeave={() => toast && arm(toast.ms)}
      onFocus={() => arm(null)}
      onBlur={() => toast && arm(toast.ms)}
      className={cn("fixed bottom-[38px] left-1/2 z-[100] -translate-x-1/2", !interactive && "pointer-events-none")}
    >
      {toast && (
        <div
          key={toast.id}
          className="flex items-center gap-3 rounded-lg bg-ui-inverse px-3 py-[7px] font-ui text-xs font-medium text-ui-inverse-fg shadow-ui-float"
        >
          {toast.message}
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action?.onClick();
                dismiss();
              }}
              className="rounded-sm font-semibold underline underline-offset-2 outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ui-accent"
            >
              {toast.action.label}
            </button>
          )}
          {interactive && (
            <button
              type="button"
              aria-label="Dismiss"
              onClick={dismiss}
              className="-mr-1 grid h-5 w-5 place-items-center rounded-sm outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ui-accent"
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
 * Hosts the toast: in Edit at the top centre of the canvas, elsewhere bottom-centre just above the status bar (never
 * over the title bar or a screen's header and tabs); inverse colours. A plain confirmation goes after ~1.8 s; a
 * failure after 8 s; one with an action (Undo) stays until dismissed. Hovering or focusing it pauses the timer. The
 * text is announced through two live regions kept mounted (polite, and an alert for failures) so it is reliably read.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const nextId = useRef(0);

  const arm = useCallback((ms: number | null) => {
    clearTimeout(timer.current);
    if (ms !== null) timer.current = setTimeout(() => setToast(null), ms);
  }, []);

  const show = useCallback<ShowToast>(
    (message, options) => {
      const ms = toastDuration(message, options);
      const error = options?.error ?? FAILURE.test(message);
      setToast({ id: nextId.current++, message, action: options?.action, error, ms, at: anchored() });
      arm(ms);
    },
    [arm]
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {/* Both live regions stay mounted (a region added together with its text is often not announced). */}
      <ToastSlot live="polite" toast={toast && !toast.error ? toast : null} arm={arm} dismiss={() => setToast(null)} />
      <ToastSlot live="assertive" toast={toast?.error ? toast : null} arm={arm} dismiss={() => setToast(null)} />
    </ToastContext.Provider>
  );
}

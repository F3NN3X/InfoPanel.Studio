import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** How long a toast stays up. */
export const TOAST_MS = 1800;

/** A toast with one button (Undo after a delete); it stays up `ms` (default `TOAST_MS`). */
export interface ToastOptions {
  action?: { label: string; onClick: () => void };
  ms?: number;
}

type ShowToast = (message: string, options?: ToastOptions) => void;

const ToastContext = createContext<ShowToast>(() => {});

/** `const toast = useToast(); toast("Copied")` — a no-op outside a provider. */
export function useToast(): ShowToast {
  return useContext(ToastContext);
}

/**
 * Hosts the toast: bottom-centre, just above the status bar (never over the title bar or a screen's header and tabs),
 * and above the canvas zoom bar where one is shown (`data-toast-above`); inverse colours, gone after ~1.8 s.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ id: number; message: string; action?: ToastOptions["action"] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const nextId = useRef(0);

  const show = useCallback<ShowToast>((message, options) => {
    clearTimeout(timer.current);
    setToast({ id: nextId.current++, message, action: options?.action });
    timer.current = setTimeout(() => setToast(null), options?.ms ?? TOAST_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <div
          key={toast.id}
          role="status"
          className={cn(
            "fixed bottom-[38px] left-1/2 z-[100] [:root:has([data-toast-above])_&]:bottom-[86px] flex -translate-x-1/2 items-center gap-3 rounded-lg bg-ui-inverse px-3 py-[7px] font-ui text-xs font-medium text-ui-inverse-fg shadow-ui-float",
            !toast.action && "pointer-events-none"
          )}
        >
          {toast.message}
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action?.onClick();
                setToast(null);
              }}
              className="rounded-sm font-semibold underline underline-offset-2 outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ui-accent"
            >
              {toast.action.label}
            </button>
          )}
        </div>
      )}
    </ToastContext.Provider>
  );
}

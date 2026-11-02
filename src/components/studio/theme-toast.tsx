import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { DashboardConfig } from "@/lib/layout";
import type { ToastText } from "./theme-messages";

const LINK = "shrink-0 rounded-sm text-body hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent";

/** How long a toast waits for the change it reports (a theme applies once its chunk has loaded). */
const LAND_MS = 2000;

/** A toast row: its text and, after a theme applied, Reset to ‹name› (fine-tune kept) and Make them follow (widgets kept). */
export interface ThemeToast extends ToastText {
  reset?: { label: string; run: () => void };
  follow?: { label: string; run: () => void };
}

/**
 * The toast row's state. It stays until ✕, the next toast, or the next change after the one it reports (its Undo
 * would undo that one instead); the change it reports may land later than the toast (a theme applies once its chunk
 * has loaded).
 */
export function useThemeToast(config: DashboardConfig) {
  const [toast, setToast] = useState<ThemeToast>();
  /** The config the toast's change made; undefined until it lands. */
  const landed = useRef<DashboardConfig>(undefined);
  const latest = useRef(config);
  latest.current = config;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!toast) return;
    if (!landed.current) landed.current = config;
    else if (config !== landed.current) setToast(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);
  const show = (next: ThemeToast) => {
    landed.current = undefined;
    // A change that hasn't landed by then won't (picking what is already set): the next edit, not this toast's, closes it.
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!landed.current) landed.current = latest.current;
    }, LAND_MS);
    setToast(next);
  };
  return { toast, show, dismiss: () => setToast(undefined) };
}

interface ThemeToastRowProps {
  toast: ThemeToast;
  onUndo: () => void;
  onDismiss: () => void;
}

/** The toast row under the preview's header (SPEC §4.4): green dot, title and sub-line, Reset to ‹name›, Make them follow, Undo and ✕. */
export function ThemeToastRow({ toast, onUndo, onDismiss }: ThemeToastRowProps) {
  return (
    <div role="status" className="flex w-full items-center gap-3 rounded-ui-menu border border-ui-strong bg-ui-panel px-3 py-[9px] text-body">
      <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-[#4ade80]" aria-hidden />
      <p className="min-w-0 flex-1">
        <b className="font-semibold text-ui-1">{toast.title}</b> <span className="text-ui-soft">{toast.sub}</span>
      </p>
      {toast.reset && (
        <button type="button" className={`${LINK} text-ui-accent`} onClick={toast.reset.run}>
          {toast.reset.label}
        </button>
      )}
      {toast.follow && (
        <button type="button" className={`${LINK} text-ui-accent`} onClick={toast.follow.run}>
          {toast.follow.label}
        </button>
      )}
      <button
        type="button"
        className={`${LINK} text-ui-soft`}
        onClick={() => {
          onDismiss();
          onUndo();
        }}
      >
        Undo
      </button>
      <button type="button" aria-label="Dismiss" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm text-ui-hint hover:text-ui-1" onClick={onDismiss}>
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

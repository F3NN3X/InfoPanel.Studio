import { useEffect, useRef, useState } from "react";
import { ToastCard, type ToastCardAction } from "@/components/ui/toast-provider";
import type { DashboardConfig } from "@/lib/layout";
import type { ToastText } from "./theme-messages";

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
  const actions: ToastCardAction[] = [
    ...(toast.reset ? [{ label: toast.reset.label, onClick: toast.reset.run, accent: true }] : []),
    ...(toast.follow ? [{ label: toast.follow.label, onClick: toast.follow.run, accent: true }] : []),
    {
      label: "Undo",
      onClick: () => {
        onDismiss();
        onUndo();
      },
    },
  ];
  return (
    <ToastCard
      role="status"
      icon={<span className="h-1.75 w-1.75 shrink-0 rounded-full bg-ui-saved" aria-hidden />}
      actions={actions}
      onDismiss={onDismiss}
      className="w-full border-ui-strong bg-ui-panel px-3 py-2.25 shadow-none"
    >
      <b className="font-medium text-ui-1">{toast.title}</b> <span className="text-ui-soft">{toast.sub}</span>
    </ToastCard>
  );
}

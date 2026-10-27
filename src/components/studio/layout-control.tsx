import { useState } from "react";
import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Grid3x3, LayoutTemplate, type LucideIcon } from "lucide-react";
import type { PageLayout } from "@/lib/layout";
import { cn } from "@/lib/utils";

/** A page's layout as the page tabs, the Layout control and the tab menu show it (one-editor SPEC §5.2, §6.1). */
export const LAYOUT_UI: Record<PageLayout, { label: string; sub: string; icon: LucideIcon; tip: string }> = {
  grid: { label: "Grid", sub: "Snap to cells", icon: Grid3x3, tip: "Grid page" },
  free: { label: "Free", sub: "Place anywhere", icon: LayoutTemplate, tip: "Free page" },
};

const HELP: Record<PageLayout, string> = {
  grid: "Grid → Free keeps every widget exactly where it is, in pixels.",
  free: "Free → Grid snaps each item to the nearest cells. Items that overlap stay together in one free area. Undo any time.",
};

interface LayoutControlProps {
  layout: PageLayout;
  onChange: (layout: PageLayout) => void;
  /** Why switching is off (the page's content isn't loaded yet); unset: on. */
  disabled?: string;
}

/** Layout (SPEC §6.1): Grid or Free, two 44 px options, and what a switch does. Page settings on both kinds of page. */
export function LayoutControl({ layout, onChange, disabled }: LayoutControlProps) {
  return (
    <div className="space-y-2">
      <div role="radiogroup" aria-label="Layout" className="grid grid-cols-2 gap-1 rounded-[8px] border border-ui-default bg-ui-app p-0.5" title={disabled}>
        {(["grid", "free"] as const).map((value) => {
          const { label, sub, icon: Icon } = LAYOUT_UI[value];
          const on = value === layout;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled !== undefined}
              onClick={() => !on && onChange(value)}
              className={cn(
                "flex h-11 items-center gap-2 rounded-[6px] px-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                on ? "bg-ui-active text-ui-1" : "text-ui-3 hover:text-ui-1",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
              <span className="min-w-0">
                <span className="block text-[12.5px] font-medium">{label}</span>
                <span className="block truncate text-[10.5px] text-ui-4">{sub}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[11.5px] leading-snug text-ui-4">{disabled ?? HELP[layout]}</p>
    </div>
  );
}

const BUTTON =
  "inline-flex h-8 items-center rounded-[7px] border border-ui-strong bg-ui-raised px-3 text-[12.5px] font-medium text-ui-2 transition-colors hover:bg-ui-hover hover:text-ui-1";

interface ToGridDialogProps {
  /** The parts that would stay together in one free area; the dialog is closed while unset. */
  parts: number | null;
  onConfirm: (askAgain: boolean) => void;
  onCancel: () => void;
}

/** The confirm before a Free → Grid switch that makes a free area (SPEC §6.3), with Don't ask again. */
export function ToGridDialog({ parts, onConfirm, onCancel }: ToGridDialogProps) {
  const [skip, setSkip] = useState(false);
  return (
    <AlertDialog.Root open={parts !== null} onOpenChange={(open) => !open && onCancel()}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
        <AlertDialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[26rem] -translate-x-1/2 -translate-y-1/2 space-y-3 rounded-xl border border-ui-strong bg-ui-raised p-4 font-ui text-ui-1 shadow-ui-modal outline-none">
          <AlertDialog.Title className="text-sm font-semibold text-ui-1">Switch this page to Grid?</AlertDialog.Title>
          <AlertDialog.Description className="text-xs leading-relaxed text-ui-3">
            {parts} {parts === 1 ? "part overlaps or is an InfoPanel item" : "parts overlap or are InfoPanel items"}. They'll stay together in one free area you can still edit freely.
          </AlertDialog.Description>
          <label className="flex items-center gap-2 text-[12px] text-ui-3">
            <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.currentTarget.checked)} className="h-3.5 w-3.5 accent-[oklch(0.72_0.15_255)]" />
            Don't ask again
          </label>
          <div className="flex items-center justify-end gap-2 pt-1">
            <AlertDialog.Close render={<button type="button" className={BUTTON} />}>Cancel</AlertDialog.Close>
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-[7px] bg-ui-inverse px-3 text-[12.5px] font-semibold text-ui-inverse-fg transition-opacity hover:opacity-90"
              onClick={() => onConfirm(!skip)}
            >
              Switch to Grid
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

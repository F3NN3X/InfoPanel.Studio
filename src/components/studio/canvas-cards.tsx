import { useState } from "react";
import { LayoutDashboard, X } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { TIPS, dismissTips, tipsDismissed } from "./quick-tips";

interface EmptyLayoutCardProps {
  /** Open the Add tab. */
  onBrowse: () => void;
  /** Import an .infopanel file onto this page. */
  onImport: () => void;
  /** Load the shipped sample layout into this profile. */
  onUseSample: () => void;
}

/** The card over an empty page (Edit v3 SPEC §15): Add, Import .infopanel, and the sample layout. */
export function EmptyLayoutCard({ onBrowse, onImport, onUseSample }: EmptyLayoutCardProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <div className="flex max-w-85 flex-col items-center gap-2.5 rounded-xl border border-ui-default bg-ui-panel px-7 py-6 text-center font-ui">
        <LayoutDashboard className="h-7 w-7 text-ui-hint" strokeWidth={1.5} />
        <div className="text-lead font-medium text-ui-1">Drop widgets or InfoPanel items here</div>
        <div className="pointer-events-auto mt-1.5 flex gap-2">
          <button
            type="button"
            onClick={onBrowse}
            className="h-7.5 rounded-7 bg-ui-inverse px-3 text-caption font-medium text-ui-inverse-fg transition-opacity hover:opacity-90"
          >
            Add
          </button>
          <button
            type="button"
            onClick={onImport}
            className="h-7.5 rounded-7 border border-ui-strong bg-ui-raised px-3 text-caption text-ui-1 transition-colors hover:bg-ui-hover"
          >
            Import .infopanel
          </button>
        </div>
        <button type="button" onClick={onUseSample} className="pointer-events-auto text-micro text-ui-4 underline-offset-2 hover:text-ui-2 hover:underline">
          Use sample layout
        </button>
      </div>
    </div>
  );
}

/** One tip line; a lone `?` becomes a keycap. */
function TipLine({ text }: { text: string }) {
  const [before, after] = text.split("?");
  return after === undefined ? (
    text
  ) : (
    <>
      {before}
      <Kbd className="h-auto min-w-0 rounded-4 bg-transparent px-1 py-0 text-micro leading-[1.6] text-ui-soft">?</Kbd>
      {after}
    </>
  );
}

/** The first-run tips, in the inspector's nothing-selected body (never over the canvas); dismissing them is remembered. */
export function QuickTipsCard() {
  const [open, setOpen] = useState(() => !tipsDismissed());
  if (!open) return null;
  return (
    <div className="mx-3.5 my-3 flex flex-col gap-2 rounded-10 border border-ui-strong bg-ui-raised px-3.5 py-3 font-ui">
      <div className="flex items-center justify-between">
        <span className="text-body font-medium text-ui-1">Quick tips</span>
        <button
          type="button"
          title="Dismiss"
          aria-label="Dismiss"
          onClick={() => {
            dismissTips();
            setOpen(false);
          }}
          className="text-ui-3 transition-colors hover:text-ui-1"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="text-micro leading-[1.6] text-ui-soft">
        {TIPS.map((line) => (
          <div key={line}>
            <TipLine text={line} />
          </div>
        ))}
      </div>
    </div>
  );
}

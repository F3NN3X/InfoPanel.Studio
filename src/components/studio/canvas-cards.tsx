import { useState } from "react";
import { LayoutDashboard, X } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { TIPS, dismissTips, tipsDismissed } from "./quick-tips";

interface EmptyLayoutCardProps {
  /** Open the Add drawer. */
  onBrowse: () => void;
  /** Load the shipped sample layout into this profile. */
  onUseSample: () => void;
}

/** The card over a canvas whose profile has no zones. */
export function EmptyLayoutCard({ onBrowse, onUseSample }: EmptyLayoutCardProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <div className="flex max-w-[340px] flex-col items-center gap-2.5 rounded-xl border border-ui-default bg-ui-panel px-7 py-6 text-center font-ui">
        <LayoutDashboard className="h-7 w-7 text-[#8a8a94]" strokeWidth={1.5} />
        <div className="text-[14px] font-semibold text-ui-1">This layout is empty</div>
        <p className="text-pretty text-[12px] leading-normal text-ui-3">
          Drag a widget from the library onto the grid, or start from the sample layout.
        </p>
        <div className="pointer-events-auto mt-1.5 flex gap-2">
          <button
            type="button"
            onClick={onBrowse}
            className="h-[30px] rounded-[7px] bg-ui-inverse px-3 text-[12px] font-semibold text-ui-inverse-fg transition-opacity hover:opacity-90"
          >
            Browse widgets
          </button>
          <button
            type="button"
            onClick={onUseSample}
            className="h-[30px] rounded-[7px] border border-ui-strong bg-ui-raised px-3 text-[12px] text-ui-1 transition-colors hover:bg-ui-hover"
          >
            Use sample layout
          </button>
        </div>
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
      <Kbd className="h-auto min-w-0 rounded-[4px] bg-transparent px-1 py-0 text-[11.5px] leading-[1.6] text-[#b4b4bc]">?</Kbd>
      {after}
    </>
  );
}

/** The first-run tips card (bottom-left, 64 px up, 250 wide); dismissing it is remembered. */
export function QuickTipsCard() {
  const [open, setOpen] = useState(() => !tipsDismissed());
  if (!open) return null;
  return (
    <div className="absolute bottom-16 left-4 z-20 flex w-[250px] flex-col gap-2 rounded-[10px] border border-ui-strong bg-ui-raised px-3.5 py-3 font-ui shadow-ui-float">
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] font-semibold text-ui-1">Quick tips</span>
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
      <div className="text-[11.5px] leading-[1.6] text-[#b4b4bc]">
        {TIPS.map((line) => (
          <div key={line}>
            <TipLine text={line} />
          </div>
        ))}
      </div>
    </div>
  );
}

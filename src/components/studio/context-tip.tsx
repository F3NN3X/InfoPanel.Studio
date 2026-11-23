import { useState } from "react";
import { X } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { dismissTips, tipsDismissed } from "./quick-tips";

/** A tip line; a lone `?` becomes a keycap. */
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

/** A hint beside the control it explains; dismissing it is remembered, once, for every tip. */
export function ContextTip({ text }: { text: string }) {
  const [open, setOpen] = useState(() => !tipsDismissed());
  if (!open) return null;
  return (
    <div data-testid="context-tip" className="mx-3.5 my-2 flex items-start gap-2 font-ui text-micro leading-[1.6] text-ui-soft">
      <span className="min-w-0 flex-1">
        <TipLine text={text} />
      </span>
      <button
        type="button"
        title="Dismiss tip"
        aria-label="Dismiss tip"
        onClick={() => {
          dismissTips();
          setOpen(false);
        }}
        className="mt-0.5 shrink-0 text-ui-3 transition-colors hover:text-ui-1"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

import { useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { useElementSize } from "@/hooks/use-element-size";
import { BottomSheet } from "./bottom-sheet";
import { sheetHeight, type SheetSnap } from "./studio-layout";

interface PaneSheetProps {
  /** Names the sheet for assistive tech. */
  label: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * A detail pane as a bottom sheet over its page (a narrow viewport): the studio's `BottomSheet` with
 * its own snaps, measured against the positioned parent it covers. Opens at half height; the handle
 * drags or toggles it, and the close button dismisses it.
 */
export function PaneSheet({ label, onClose, children }: PaneSheetProps) {
  const { ref, h } = useElementSize();
  const [snap, setSnap] = useState<SheetSnap>("half");
  const [drag, setDrag] = useState<number | null>(null);
  return (
    // The wrapper only measures: the sheet takes the pointer, the page under it keeps it.
    <div ref={ref} role="region" aria-label={label} className="pointer-events-none absolute inset-0 z-40 [&>*]:pointer-events-auto">
      {h > 0 && (
        <BottomSheet snap={snap} onSnap={setSnap} height={drag ?? sheetHeight(snap, h, true)} area={h} selected drag={drag} onDrag={setDrag}>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="flex shrink-0 justify-end px-2">
              <button
                type="button"
                aria-label="Close"
                onClick={onClose}
                className="flex h-7 w-7 items-center justify-center rounded-[7px] text-ui-3 hover:bg-ui-hover hover:text-ui-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex min-h-0 flex-1">{children}</div>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}

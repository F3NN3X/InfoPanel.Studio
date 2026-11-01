import { useRef } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { SHORTCUT_GROUPS } from "./use-studio-shortcuts";

interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The keyboard shortcut sheet ("?", the rail's keyboard icon, or ⋯ → Keyboard shortcuts). */
export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  const popupRef = useRef<HTMLDivElement>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/55" />
        <Dialog.Popup
          ref={popupRef}
          initialFocus={popupRef}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[80vh] w-[min(880px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-ui-strong bg-ui-tile px-5 py-[18px] font-ui text-ui-1 shadow-ui-modal outline-none"
        >
          <div className="mb-2 flex shrink-0 items-center">
            <Dialog.Title className="flex-1 text-sm font-semibold">Keyboard shortcuts</Dialog.Title>
            <Dialog.Close title="Close (Esc)" aria-label="Close" className="grid h-8 w-8 place-items-center rounded-md text-ui-3 transition-colors hover:text-ui-1">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto sm:columns-2 sm:gap-10">
            {SHORTCUT_GROUPS.map((group) => (
              <section key={group.title} className="break-inside-avoid">
                <div className="pb-1 pt-3 text-micro font-medium uppercase tracking-wider text-ui-hint">{group.title}</div>
                <dl>
                  {group.items.map((item) => (
                    <div key={item.label} className="flex items-center gap-3 border-b border-ui-subtle py-[7px] text-[12.5px]">
                      <dt className="min-w-0 flex-1 text-ui-2">{item.label}</dt>
                      <dd className="shrink-0 rounded-[5px] border border-ui-menu px-[7px] py-0.5 font-ui-mono text-[11px] text-ui-1">
                        {item.keys}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
            <p className="break-inside-avoid pt-3 text-[11px] text-ui-4">
              Plain keys are ignored while typing in a field; Esc, Ctrl+S, undo and redo always work.
            </p>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

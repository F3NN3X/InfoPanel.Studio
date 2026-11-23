import { useRef } from "react";
import { DialogParts } from "@/components/ui/dialog";
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
    <DialogParts.Root open={open} onOpenChange={onOpenChange}>
      <DialogParts.Content
        layout="panel"
        ref={popupRef}
        initialFocus={popupRef}
        className="flex max-h-[80vh] w-[min(880px,calc(100vw-32px))] flex-col rounded-xl bg-ui-tile px-5 py-4.5"
      >
        <div className="mb-2 flex shrink-0 items-center">
          <DialogParts.Title className="flex-1 text-sm font-medium">Keyboard shortcuts</DialogParts.Title>
          <DialogParts.Close title="Close (Esc)" aria-label="Close" className="grid h-8 w-8 place-items-center rounded-md text-ui-3 transition-colors hover:text-ui-1">
            <X className="h-4 w-4" />
          </DialogParts.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto sm:columns-2 sm:gap-10">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} className="break-inside-avoid">
              <div className="pb-1 pt-3 text-caption font-medium text-ui-3">{group.title}</div>
              <dl>
                {group.items.map((item) => (
                  <div key={item.label} className="flex items-center gap-3 border-b border-ui-subtle py-1.75 text-body">
                    <dt className="min-w-0 flex-1 text-ui-2">{item.label}</dt>
                    <dd className="shrink-0 rounded-6 border border-ui-menu px-1.75 py-0.5 font-ui-mono text-micro text-ui-1">
                      {item.keys}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          <p className="break-inside-avoid pt-3 text-micro text-ui-4">
            Plain keys are ignored while typing in a field; Esc, Ctrl+S, undo and redo always work.
          </p>
        </div>
      </DialogParts.Content>
    </DialogParts.Root>
  );
}

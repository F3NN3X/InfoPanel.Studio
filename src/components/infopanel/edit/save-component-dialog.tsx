/**
 * "Save as component": names the selection before it goes to the Library's Components collection.
 */
import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";

interface SaveComponentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** How many top-level items the component will hold. */
  count: number;
  initialName: string;
  onSave: (name: string) => void;
  /** The Help article F1 opens: the InfoPanel editor's unless the caller names another. */
  helpArticle?: string;
}

const INPUT = "h-8 w-full min-w-0 rounded-[7px] border border-ui-default bg-ui-raised px-2.5 text-[12.5px] text-ui-1 outline-none focus:border-ui-accent";

export function SaveComponentDialog({ open, onOpenChange, count, initialName, onSave, helpArticle = "infopanel-editor" }: SaveComponentDialogProps) {
  const [name, setName] = useState(initialName);
  const ok = name.trim() !== "";
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Popup
          data-help-article={helpArticle}
          className="fixed left-1/2 top-1/2 z-50 w-[min(420px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[14px] border border-ui-strong bg-ui-panel font-ui text-ui-1 shadow-ui-modal outline-none"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (ok) {
                onSave(name.trim());
                onOpenChange(false);
              }
            }}
          >
            <div className="flex items-center gap-3 border-b border-ui-subtle px-5 py-3.5">
              <Dialog.Title className="flex-1 text-[15px] font-semibold">Save as component</Dialog.Title>
              <Dialog.Close aria-label="Close" className="grid h-7 w-7 place-items-center rounded-md text-ui-4 hover:bg-ui-hover hover:text-ui-1">
                <X className="h-4 w-4" />
              </Dialog.Close>
            </div>
            <div className="space-y-3 px-5 py-4">
              <label className="block">
                <span className="mb-1 block text-caption text-ui-3">Name</span>
                <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" className={INPUT} />
              </label>
              <p className="text-[11.5px] leading-snug text-ui-4">
                {count === 1 ? "The selected item goes" : `The ${count} selected items go`} to the Library as a component, with the files and profile colors{" "}
                {count === 1 ? "it uses" : "they use"}. Drag it onto any screen or into an InfoPanel profile; sensors are matched to that PC.
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-ui-subtle px-5 py-3">
              <Dialog.Close type="button" className="h-8 rounded-ui-md px-3 text-[12.5px] text-ui-3 hover:text-ui-1">
                Cancel
              </Dialog.Close>
              <button type="submit" disabled={!ok} className="h-8 rounded-ui-md bg-ui-accent px-4 text-[12.5px] font-medium text-ui-inverse-fg hover:opacity-90 disabled:opacity-40">
                Save
              </button>
            </div>
          </form>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

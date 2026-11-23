/**
 * "Save as component": names the selection before it goes to the Library's Components collection.
 */
import { useState } from "react";
import { DialogParts } from "@/components/ui/dialog";
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

const INPUT = "h-8 w-full min-w-0 rounded-7 border border-ui-default bg-ui-raised px-2.5 text-small text-ui-1 outline-none focus:border-ui-accent";

export function SaveComponentDialog({ open, onOpenChange, count, initialName, onSave, helpArticle = "infopanel-editor" }: SaveComponentDialogProps) {
  const [name, setName] = useState(initialName);
  const ok = name.trim() !== "";
  return (
    <DialogParts.Root open={open} onOpenChange={onOpenChange}>
      <DialogParts.Content
        layout="panel"
        data-help-article={helpArticle}
        className="w-[min(420px,calc(100vw-32px))] overflow-hidden rounded-14 bg-ui-panel"
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
            <DialogParts.Title className="flex-1 text-title font-medium">Save as component</DialogParts.Title>
            <DialogParts.Close aria-label="Close" className="grid h-7 w-7 place-items-center rounded-md text-ui-4 hover:bg-ui-hover hover:text-ui-1">
              <X className="h-4 w-4" />
            </DialogParts.Close>
          </div>
          <div className="space-y-3 px-5 py-4">
            <label className="block">
              <span className="mb-1 block text-caption text-ui-3">Name</span>
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} aria-label="Name" className={INPUT} />
            </label>
            <p className="text-label leading-snug text-ui-4">
              {count === 1 ? "The selected item goes" : `The ${count} selected items go`} to the Library as a component, with the files and profile colors{" "}
              {count === 1 ? "it uses" : "they use"}. Drag it onto any screen or into an InfoPanel profile; sensors are matched to that PC.
            </p>
          </div>
          <div className="flex justify-end gap-2 border-t border-ui-subtle px-5 py-3">
            <DialogParts.Close type="button" className="h-8 rounded-ui-md px-3 text-small text-ui-3 hover:text-ui-1">
              Cancel
            </DialogParts.Close>
            <button type="submit" disabled={!ok} className="h-8 rounded-ui-md bg-ui-inverse px-4 text-body font-medium text-ui-inverse-fg hover:bg-white disabled:opacity-40">
              Save
            </button>
          </div>
        </form>
      </DialogParts.Content>
    </DialogParts.Root>
  );
}

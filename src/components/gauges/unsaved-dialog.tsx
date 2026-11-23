/** "Unsaved changes" on back from the editor (spec §10): Save to library, Discard, or Cancel. */
import { useRef } from "react";
import { DialogParts } from "@/components/ui/dialog";

export interface UnsavedDialogProps {
  open: boolean;
  name: string;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function UnsavedDialog({ open, name, saving, onSave, onDiscard, onCancel }: UnsavedDialogProps) {
  // Cancel is the safe way out, so it has focus.
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <DialogParts.Root open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogParts.Content initialFocus={cancel}>
        <DialogParts.Title className="text-sm font-medium text-ui-1">Unsaved changes</DialogParts.Title>
        <DialogParts.Description className="text-xs leading-relaxed text-ui-3">
          “{name}” has changes that are not in your library. Save them, or discard them and go back.
        </DialogParts.Description>
        <div className="flex justify-end gap-2 pt-1">
          <button ref={cancel} type="button" onClick={onCancel} className="h-8 rounded-ui-md border border-ui-default px-3 text-small text-ui-1 hover:bg-ui-hover">
            Cancel
          </button>
          <button type="button" onClick={onDiscard} className="h-8 rounded-ui-md border border-ui-danger/40 px-3 text-small text-ui-danger hover:bg-ui-danger/15">
            Discard
          </button>
          <button type="button" onClick={onSave} disabled={saving} className="h-8 rounded-ui-md bg-ui-inverse px-3 text-small font-medium text-ui-inverse-fg hover:opacity-90 disabled:opacity-50">
            Save to library
          </button>
        </div>
      </DialogParts.Content>
    </DialogParts.Root>
  );
}

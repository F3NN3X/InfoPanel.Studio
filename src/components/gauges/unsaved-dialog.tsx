/** "Unsaved changes" on back from the editor (spec §10): Save to library, Discard, or Cancel. */
import { Dialog } from "@base-ui/react/dialog";

export interface UnsavedDialogProps {
  open: boolean;
  name: string;
  saving: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}

export function UnsavedDialog({ open, name, saving, onSave, onDiscard, onCancel }: UnsavedDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onCancel()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Popup className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100vh-2rem)] w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 space-y-3 overflow-y-auto rounded-xl border border-ui-strong bg-ui-raised p-4 font-ui text-ui-1 shadow-ui-modal outline-none">
          <Dialog.Title className="text-sm font-semibold text-ui-1">Unsaved changes</Dialog.Title>
          <Dialog.Description className="text-xs leading-relaxed text-ui-3">
            “{name}” has changes that are not in your library. Save them, or discard them and go back.
          </Dialog.Description>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onCancel} className="h-8 rounded-[8px] border border-ui-default px-3 text-[12.5px] text-ui-1 hover:bg-ui-hover">
              Cancel
            </button>
            <button type="button" onClick={onDiscard} className="h-8 rounded-[8px] border border-ui-default px-3 text-[12.5px] text-ui-1 hover:bg-ui-hover">
              Discard
            </button>
            <button type="button" onClick={onSave} disabled={saving} className="h-8 rounded-[8px] bg-ui-inverse px-3 text-[12.5px] font-medium text-ui-inverse-fg hover:opacity-90 disabled:opacity-50">
              Save to library
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

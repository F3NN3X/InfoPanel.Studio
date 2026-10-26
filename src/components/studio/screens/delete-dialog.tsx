import { AlertDialog } from "@base-ui/react/alert-dialog";

const DIALOG_BUTTON =
  "inline-flex h-8 items-center rounded-[7px] border border-ui-strong bg-ui-raised px-3 text-[12.5px] font-medium text-ui-2 transition-colors hover:bg-ui-hover hover:text-ui-1";

interface DeleteDialogProps {
  /** What goes; null keeps the dialog closed. */
  name: string | null;
  /** What goes with it and what else changes (`deleteLines` for a screen). */
  lines: readonly string[];
  /** The red button's words. */
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}

/** Confirm a delete (a screen, an InfoPanel profile): names what goes with it and what else changes. The delete itself is one undo step. */
export function DeleteDialog({ name, lines, confirmLabel = "Delete screen", onConfirm, onClose }: DeleteDialogProps) {
  return (
    <AlertDialog.Root open={name !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
        <AlertDialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 space-y-3 rounded-xl border border-ui-strong bg-ui-raised p-4 font-ui text-ui-1 shadow-ui-modal outline-none">
          <AlertDialog.Title className="text-sm font-semibold text-ui-1">Delete {name}?</AlertDialog.Title>
          <AlertDialog.Description render={<div />} className="space-y-1.5 text-xs leading-relaxed text-ui-3">
            {lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </AlertDialog.Description>
          <div className="flex items-center justify-end gap-2 pt-1">
            <AlertDialog.Close render={<button type="button" className={DIALOG_BUTTON} />}>Cancel</AlertDialog.Close>
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-[7px] bg-ui-danger px-3 text-[12.5px] font-semibold text-ui-inverse-fg transition-opacity hover:opacity-90"
              onClick={() => {
                onConfirm();
                onClose();
              }}
            >
              {confirmLabel}
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

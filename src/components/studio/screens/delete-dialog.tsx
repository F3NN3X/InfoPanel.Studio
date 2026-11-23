import { AlertDialogParts } from "@/components/ui/dialog";

const DIALOG_BUTTON =
  "inline-flex h-8 items-center rounded-8 border border-ui-strong bg-ui-raised px-3 text-body font-medium text-ui-2 transition-colors hover:bg-ui-hover hover:text-ui-1";

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
    <AlertDialogParts.Root open={name !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogParts.Content className="w-[min(24rem,calc(100vw-2rem))]">
        <AlertDialogParts.Title className="text-sm font-medium text-ui-1">Delete {name}?</AlertDialogParts.Title>
        <AlertDialogParts.Description render={<div />} className="space-y-1.5 text-xs leading-relaxed text-ui-3">
          {lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </AlertDialogParts.Description>
        <div className="flex items-center justify-end gap-2 pt-1">
          <AlertDialogParts.Close render={<button type="button" className={DIALOG_BUTTON} />}>Cancel</AlertDialogParts.Close>
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-8 bg-ui-danger px-3 text-body font-medium text-ui-inverse-fg transition-opacity hover:opacity-90"
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </AlertDialogParts.Content>
    </AlertDialogParts.Root>
  );
}

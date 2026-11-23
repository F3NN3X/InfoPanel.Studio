import { AlertDialogParts } from "@/components/ui/dialog";
import { Download } from "lucide-react";

const BUTTON =
  "inline-flex h-8 items-center gap-1.5 rounded-ui-md border border-ui-strong bg-ui-raised px-3 text-body font-medium text-ui-2 transition-colors hover:bg-ui-hover hover:text-ui-1";

interface ResetConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: () => void;
  onReset: () => void;
}

/** Confirm "Reset everything…": it wipes the whole config. */
export function ResetConfigDialog({ open, onOpenChange, onExport, onReset }: ResetConfigDialogProps) {
  return (
    <AlertDialogParts.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogParts.Content>
        <AlertDialogParts.Title>Reset everything?</AlertDialogParts.Title>
        <AlertDialogParts.Description>
          This wipes every screen and its zones, the theme, Styles
          and all widget settings, and restores the default dashboard on
          every kiosk at once. It can't be undone — back up first to keep a
          copy.
        </AlertDialogParts.Description>
        <div className="flex items-center gap-2 pt-1">
          <button type="button" className={BUTTON} onClick={onExport}>
            <Download className="h-3.5 w-3.5" /> Back up first
          </button>
          <AlertDialogParts.Close render={<button type="button" className={`${BUTTON} ml-auto`} />}>
            Cancel
          </AlertDialogParts.Close>
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-ui-md bg-ui-danger px-3 text-body font-medium text-ui-inverse-fg transition-opacity hover:opacity-90"
            onClick={() => {
              onReset();
              onOpenChange(false);
            }}
          >
            Reset everything
          </button>
        </div>
      </AlertDialogParts.Content>
    </AlertDialogParts.Root>
  );
}

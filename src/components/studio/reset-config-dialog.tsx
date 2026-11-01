import { AlertDialog } from "@base-ui/react/alert-dialog";
import { Download } from "lucide-react";

const BUTTON =
  "inline-flex h-8 items-center gap-1.5 rounded-[7px] border border-ui-strong bg-ui-raised px-3 text-[12.5px] font-medium text-ui-2 transition-colors hover:bg-ui-hover hover:text-ui-1";

interface ResetConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: () => void;
  onReset: () => void;
}

/** Confirm "Reset everything…": it wipes the whole config. */
export function ResetConfigDialog({ open, onOpenChange, onExport, onReset }: ResetConfigDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
        <AlertDialog.Popup className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100vh-2rem)] w-[min(26rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 space-y-3 overflow-y-auto rounded-xl border border-ui-strong bg-ui-raised p-4 font-ui text-ui-1 shadow-ui-modal outline-none">
          <AlertDialog.Title className="text-sm font-semibold text-ui-1">Reset everything?</AlertDialog.Title>
          <AlertDialog.Description className="text-xs leading-relaxed text-ui-3">
            This wipes every screen and its zones, the theme, Styles
            and all widget settings, and restores the default dashboard on
            every kiosk at once. It can't be undone — back up first to keep a
            copy.
          </AlertDialog.Description>
          <div className="flex items-center gap-2 pt-1">
            <button type="button" className={BUTTON} onClick={onExport}>
              <Download className="h-3.5 w-3.5" /> Back up first
            </button>
            <AlertDialog.Close render={<button type="button" className={`${BUTTON} ml-auto`} />}>
              Cancel
            </AlertDialog.Close>
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-[7px] bg-ui-danger px-3 text-[12.5px] font-semibold text-ui-inverse-fg transition-opacity hover:opacity-90"
              onClick={() => {
                onReset();
                onOpenChange(false);
              }}
            >
              Reset everything
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

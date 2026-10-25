import { AlertDialog } from "@base-ui/react/alert-dialog";
import { deleteLines, type DeletePlan } from "@/lib/screens/delete-plan";

const DIALOG_BUTTON =
  "inline-flex h-8 items-center rounded-[7px] border border-ui-strong bg-ui-raised px-3 text-[12.5px] font-medium text-ui-2 transition-colors hover:bg-ui-hover hover:text-ui-1";

/** Confirm deleting a screen: names what goes with it and what else changes. The delete itself is one undo step. */
export function DeleteDialog({ plan, onConfirm, onClose }: { plan: DeletePlan | null; onConfirm: () => void; onClose: () => void }) {
  return (
    <AlertDialog.Root open={plan !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
        <AlertDialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 space-y-3 rounded-xl border border-ui-strong bg-ui-raised p-4 font-ui text-ui-1 shadow-ui-modal outline-none">
          <AlertDialog.Title className="text-sm font-semibold text-ui-1">Delete {plan?.name}?</AlertDialog.Title>
          <AlertDialog.Description render={<div />} className="space-y-1.5 text-xs leading-relaxed text-ui-3">
            {plan && deleteLines(plan).map((line) => <p key={line}>{line}</p>)}
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
              Delete screen
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

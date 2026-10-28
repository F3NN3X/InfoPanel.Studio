import { AlertDialog } from "@base-ui/react/alert-dialog";
import type { SectionId } from "@/lib/theme-model";
import type { MakeThemeTarget } from "./inherit-chip";
import { sectionTitle } from "./theme-editor-model";

/** What a confirmed "Make this the theme for…" does: the sections it moves, and where. */
export interface MakeThemePending {
  target: MakeThemeTarget;
  sections: readonly SectionId[];
}

interface MakeThemeDialogProps {
  pending: MakeThemePending | null;
  /** The names the targets read as ("Desk bar", "Gaming"). */
  screenName: string;
  pageName: string;
  onConfirm: (pending: MakeThemePending) => void;
  onClose: () => void;
}

const DIALOG_BUTTON =
  "inline-flex h-8 items-center rounded-[7px] border border-ui-strong bg-ui-raised px-3 text-[12.5px] font-medium text-ui-2 transition-colors hover:bg-ui-hover hover:text-ui-1";

/** Confirm moving a widget's custom sections into a scope's theme, listing them. */
export function MakeThemeDialog({ pending, screenName, pageName, onConfirm, onClose }: MakeThemeDialogProps) {
  const where = pending?.target === "screen" ? screenName : pageName;
  // The widget colors sit in the Colors card: list each card once.
  const titles = [...new Set((pending?.sections ?? []).map((sec) => (sec === "palette" ? "Colors" : sectionTitle(sec))))];
  return (
    <AlertDialog.Root open={pending !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-black/50" />
        <AlertDialog.Popup className="fixed left-1/2 top-1/2 z-50 w-[24rem] -translate-x-1/2 -translate-y-1/2 space-y-3 rounded-xl border border-ui-strong bg-ui-raised p-4 font-ui text-ui-1 shadow-ui-modal outline-none">
          <AlertDialog.Title className="text-sm font-semibold text-ui-1">Make this the theme for {where}?</AlertDialog.Title>
          <AlertDialog.Description className="text-xs leading-relaxed text-ui-3">
            These sections of the widget move into the theme, and the widget follows it again. Undo (Ctrl+Z) brings them back.
          </AlertDialog.Description>
          <ul className="list-disc space-y-0.5 pl-5 text-[12.5px] text-ui-2">
            {titles.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <div className="flex items-center justify-end gap-2 pt-1">
            <AlertDialog.Close render={<button type="button" className={DIALOG_BUTTON} />}>Cancel</AlertDialog.Close>
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-[7px] bg-ui-accent px-3 text-[12.5px] font-semibold text-ui-inverse-fg transition-opacity hover:opacity-90"
              onClick={() => {
                if (pending) onConfirm(pending);
                onClose();
              }}
            >
              Make theme
            </button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

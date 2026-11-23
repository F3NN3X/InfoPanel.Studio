import { AlertDialogParts } from "@/components/ui/dialog";
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
  "inline-flex h-8 items-center rounded-ui-md border border-ui-strong bg-ui-raised px-3 text-body font-medium text-ui-2 transition-colors hover:bg-ui-hover hover:text-ui-1";

/** Confirm moving a widget's custom sections into a scope's theme, listing them. */
export function MakeThemeDialog({ pending, screenName, pageName, onConfirm, onClose }: MakeThemeDialogProps) {
  const where = pending?.target === "screen" ? screenName : pageName;
  // The widget colors sit in the Colors card: list each card once.
  const titles = [...new Set((pending?.sections ?? []).map((sec) => (sec === "palette" ? "Colors" : sectionTitle(sec))))];
  return (
    <AlertDialogParts.Root open={pending !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogParts.Content className="w-[min(24rem,calc(100vw-2rem))]">
        <AlertDialogParts.Title>Make this the theme for {where}?</AlertDialogParts.Title>
        <AlertDialogParts.Description>
          These sections of the widget move into the theme, and the widget follows it again. Undo (Ctrl+Z) brings them back.
        </AlertDialogParts.Description>
        <ul className="list-disc space-y-0.5 pl-5 text-body text-ui-2">
          {titles.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <div className="flex items-center justify-end gap-2 pt-1">
          <AlertDialogParts.Close render={<button type="button" className={DIALOG_BUTTON} />}>Cancel</AlertDialogParts.Close>
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-ui-md bg-ui-inverse px-3 text-body font-medium text-ui-inverse-fg transition-colors hover:bg-white"
            onClick={() => {
              if (pending) onConfirm(pending);
              onClose();
            }}
          >
            Make theme
          </button>
        </div>
      </AlertDialogParts.Content>
    </AlertDialogParts.Root>
  );
}

import { useRef } from "react";
import { AlertDialogParts } from "@/components/ui/dialog";
import type { LibraryItem } from "@/lib/library";
import type { DeletePlan } from "./multi-delete";

const BUTTON =
  "inline-flex h-8 items-center gap-1.5 rounded-ui-md border border-ui-strong bg-ui-raised px-3 text-body font-medium text-ui-2 transition-colors hover:bg-ui-hover hover:text-ui-1";

interface RemoveItemDialogProps {
  /** The item to confirm, or null when closed. */
  item: LibraryItem | null;
  onClose: () => void;
  onRemove: (item: LibraryItem) => void;
  /** The action's word: "Remove" (Library) or "Delete" (Gauges). */
  verb?: "Remove" | "Delete";
}

/** Confirm removing a library item: placed copies stay, its file goes when nothing else uses it. */
export function RemoveItemDialog({ item, onClose, onRemove, verb = "Remove" }: RemoveItemDialogProps) {
  // The last item stays on screen while the dialog animates out.
  const last = useRef(item);
  if (item) last.current = item;
  const shown = item ?? last.current;
  const copies = shown?.copies.length ?? 0;
  return (
    <AlertDialogParts.Root open={item !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogParts.Content>
        <AlertDialogParts.Title>{verb} “{shown?.name}”?</AlertDialogParts.Title>
        <AlertDialogParts.Description>
          It leaves My library{copies > 0 ? `; the ${copies === 1 ? "copy" : `${copies} copies`} already placed stay where they are` : ""}. Its file is deleted too,
          unless a screen, a canvas or another item still uses it.
        </AlertDialogParts.Description>
        <div className="flex items-center justify-end gap-2 pt-1">
          <AlertDialogParts.Close render={<button type="button" className={BUTTON} />}>Cancel</AlertDialogParts.Close>
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-ui-md bg-ui-danger px-3 text-body font-medium text-ui-inverse-fg transition-opacity hover:opacity-90"
            onClick={() => {
              if (item) onRemove(item);
              onClose();
            }}
          >
            {verb}
          </button>
        </div>
      </AlertDialogParts.Content>
    </AlertDialogParts.Root>
  );
}

interface RemoveManyDialogProps {
  /** The files to confirm, or null when closed. */
  items: readonly LibraryItem[] | null;
  onClose: () => void;
  onRemove: (items: readonly LibraryItem[]) => void;
}

/** Confirm removing several files at once (Not used › Remove these files…): one a screen uses stays. */
export function RemoveManyDialog({ items, onClose, onRemove }: RemoveManyDialogProps) {
  const last = useRef(items);
  if (items) last.current = items;
  const n = (items ?? last.current)?.length ?? 0;
  return (
    <AlertDialogParts.Root open={items !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogParts.Content>
        <AlertDialogParts.Title>
          Remove {n} file{n === 1 ? "" : "s"}?
        </AlertDialogParts.Title>
        <AlertDialogParts.Description>
          {n === 1 ? "It leaves" : "They leave"} My library and {n === 1 ? "its file is" : "their files are"} deleted for good. Each file is checked
          again first: one that a screen, a canvas or another item uses stays.
        </AlertDialogParts.Description>
        <div className="flex items-center justify-end gap-2 pt-1">
          <AlertDialogParts.Close render={<button type="button" className={BUTTON} />}>Cancel</AlertDialogParts.Close>
          <button
            type="button"
            className="inline-flex h-8 items-center rounded-ui-md bg-ui-danger px-3 text-body font-medium text-ui-inverse-fg transition-opacity hover:opacity-90"
            onClick={() => {
              if (items) onRemove(items);
              onClose();
            }}
          >
            Remove
          </button>
        </div>
      </AlertDialogParts.Content>
    </AlertDialogParts.Root>
  );
}

interface DeleteSelectedDialogProps {
  /** What the selection comes to, or null when closed. */
  plan: DeletePlan | null;
  onClose: () => void;
  onDelete: (items: readonly LibraryItem[]) => void;
}

const names = (items: readonly LibraryItem[]) => {
  const shown = items.slice(0, 4).map((i) => i.name);
  return items.length > shown.length ? `${shown.join(", ")} and ${items.length - shown.length} more` : shown.join(", ");
};

/** Confirm deleting the selected cards: what goes, and what stays (built-ins, and files a screen uses) with the reason. */
export function DeleteSelectedDialog({ plan, onClose, onDelete }: DeleteSelectedDialogProps) {
  const last = useRef(plan);
  if (plan) last.current = plan;
  const shown = plan ?? last.current;
  const remove = shown?.remove ?? [];
  const builtin = (shown?.kept ?? []).filter((k) => k.why === "built-in").map((k) => k.item);
  const used = (shown?.kept ?? []).filter((k) => k.why === "used").map((k) => k.item);
  const n = remove.length;
  return (
    <AlertDialogParts.Root open={plan !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogParts.Content className="w-[min(28rem,calc(100vw-2rem))]">
        <AlertDialogParts.Title>{n > 0 ? `Delete ${n} item${n === 1 ? "" : "s"}?` : "Nothing to delete"}</AlertDialogParts.Title>
        <AlertDialogParts.Description render={<div />} className="space-y-2 text-caption leading-relaxed text-ui-3">
          {n > 0 && (
            <p>
              <span className="text-ui-2">{names(remove)}</span> {n === 1 ? "leaves" : "leave"} My library. Files nothing else uses are deleted too; copies already placed stay where they are.
            </p>
          )}
          {used.length > 0 && (
            <p>
              <span className="font-medium text-ui-2">Kept, a screen uses {used.length === 1 ? "its file" : "their files"}:</span> {names(used)}. Take {used.length === 1 ? "it" : "them"} off the screen first.
            </p>
          )}
          {builtin.length > 0 && (
            <p>
              <span className="font-medium text-ui-2">Kept, built in:</span> {names(builtin)}. Built-ins ship with the app and can’t be deleted.
            </p>
          )}
          {n > 0 && <p>Each file is checked again just before it goes.</p>}
        </AlertDialogParts.Description>
        <div className="flex items-center justify-end gap-2 pt-1">
          <AlertDialogParts.Close render={<button type="button" className={BUTTON} />}>{n > 0 ? "Cancel" : "Close"}</AlertDialogParts.Close>
          {n > 0 && (
            <button
              type="button"
              className="inline-flex h-8 items-center rounded-ui-md bg-ui-danger px-3 text-body font-medium text-ui-inverse-fg transition-opacity hover:opacity-90"
              onClick={() => {
                onDelete(remove);
                onClose();
              }}
            >
              Delete {n}
            </button>
          )}
        </div>
      </AlertDialogParts.Content>
    </AlertDialogParts.Root>
  );
}

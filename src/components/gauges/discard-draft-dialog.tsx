/** "Discard draft": the draft the autosave made is deleted from the library and the editor closes (P-3). */
import { useRef } from "react";
import { DialogParts } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface DiscardDraftDialogProps {
  open: boolean;
  name: string;
  busy: boolean;
  onDiscard: () => void;
  onCancel: () => void;
}

export function DiscardDraftDialog({ open, name, busy, onDiscard, onCancel }: DiscardDraftDialogProps) {
  // Keep is the safe way out, so it has focus.
  const keep = useRef<HTMLButtonElement>(null);
  return (
    <DialogParts.Root open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogParts.Content initialFocus={keep} className="rounded-ui-lg">
        <DialogParts.Title className="text-body font-medium text-ui-1">Discard this draft?</DialogParts.Title>
        <DialogParts.Description>“{name}” is deleted from your library. Gauges already placed on a screen keep their own copy.</DialogParts.Description>
        <div className="flex justify-end gap-2 pt-1">
          <button ref={keep} type="button" onClick={onCancel} className="h-8 rounded-ui-md border border-ui-strong bg-ui-raised px-3 text-body font-medium text-ui-1 hover:border-ui-hover-edge focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent">
            Keep draft
          </button>
          <Button variant="danger" onClick={onDiscard} disabled={busy}>
            Discard draft
          </Button>
        </div>
      </DialogParts.Content>
    </DialogParts.Root>
  );
}

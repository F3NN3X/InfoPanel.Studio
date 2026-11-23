// The studio's question before an unverified pack's script runs (owner decision 2026-11-23: ask once per pack). It says who and what,
// that Themely has not reviewed it, and what a script can and cannot do (pack-scripts-and-signing.md §2c, "Data rules"). The answer
// is the server's to keep (`PUT /api/packs/<id>/script-consent`); the pack's declarative parts apply whichever it is. The kiosk never asks.
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { DialogParts } from "@/components/ui/dialog";

export interface ScriptConsentProps {
  open: boolean;
  /** The pack's name as its pack.json gives it. */
  name: string;
  /** The publisher the server names, when it knows one. */
  publisher?: string;
  onAnswer: (granted: boolean) => void;
  /** Escape or a backdrop click: no answer is stored, and the studio does not ask again until it is opened again. */
  onDismiss: () => void;
}

/** What a script can do, and what it cannot, in the user's words. */
export const SCRIPT_CAN = ["Draw shapes over your cards in the theme's colours.", "See where each card is, a reading rounded to whole percent, whether it is in warning, and how many letters a text has."];
export const SCRIPT_CANNOT = [
  "Read any text or exact value, or a card that blurs its values, agent or chat cards.",
  "Reach the network, your files, settings or other apps.",
  "Run while the screen is hidden, with Effects off, in lite mode or with reduced motion.",
  "Keep running if it is slow or uses too much memory: the app stops it.",
];

export function ScriptConsent({ open, name, publisher, onAnswer, onDismiss }: ScriptConsentProps) {
  // Don't allow is the safe answer, so it has focus.
  const no = useRef<HTMLButtonElement>(null);
  return (
    <DialogParts.Root open={open} onOpenChange={(o) => !o && onDismiss()}>
      <DialogParts.Content initialFocus={no} className="rounded-ui-lg" data-testid="script-consent">
        <DialogParts.Title className="text-body font-medium text-ui-1">Let “{name}” run its effect script?</DialogParts.Title>
        <DialogParts.Description>
          {publisher ? `From ${publisher}. ` : ""}This pack is unverified: it has not been reviewed by Themely. Its colours, frames and effects apply either way; only its script waits for your answer.
        </DialogParts.Description>
        <div className="space-y-1 text-caption text-ui-2">
          <p className="font-medium text-ui-1">A pack script can</p>
          <ul className="list-disc space-y-0.5 pl-4">{SCRIPT_CAN.map((t) => <li key={t}>{t}</li>)}</ul>
          <p className="pt-1 font-medium text-ui-1">It cannot</p>
          <ul className="list-disc space-y-0.5 pl-4">{SCRIPT_CANNOT.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button ref={no} variant="secondary" onClick={() => onAnswer(false)}>
            Don't allow
          </Button>
          <Button variant="primary" onClick={() => onAnswer(true)}>
            Allow for this pack
          </Button>
        </div>
      </DialogParts.Content>
    </DialogParts.Root>
  );
}

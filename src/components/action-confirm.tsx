import { useEffect, useRef, type CSSProperties } from "react";
import { Terminal, Radio } from "lucide-react";
import type { TouchAction } from "@/lib/pinned";
import { HoldButton } from "./hold-button";

/*
 * The kiosk's hold-to-confirm card and its run notes (pinned layer P7, decision 4, owner Q3), loaded with the first action that
 * needs one. A command marked "hold to confirm", or OBS's go live, opens the card from a tap or a double tap: the whole command
 * shows (it scrolls, never cut), Cancel goes back, and the action runs only after a 0.6 s hold. A hold on the key itself is that
 * hold, so it never opens the card. A note says what a run came to when it did not start (test mode, off, not approved). It is
 * centred on the page area, beside any pinned items, and wears the Look through the theme's card colours, as alerts do.
 */

export interface ActionLayerProps {
  /** The action waiting for its hold, and what runs it. */
  confirm: { action: TouchAction; go: () => void } | null;
  /** The last run's note, or null. */
  note: string | null;
  /** The page area: the room the pinned items take on each edge, px. */
  room: { left: number; right: number; top: number; bottom: number };
  onCancel: () => void;
  onNoteDone: () => void;
}

/** How long a note stays, ms. */
export const NOTE_MS = 5000;

/** What the card asks, and the text it shows in full. */
export function confirmCopy(action: TouchAction): { title: string; text: string; hold: string } {
  if (action.op === "run") return { title: "Run this command?", text: action.command, hold: "Hold to run" };
  if (action.op === "obs" && action.body.op === "stream") {
    const s = action.body.state;
    const title = s === "start" ? "Go live in OBS?" : s === "stop" ? "Stop the stream in OBS?" : "Go live or stop the stream in OBS?";
    return { title, text: s === "start" ? "Starts streaming." : s === "stop" ? "Stops streaming." : "Starts streaming, or stops it if OBS is live.", hold: s === "stop" ? "Hold to stop" : "Hold to go live" };
  }
  return { title: "Run this action?", text: "", hold: "Hold to run" };
}

export default function ActionLayer({ confirm, note, room, onCancel, onNoteDone }: ActionLayerProps) {
  const area: CSSProperties = { left: room.left, right: room.right, top: room.top, bottom: room.bottom };
  const done = useRef(onNoteDone);
  done.current = onNoteDone;
  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => done.current(), NOTE_MS);
    return () => window.clearTimeout(t);
  }, [note]);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!confirm) return;
    const was = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => was?.focus?.();
  }, [confirm]);
  const copy = confirm ? confirmCopy(confirm.action) : null;
  const Icon = confirm?.action.op === "run" ? Terminal : Radio;
  return (
    <>
      {confirm && copy && (
        <div className="fixed z-(--z-dialog) flex items-center justify-center p-4" style={area} onKeyDown={(e) => e.key === "Escape" && onCancel()}>
          <button type="button" tabIndex={-1} aria-label="Close" className="absolute inset-0 cursor-default bg-background/70" onClick={onCancel} />
          <section role="dialog" aria-modal="true" aria-labelledby="action-confirm-title" aria-describedby={copy.text ? "action-confirm-text" : undefined} data-action-confirm="" className="relative w-full max-w-[520px] rounded-2xl border bg-card p-4 text-card-foreground shadow-xl">
            <header className="flex items-center gap-2">
              <Icon aria-hidden size={18} className="text-muted-foreground" />
              <h2 id="action-confirm-title" className="text-[16px] font-semibold">
                {copy.title}
              </h2>
            </header>
            {copy.text &&
              (confirm.action.op === "run" ? (
                // the whole command, read-only, scrolling (by touch and keyboard) rather than cut short
                <textarea
                  id="action-confirm-text"
                  readOnly
                  aria-label="The command"
                  value={copy.text}
                  rows={Math.min(4, Math.max(1, Math.ceil(copy.text.length / 56)))}
                  className="mt-3 block w-full resize-none overflow-auto break-all rounded-lg bg-muted px-3 py-2 font-mono text-[13px] leading-snug"
                />
              ) : (
                <p id="action-confirm-text" className="mt-2 text-[14px] text-muted-foreground">
                  {copy.text}
                </p>
              ))}
            <div className="mt-3 grid gap-3" style={{ gridTemplateColumns: "1fr 1.4fr" }}>
              <button ref={cancelRef} type="button" onClick={onCancel} className="h-14 rounded-xl border text-[15px] font-semibold">
                Cancel
              </button>
              <HoldButton
                label={copy.hold}
                className="h-14 text-[15px]"
                onConfirm={() => {
                  onCancel();
                  confirm.go();
                }}
              />
            </div>
          </section>
        </div>
      )}
      {note && (
        <div className="pointer-events-none fixed z-(--z-dialog) flex items-end justify-center p-4" style={area}>
          <p role="status" data-action-note="" className="max-w-[640px] rounded-xl border bg-card px-4 py-2 text-[14px] text-card-foreground shadow-lg">
            {note}
          </p>
        </div>
      )}
    </>
  );
}

import { useState } from "react";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";
import { frameName, noteEntries, notesMarkdown, type NoteEntry } from "../claude";
import { ClaudeButton } from "../ClaudeButton";
import { copyText } from "../clipboard";
import type { Now } from "../console";
import { CAN_WRITE, editJson, useNotes, writeNote, type NoteStatus } from "../notes";
import { NOTES_PATH } from "../notes-file";
import { frameId } from "../params";
import { select } from "../selection";
import { ACTION, Quiet } from "./parts";

type Which = NoteStatus | "all";

/** A note's frame on the page: it is selected and scrolled to; not drawn now (a filter, other sizes), its link opens it. */
function go(n: NoteEntry) {
  const id = n.key === "*" ? n.module : frameId(n.module, n.key);
  const el = document.getElementById(id);
  if (!el) {
    window.location.assign(n.link);
    return;
  }
  select(id);
  el.scrollIntoView({ block: "center" });
}

/**
 * The notes queue (the widget list's Notes queue entry): every note in `notes.json`, the open ones by default (Fixed, All), each a
 * button to its frame. Copy for Claude copies the shown ones with each note's report command (`notesMarkdown`, as `qa:report
 * --notes --md` prints them); Clear fixed removes the fixed ones (on a build: copies the file without them).
 */
export function NotesQueue({ now }: { now: { current: Now } }) {
  const notes = useNotes();
  const [which, setWhich] = useState<Which>("open");
  const [message, setMessage] = useState("");
  const ctx = { state: now.current.state, base: `${window.location.origin}${window.location.pathname}`, notes };
  const all = noteEntries(ctx, "all");
  const open = all.filter((n) => n.status === "open").length;
  const fixed = all.length - open;
  const shown = which === "all" ? all : all.filter((n) => n.status === which);
  const clearFixed = async () => {
    if (!CAN_WRITE) return setMessage((await copyText(editJson({ clear: "fixed" }))) ? `Copied ${NOTES_PATH} without the fixed notes: paste it over the file.` : "Copy failed.");
    try {
      await writeNote({ clear: "fixed" });
      setMessage(`Cleared ${fixed} fixed ${fixed === 1 ? "note" : "notes"}.`);
    } catch (e) {
      setMessage(`Not cleared: ${(e as Error).message}`);
    }
  };
  return (
    <div className="space-y-3">
      <div>
        <p className="text-micro font-semibold uppercase tracking-wider text-ui-3">Notes queue</p>
        <h2 className="text-body font-semibold text-ui-1">{`${open} open · ${fixed} fixed`}</h2>
      </div>
      <Segmented
        label="Show notes"
        value={which}
        onChange={setWhich}
        options={[
          { value: "open", label: `Open ${open}`, title: "The notes still to do" },
          { value: "fixed", label: `Fixed ${fixed}`, title: "The notes fixed and waiting to be removed" },
          { value: "all", label: `All ${all.length}`, title: "Every note" },
        ]}
      />
      <div className="flex flex-wrap gap-1.5">
        <ClaudeButton text={async () => notesMarkdown(shown, ctx, which)} title="Copy these notes as text for Claude, each with its link and the report command that reads its frame" className={ACTION} />
        {fixed > 0 && (
          <button type="button" className={ACTION} title={CAN_WRITE ? `Remove every fixed note from ${NOTES_PATH}` : `Copy ${NOTES_PATH} without the fixed notes`} onClick={() => void clearFixed()}>
            {CAN_WRITE ? "Clear fixed" : "Copy without the fixed"}
          </button>
        )}
      </div>
      {message && (
        <p role="status" className="text-micro text-ui-3">
          {message}
        </p>
      )}
      {shown.length ? (
        <ul aria-label="Notes" className="space-y-1">
          {shown.map((n) => (
            <li key={`${n.module} ${n.key}`}>
              <button type="button" title={`Select ${n.key === "*" ? n.module : frameName(n.module, n.key)} on the page`} onClick={() => go(n)} className="w-full rounded-ui-sm px-1.5 py-1 text-left hover:bg-ui-hover focus-visible:outline-2 focus-visible:outline-ui-accent">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-ui-mono text-micro text-ui-2">{n.key === "*" ? `${n.module} (widget)` : frameName(n.module, n.key)}</span>
                  <span className={cn("text-micro", n.status === "fixed" ? "text-ui-3" : "text-ui-warn-text")}>{n.status}</span>
                </span>
                <span className={cn("block text-caption", n.status === "fixed" ? "text-ui-3" : "text-ui-1")}>{n.text}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <Quiet>{which === "open" ? "Nothing open: every note is fixed, or there are none. Add one from a frame's Note." : which === "fixed" ? "No fixed notes." : "No notes yet. Add one from a frame's Note."}</Quiet>
      )}
      <Quiet>{CAN_WRITE ? `The dev server writes ${NOTES_PATH}.` : `This page is a build: there is no repo to write to, so the actions copy JSON for ${NOTES_PATH}.`}</Quiet>
    </div>
  );
}

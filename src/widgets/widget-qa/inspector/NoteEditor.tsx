import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { FIELD_BOX } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";
import { copyText } from "../clipboard";
import { CAN_WRITE, editJson, noteStatus, noteText, useWidgetNotes, writeNote, type NoteEdit, type NoteStatus } from "../notes";
import { NOTES_PATH } from "../notes-file";
import { ACTION, Quiet } from "./parts";

const STATUS_OPTIONS: { value: NoteStatus; label: string; title: string }[] = [
  { value: "open", label: "Open", title: "Still to do: it is in the notes queue" },
  { value: "fixed", label: "Fixed", title: "Done: it waits for the owner to remove it (or Clear fixed in the notes queue)" },
];

/** Each action's label: what it does under `npm run dev` (writes notes.json), and on a build (copies the JSON to paste into it). */
const LABEL = CAN_WRITE ? { save: "Save", fixed: "Mark fixed", open: "Reopen", remove: "Delete" } : { save: "Copy JSON", fixed: "Copy as fixed", open: "Copy as open", remove: "Copy without it" };

/**
 * One note, read and edited in the inspector: a frame's (`2x1`, `view:gauge`) or the widget's (`*`). Under `npm run dev` an action
 * writes `notes.json` through the dev server (`notes-dev.ts`) and every view of the note follows; on a build, which has no repo to
 * write to, it copies the widget's notes as JSON to paste into the file instead.
 */
export function NoteEditor({ module, frameKey, name }: { module: string; frameKey: string; name: string }) {
  const note = useWidgetNotes(module)?.[frameKey];
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<NoteStatus>("open");
  const [message, setMessage] = useState("");
  // another frame selected: its own note, not this draft
  useEffect(() => {
    setEditing(false);
    setMessage("");
  }, [module, frameKey]);

  const start = () => {
    setDraft(note ? noteText(note) : "");
    setStatus(note ? noteStatus(note) : "open");
    setMessage("");
    setEditing(true);
  };
  const commit = async (edit: NoteEdit, done: string) => {
    if (!CAN_WRITE) {
      setMessage((await copyText(editJson(edit))) ? `Copied ${module}'s notes as JSON: paste them over its entry in ${NOTES_PATH}.` : "Copy failed.");
      setEditing(false);
      return;
    }
    setMessage("Saving…");
    try {
      await writeNote(edit);
      setMessage(done);
      setEditing(false);
    } catch (e) {
      setMessage(`Not saved: ${(e as Error).message}`);
    }
  };
  const save = () => draft.trim() && void commit({ module, key: frameKey, note: { text: draft, status } }, "Saved.");
  const fixed = !!note && noteStatus(note) === "fixed";

  return (
    <div className="space-y-1.5">
      {editing ? (
        <>
          <textarea
            aria-label={`Note for ${name}`}
            autoFocus
            spellCheck
            rows={3}
            value={draft}
            placeholder="What is wrong, or what it should do"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) save();
              else if (e.key === "Escape") setEditing(false);
            }}
            className={cn(FIELD_BOX, "h-auto w-full resize-y px-2 py-1 text-caption")}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented label="Status" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
            <span className="flex items-center gap-1.5">
              <Button small variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
              <Button small disabled={!draft.trim()} title="Ctrl+Enter" onClick={save}>
                {LABEL.save}
              </Button>
            </span>
          </div>
          <Quiet>{CAN_WRITE ? `Saves to ${NOTES_PATH} (npm run dev).` : `A build has no repo to write to: ${LABEL.save} copies the widget's notes for ${NOTES_PATH}.`}</Quiet>
        </>
      ) : note ? (
        <>
          <p className={cn("text-caption", fixed ? "text-ui-3" : "text-ui-warn-text")}>{noteText(note)}</p>
          <p className="text-micro text-ui-3">{fixed ? "Fixed: waiting for the owner to remove it." : "Open: in the notes queue."}</p>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" className={ACTION} onClick={start}>
              Edit
            </button>
            <button type="button" className={ACTION} onClick={() => void commit({ module, key: frameKey, note: { text: noteText(note), status: fixed ? "open" : "fixed" } }, fixed ? "Reopened." : "Marked fixed.")}>
              {fixed ? LABEL.open : LABEL.fixed}
            </button>
            <button type="button" className={ACTION} onClick={() => void commit({ module, key: frameKey, note: null }, "Deleted.")}>
              {LABEL.remove}
            </button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Quiet>{`No note for ${name}.`}</Quiet>
          <button type="button" className={ACTION} onClick={start}>
            Add a note
          </button>
        </div>
      )}
      {message && (
        <p role="status" className="text-micro text-ui-3">
          {message}
        </p>
      )}
    </div>
  );
}

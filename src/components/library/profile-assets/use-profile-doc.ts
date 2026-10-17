/**
 * One canvas zone's files as a `Doc`, loaded from the asset store, and `commit`: an edit of that doc
 * written back as the zone's stored form in a single `setConfig`, so each action is one undo step.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HistorySetter } from "@/hooks/use-config-history";
import { openCanvas } from "@/lib/infopanel/canvas";
import type { Doc } from "@/lib/infopanel/assets/assets";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import { loadDoc, writeDoc } from "./profile-doc-io";

export interface Edit {
  doc: Doc;
  /** The note shown after the edit. */
  message?: string;
}

export interface ProfileDoc {
  doc: Doc | null;
  /** What is running ("Adding"), or null. */
  busy: string | null;
  note: string | null;
  /** Runs an edit of the doc; an edit returning the same doc changes nothing. */
  commit: (what: string, build: (doc: Doc) => Edit | Promise<Edit>) => Promise<void>;
}

export function useProfileDoc(zoneId: string, stored: StoredCanvas, setConfig: HistorySetter): ProfileDoc {
  const open = useMemo(() => openCanvas(stored), [stored]);
  const [doc, setDoc] = useState<Doc | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const bytes = useRef(new Map<string, Uint8Array>());

  useEffect(() => {
    let live = true;
    loadDoc(open, bytes.current).then((d) => live && setDoc(d));
    return () => {
      live = false;
    };
  }, [open]);

  const commit = useCallback<ProfileDoc["commit"]>(
    async (what, build) => {
      if (!doc) return;
      setBusy(what);
      setNote(`${what}…`);
      try {
        const edit = await build(doc);
        if (edit.doc !== doc) await writeDoc(open, edit.doc, bytes.current, setConfig, zoneId);
        setNote(edit.message ?? null);
      } catch (e) {
        setNote(`${what} failed: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setBusy(null);
      }
    },
    [doc, open, setConfig, zoneId],
  );

  return { doc, busy, note, commit };
}

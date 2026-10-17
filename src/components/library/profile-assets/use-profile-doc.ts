/**
 * One canvas zone's files as a `Doc`, loaded from the asset store, and `commit`: an edit of that doc
 * written back as the zone's stored form in a single `setConfig`, so each action is one undo step.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { withCanvas } from "@/components/studio/import-actions";
import type { HistorySetter } from "@/hooks/use-config-history";
import { uploadBytes } from "@/lib/assets";
import { openCanvas, readStoreFile } from "@/lib/infopanel/canvas";
import { MIME, type Doc } from "@/lib/infopanel/assets/assets";
import { docFromStored, storedFromDoc } from "@/lib/infopanel/assets/stored-doc";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";

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
  /** File bytes by hash: an edit reloads the doc, and only new files need fetching. */
  const bytes = useRef(new Map<string, Uint8Array>());

  useEffect(() => {
    let live = true;
    docFromStored(open, async (a) => {
      const hit = bytes.current.get(a.hash);
      if (hit) return hit;
      const got = await readStoreFile(a.hash, a.ext, a.type).catch(() => null);
      if (got) bytes.current.set(a.hash, got);
      return got;
    }).then((d) => live && setDoc(d));
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
        if (edit.doc !== doc) {
          const next = await storedFromDoc(open.stored, open.profile, edit.doc, async (f) => {
            const id = (await uploadBytes(f.bytes, MIME[f.type])).id;
            bytes.current.set(f.hash, f.bytes);
            return id;
          });
          setConfig((c) => withCanvas(c, zoneId, next));
        }
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

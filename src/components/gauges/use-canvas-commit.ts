/**
 * The Library's Gauges way to change a canvas zone's files (frame tools, Bake frames): the zone's files are
 * loaded when an action runs, not while the editor is open (a vector gauge's every slider move changes the
 * zone), then the edit is written back in one `setConfig`: one undo step.
 */
import { useCallback, useRef, useState } from "react";
import type { HistorySetter } from "@/hooks/use-config-history";
import { openCanvas } from "@/lib/infopanel/canvas";
import type { Doc } from "@/lib/infopanel/assets/assets";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import { loadDoc, writeDoc } from "@/components/library/profile-assets/profile-doc-io";

export interface CanvasCommit {
  /** What is running ("Recolouring"), or null. */
  busy: string | null;
  /** The last action's outcome, or why it failed. */
  note: string | null;
  /** Runs `build` on the zone's files; the doc it returns is written back (the same doc changes nothing). Resolves whether it worked. */
  commit: (what: string, build: (doc: Doc) => Doc | Promise<Doc>, message?: string) => Promise<boolean>;
}

export function useCanvasCommit(zoneId: string, stored: StoredCanvas, setConfig: HistorySetter): CanvasCommit {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const bytes = useRef(new Map<string, Uint8Array>());
  const latest = useRef(stored);
  latest.current = stored;
  const running = useRef(false);

  const commit = useCallback<CanvasCommit["commit"]>(
    async (what, build, message) => {
      if (running.current) return false;
      running.current = true;
      setBusy(what);
      setNote(`${what}…`);
      try {
        const open = openCanvas(latest.current);
        const doc = await loadDoc(open, bytes.current);
        const edited = await build(doc);
        if (edited !== doc) await writeDoc(open, edited, bytes.current, setConfig, zoneId);
        setNote(message ?? null);
        return true;
      } catch (e) {
        setNote(`${what} failed: ${e instanceof Error ? e.message : String(e)}`);
        return false;
      } finally {
        running.current = false;
        setBusy(null);
      }
    },
    [setConfig, zoneId],
  );

  return { busy, note, commit };
}

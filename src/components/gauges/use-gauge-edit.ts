/**
 * The editor's state for one opened gauge (spec §6). A profile gauge writes through: each change is one
 * config change (one studio undo step; a slider drag coalesces by `key`). Anything else is a working copy
 * with its own undo stack, saved to the library on request, and kept while the page is closed.
 */
import { useEffect, useMemo, useState } from "react";
import type { StudioBridge } from "@/components/library/library-actions";
import { profileGauges, sourceKey, withGauge, type GaugeEntry } from "@/lib/gauge-studio/model";
import type { EditorOpen } from "@/lib/gauge-studio/open";
import { keepCopy, sessionCopy } from "@/lib/gauge-studio/session";
import { canRedo, canUndo, editCopy, isDirty, markSaved, openCopy, redoCopy, renameCopy, undoCopy, type WorkingCopy } from "@/lib/gauge-studio/working-copy";
import type { VectorGauge } from "@/lib/infopanel/gauges/vector";

type Editable = Extract<EditorOpen, { kind: "profile" | "copy" }>;

export interface GaugeEdit {
  name: string;
  /** Null when a profile gauge is gone from the page (deleted behind the editor). */
  gauge: VectorGauge | null;
  /** The profile gauge being edited in place. */
  entry: GaugeEntry | null;
  writeThrough: boolean;
  origin: WorkingCopy["origin"];
  dirty: boolean;
  /** Working copy only: the studio's own undo covers a profile gauge. */
  history: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean } | null;
  /** A new spec; the same `key` within half a second is one undo step. */
  commit: (next: VectorGauge, key?: string) => void;
  rename: (name: string) => void;
  saved: (origin: NonNullable<WorkingCopy["origin"]>) => void;
}

export function useGaugeEdit(bridge: StudioBridge, open: Editable, editorId: number): GaugeEdit {
  const [wc, setWc] = useState<WorkingCopy | null>(() =>
    open.kind === "copy" ? (sessionCopy<WorkingCopy>(editorId) ?? openCopy(open.name, open.gauge, open.origin)) : null,
  );
  useEffect(() => {
    if (wc) keepCopy(editorId, wc);
  }, [editorId, wc]);
  const source = open.kind === "profile" ? open.source : null;
  const entry = useMemo(
    () => (source ? (profileGauges(bridge.profile).find((e) => e.key === sourceKey(source)) ?? null) : null),
    [bridge.profile, source],
  );

  if (source) {
    return {
      name: entry?.name ?? "Gauge",
      gauge: entry?.gauge ?? null,
      entry,
      writeThrough: true,
      origin: null,
      dirty: false,
      history: null,
      commit: (next, key) => bridge.setConfig((c) => withGauge(c, source, next) ?? c, key ? `gauge:${sourceKey(source)}:${key}` : undefined),
      rename: () => {},
      saved: () => {},
    };
  }
  const copy = wc!;
  return {
    name: copy.name,
    gauge: copy.gauge,
    entry: null,
    writeThrough: false,
    origin: copy.origin,
    dirty: isDirty(copy),
    history: {
      undo: () => setWc((w) => w && undoCopy(w)),
      redo: () => setWc((w) => w && redoCopy(w)),
      canUndo: canUndo(copy),
      canRedo: canRedo(copy),
    },
    commit: (next, key) => setWc((w) => w && editCopy(w, next, key)),
    rename: (name) => setWc((w) => w && renameCopy(w, name)),
    saved: (origin) => setWc((w) => w && markSaved(w, origin)),
  };
}

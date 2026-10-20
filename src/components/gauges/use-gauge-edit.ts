/**
 * The editor's state for one opened gauge (spec §6). A profile gauge writes through: each change is one
 * config change (one studio undo step; a slider drag coalesces by `key`). Anything else is a working copy
 * with its own undo stack, saved to the library on request, and kept while the page is closed.
 */
import { useEffect, useMemo, useState } from "react";
import { listLibrary } from "@/lib/library";
import { linkOf, linkedItem, type GaugeLink } from "@/lib/gauge-studio/gauge-link";
import type { StudioBridge } from "@/components/library/library-actions";
import { profileGauges, sourceKey, withGauge, withGaugeName, type GaugeEntry } from "@/lib/gauge-studio/model";
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
  /** A profile gauge: the library item Save updates (null: the first Save creates one). */
  saveTo: string | null;
  /** Where a profile gauge is linked from; null for anything else. */
  link: GaugeLink | null;
  dirty: boolean;
  /** Working copy only: the studio's own undo covers a profile gauge. */
  history: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean } | null;
  /** A new spec; the same `key` within half a second is one undo step. */
  commit: (next: VectorGauge, key?: string) => void;
  rename: (name: string) => void;
  saved: (origin: NonNullable<WorkingCopy["origin"]>) => void;
}

/** The name of the library item a profile gauge is linked to; reloaded after each Save. */
function useLinkedName(link: GaugeLink | null, version: number): string | null {
  const [name, setName] = useState<string | null>(null);
  const key = link ? JSON.stringify(link) : null;
  useEffect(() => {
    if (!link) return;
    let live = true;
    listLibrary().then(
      (items) => live && setName(linkedItem(items, link)?.name ?? null),
      () => {},
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is `link` by value
  }, [key, version]);
  return name;
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

  const link = source ? linkOf(bridge, source) : null;
  const [saves, setSaves] = useState(0);
  const saveTo = useLinkedName(link, saves);

  if (source) {
    return {
      name: entry?.name ?? "Gauge",
      gauge: entry?.gauge ?? null,
      entry,
      writeThrough: true,
      origin: null,
      saveTo,
      link,
      dirty: false,
      history: null,
      commit: (next, key) => bridge.setConfig((c) => withGauge(c, source, next) ?? c, key ? `gauge:${sourceKey(source)}:${key}` : undefined),
      rename: (name) => bridge.setConfig((c) => withGaugeName(c, source, name) ?? c, `gauge:${sourceKey(source)}:name`),
      saved: () => setSaves((n) => n + 1),
    };
  }
  const copy = wc!;
  return {
    name: copy.name,
    gauge: copy.gauge,
    entry: null,
    writeThrough: false,
    origin: copy.origin,
    saveTo: null,
    link: null,
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

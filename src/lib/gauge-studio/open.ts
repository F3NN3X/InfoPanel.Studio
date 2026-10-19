/** What opening a gauge in the editor means for each source (spec §6), and the keys the editor takes. */
import { normalizeGauge, DEFAULT_GAUGE, type VectorGauge } from "@/lib/infopanel/gauges/vector";
import type { GaugeEntry, GaugeSource, LibraryFrame } from "./model";
import type { WorkingCopy } from "./working-copy";

export type ProfileSource = Extract<GaugeSource, { kind: "canvas" | "widget" }>;

export type EditorOpen =
  /** A gauge in the profile: edits write through to the config. */
  | { kind: "profile"; source: ProfileSource }
  /** A working copy with its own undo (a preset's copy, a library item, an import, a new gauge). */
  | { kind: "copy"; name: string; gauge: VectorGauge; origin: WorkingCopy["origin"] }
  /** A library image sequence: a working copy of its frames (a canvas one is a "profile" gauge). */
  | { kind: "frames"; name: string; frames: LibraryFrame[]; animationSpeed: number; origin: Extract<GaugeSource, { kind: "library" }> };

/** The editor's way into an entry: a preset becomes "<name> copy", a library item keeps its identity. */
export function editorOpenOf(entry: GaugeEntry): EditorOpen {
  const { source, gauge } = entry;
  if (source.kind === "preset" && gauge) return { kind: "copy", name: `${entry.name} copy`, gauge, origin: null };
  if (source.kind === "library") {
    return gauge
      ? { kind: "copy", name: entry.name, gauge, origin: source }
      : { kind: "frames", name: entry.name, frames: entry.files ?? [], animationSpeed: entry.animationSpeed, origin: source };
  }
  // A canvas image sequence is a profile gauge too: the editor shows frames or parts by what the item has.
  return { kind: "profile", source: source as ProfileSource };
}

/** A new gauge starts from the default preset (the ring). */
export const newGaugeOpen = (): EditorOpen => ({ kind: "copy", name: "New gauge", gauge: normalizeGauge(DEFAULT_GAUGE), origin: null });

export interface HistoryKeyInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** Ctrl+Z undo, Ctrl+Shift+Z and Ctrl+Y redo; none while focus is in a text field (`typing`). */
export function historyKey(e: HistoryKeyInput, typing: boolean): "undo" | "redo" | null {
  if (typing || e.altKey || !(e.ctrlKey || e.metaKey)) return null;
  const key = e.key.toLowerCase();
  if (key === "z") return e.shiftKey ? "redo" : "undo";
  if (key === "y" && !e.shiftKey) return "redo";
  return null;
}

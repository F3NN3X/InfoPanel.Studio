/**
 * A gauge being edited outside the config: a preset's copy, a library item, an imported or new gauge.
 * It has its own undo stack (the same pure history the studio's config uses), and knows whether it
 * differs from what was last saved, for "Unsaved changes" on back. A profile gauge has none of this:
 * its edits go straight into the config.
 */
import { emptyHistory, recordChange, redoChange, undoChange, type History } from "@/hooks/config-history";
import type { GaugeSource } from "./model";
import type { VectorGauge } from "@/lib/infopanel/gauges/vector";

export interface WorkingCopy {
  name: string;
  gauge: VectorGauge;
  /** The library item it saves back to; null: Save creates a new one. */
  origin: Extract<GaugeSource, { kind: "library" }> | null;
  history: History<VectorGauge>;
  /** What was loaded or last saved; null for a copy never saved (a preset's, an import, a new gauge). */
  saved: { name: string; gauge: VectorGauge } | null;
}

/** A library item opened (`origin`, clean), or a copy that exists nowhere yet (dirty from the start: leaving it asks). */
export function openCopy(name: string, gauge: VectorGauge, origin: WorkingCopy["origin"] = null): WorkingCopy {
  return { name, gauge, origin, history: emptyHistory(), saved: origin ? { name, gauge } : null };
}

/** A new spec; the same `key` within 500 ms joins the previous step (a slider drag is one undo). */
export function editCopy(wc: WorkingCopy, gauge: VectorGauge, key?: string, at = Date.now()): WorkingCopy {
  if (gauge === wc.gauge) return wc;
  return { ...wc, gauge, history: recordChange(wc.history, wc.gauge, key, at) };
}

export const renameCopy = (wc: WorkingCopy, name: string): WorkingCopy => (name === wc.name ? wc : { ...wc, name });

export function undoCopy(wc: WorkingCopy): WorkingCopy {
  const step = undoChange(wc.history, wc.gauge);
  return step ? { ...wc, gauge: step.value, history: step.history } : wc;
}

export function redoCopy(wc: WorkingCopy): WorkingCopy {
  const step = redoChange(wc.history, wc.gauge);
  return step ? { ...wc, gauge: step.value, history: step.history } : wc;
}

export const canUndo = (wc: WorkingCopy): boolean => wc.history.past.length > 0;
export const canRedo = (wc: WorkingCopy): boolean => wc.history.future.length > 0;

/** Saved under `origin` (a created item's id): the loaded state is now this one. */
export const markSaved = (wc: WorkingCopy, origin: WorkingCopy["origin"]): WorkingCopy => ({ ...wc, origin, saved: { name: wc.name, gauge: wc.gauge } });

/** Changed since it was loaded or saved (by value: an edit undone back to the start is no change). */
export const isDirty = (wc: WorkingCopy): boolean =>
  !wc.saved || wc.name !== wc.saved.name || (wc.gauge !== wc.saved.gauge && JSON.stringify(wc.gauge) !== JSON.stringify(wc.saved.gauge));

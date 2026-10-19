/**
 * The frame filmstrip's selection and the edits it runs (spec §6, Image-sequence gauges): a range of
 * frames picked by click and shift-click, and the reorder each tool is. An edit is the new order (the
 * old frame indexes in their new places, as `reorderFrames` takes it) and the selection to show after.
 */
import { duplicateOrder, resampleOrder, reverseOrder } from "@/lib/infopanel/gauges/frames";

/** A range: where the click started and where it was last extended to (either may be the lower). */
export interface FrameSel {
  anchor: number;
  focus: number;
}

export interface FrameEdit {
  order: number[];
  sel: FrameSel;
}

export const selectOne = (i: number): FrameSel => ({ anchor: i, focus: i });

/** A click moves the selection to the frame; a shift-click keeps the anchor and extends to it. */
export const selectFrame = (sel: FrameSel, i: number, extend: boolean): FrameSel => (extend ? { anchor: sel.anchor, focus: i } : selectOne(i));

/** The selection kept inside `count` frames. */
export const clampSel = (sel: FrameSel, count: number): FrameSel => {
  const top = Math.max(0, count - 1);
  return { anchor: Math.min(Math.max(sel.anchor, 0), top), focus: Math.min(Math.max(sel.focus, 0), top) };
};

/** The selected frame indexes, ascending. */
export function selectedIndexes(sel: FrameSel, count: number): number[] {
  if (count <= 0) return [];
  const { anchor, focus } = clampSel(sel, count);
  const lo = Math.min(anchor, focus);
  return Array.from({ length: Math.max(anchor, focus) - lo + 1 }, (_, k) => lo + k);
}

export const isSelected = (sel: FrameSel, i: number): boolean => i >= Math.min(sel.anchor, sel.focus) && i <= Math.max(sel.anchor, sel.focus);

const identity = (n: number) => Array.from({ length: n }, (_, i) => i);

/** The selected range when it is more than one frame, else every frame: what Reverse and Resample work on. */
function scopeOf(n: number, sel: FrameSel): { start: number; len: number } {
  const idx = selectedIndexes(sel, n);
  return idx.length > 1 ? { start: idx[0], len: idx.length } : { start: 0, len: n };
}

/** `inner` (an order over `len` frames) applied to the `len` frames from `start`, the rest left as they are. */
const within = (n: number, start: number, len: number, inner: readonly number[]): number[] => [
  ...identity(start),
  ...inner.map((k) => start + k),
  ...identity(n).slice(start + len),
];

/** Reverses the selected range, or every frame when one or none is selected. */
export function reverseEdit(n: number, sel: FrameSel): FrameEdit {
  const { start, len } = scopeOf(n, sel);
  return { order: within(n, start, len, reverseOrder(len)), sel };
}

/** The selected range (or every frame) picked evenly down (or up) to `count` frames, its first and last kept. */
export function resampleEdit(n: number, sel: FrameSel, count: number): FrameEdit {
  const { start, len } = scopeOf(n, sel);
  const inner = resampleOrder(len, count);
  return { order: within(n, start, len, inner), sel: len < n && inner.length > 0 ? { anchor: start, focus: start + inner.length - 1 } : selectOne(0) };
}

/** Each selected frame repeated once after itself; the selection grows to cover the copies. */
export function duplicateEdit(n: number, sel: FrameSel): FrameEdit {
  const idx = selectedIndexes(sel, n);
  if (idx.length === 0) return { order: identity(n), sel };
  const order = idx.reduceRight((o, i) => duplicateOrder(o.length, i).map((k) => o[k]), identity(n));
  return { order, sel: { anchor: idx[0], focus: idx[idx.length - 1] + idx.length } };
}

/** Whether Remove can run: some frame must be left. */
export const canRemove = (n: number, sel: FrameSel): boolean => selectedIndexes(sel, n).length < n;

/** The selected frames dropped (never all of them: then nothing changes); the selection moves to the frame now in their place. */
export function removeEdit(n: number, sel: FrameSel): FrameEdit {
  if (!canRemove(n, sel)) return { order: identity(n), sel };
  const gone = new Set(selectedIndexes(sel, n));
  const order = identity(n).filter((i) => !gone.has(i));
  return { order, sel: selectOne(Math.min(Math.min(sel.anchor, sel.focus), order.length - 1)) };
}

/** The selected range moved one place earlier or later (the frame it passes goes the other way); null at the end. */
export function moveEdit(n: number, sel: FrameSel, step: -1 | 1): FrameEdit | null {
  const idx = selectedIndexes(sel, n);
  if (idx.length === 0) return null;
  const lo = idx[0];
  const hi = idx[idx.length - 1];
  if (lo + step < 0 || hi + step >= n) return null;
  const ids = identity(n);
  const block = ids.slice(lo, hi + 1);
  const order = step < 0 ? [...ids.slice(0, lo - 1), ...block, lo - 1, ...ids.slice(hi + 1)] : [...ids.slice(0, lo), hi + 1, ...block, ...ids.slice(hi + 2)];
  const { anchor, focus } = clampSel(sel, n);
  return { order, sel: { anchor: anchor + step, focus: focus + step } };
}

/** `frames` with the first `files.length` of the `indexes` replaced by `files` in order (extra files are ignored). */
export function replaceAt<T>(frames: readonly T[], indexes: readonly number[], files: readonly T[]): T[] {
  const put = new Map(indexes.slice(0, files.length).map((i, k) => [i, files[k]] as const));
  return frames.map((f, i) => (put.has(i) ? put.get(i)! : f));
}

/** `frames` in `order` (the old indexes in their new places). */
export const reordered = <T,>(frames: readonly T[], order: readonly number[]): T[] => order.flatMap((i) => (i >= 0 && i < frames.length ? [frames[i]] : []));

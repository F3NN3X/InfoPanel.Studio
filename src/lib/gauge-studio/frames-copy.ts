/**
 * An image-sequence gauge from My library being edited (spec §6): its frames, frame rate and, once
 * converted, a vector spec, with its own undo stack like a vector working copy. Each tool is one step.
 * A canvas gauge has none of this: its edits go through the zone's files into the config.
 */
import { emptyHistory, recordChange, redoChange, undoChange, type History } from "@/hooks/config-history";
import type { VectorGauge } from "@/lib/infopanel/gauges/vector";
import { gaugeDataFor } from "./gauge-data";
import type { GaugeLibraryData, GaugeSource, LibraryFrame } from "./model";
import { reordered } from "./frame-select";

/** What an edit changes. */
export interface FramesState {
  frames: LibraryFrame[];
  /** InfoPanel's AnimationSpeed, frames a second (0: jump). */
  animationSpeed: number;
  /** Set by Convert to vector; the frames are kept. */
  vector: VectorGauge | null;
}

export interface FramesCopy {
  name: string;
  origin: Extract<GaugeSource, { kind: "library" }>;
  state: FramesState;
  history: History<FramesState>;
  /** What was loaded or last saved. */
  saved: { name: string; state: FramesState };
}

export function openFramesCopy(name: string, origin: FramesCopy["origin"], frames: LibraryFrame[], animationSpeed: number): FramesCopy {
  const state: FramesState = { frames, animationSpeed, vector: null };
  return { name, origin, state, history: emptyHistory(), saved: { name, state } };
}

/** A new state; the same `key` within 500 ms joins the previous step (a slider drag is one undo). */
export function editFrames(fc: FramesCopy, state: FramesState, key?: string, at = Date.now()): FramesCopy {
  if (state === fc.state) return fc;
  return { ...fc, state, history: recordChange(fc.history, fc.state, key, at) };
}

export const withOrder = (s: FramesState, order: readonly number[]): FramesState => ({ ...s, frames: reordered(s.frames, order) });
export const withFrames = (s: FramesState, frames: LibraryFrame[]): FramesState => ({ ...s, frames });
export const withSpeed = (s: FramesState, animationSpeed: number): FramesState => (s.animationSpeed === animationSpeed ? s : { ...s, animationSpeed });
export const withVectorSpec = (s: FramesState, vector: VectorGauge | null): FramesState => ({ ...s, vector });

export const renameFrames = (fc: FramesCopy, name: string): FramesCopy => (name === fc.name ? fc : { ...fc, name });

export function undoFrames(fc: FramesCopy): FramesCopy {
  const step = undoChange(fc.history, fc.state);
  return step ? { ...fc, state: step.value, history: step.history } : fc;
}

export function redoFrames(fc: FramesCopy): FramesCopy {
  const step = redoChange(fc.history, fc.state);
  return step ? { ...fc, state: step.value, history: step.history } : fc;
}

export const canUndoFrames = (fc: FramesCopy): boolean => fc.history.past.length > 0;
export const canRedoFrames = (fc: FramesCopy): boolean => fc.history.future.length > 0;

export const markFramesSaved = (fc: FramesCopy): FramesCopy => ({ ...fc, saved: { name: fc.name, state: fc.state } });

const sameState = (a: FramesState, b: FramesState) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** Changed since it was loaded or saved (by value: an edit undone back to the start is no change). */
export const isFramesDirty = (fc: FramesCopy): boolean => fc.name !== fc.saved.name || !sameState(fc.state, fc.saved.state);

/** What saving it stores: the frames and frame rate, and the spec once converted (the item's range and source stay). */
export const framesData = (fc: FramesCopy, prev?: GaugeLibraryData): GaugeLibraryData =>
  gaugeDataFor({ gauge: fc.state.vector, frames: fc.state.frames, animationSpeed: fc.state.animationSpeed, prev });

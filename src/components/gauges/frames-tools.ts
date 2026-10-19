/** What the image-sequence editor asks of its source (a canvas gauge's files, or a library item's working copy). */
import type { Recolour } from "@/lib/infopanel/gauges/raster";

export interface FramesTools {
  /** The frames' image URLs in value order (null: one the store can't serve). */
  frames: (string | null)[];
  /** InfoPanel's AnimationSpeed, frames a second. */
  animationSpeed: number;
  /** What is running ("Recolouring"), or null; the tools wait for it. */
  busy: string | null;
  /** The last tool's outcome, or why it failed. */
  note: string | null;
  /** The tools can run (a canvas gauge's files are read when a tool runs, so this is always true there). */
  ready: boolean;
  /** Reorder, drop or repeat frames: `order` lists the old indexes in their new places. */
  reorder: (what: string, order: readonly number[]) => void;
  /** Put picked image files into the frames at `indexes`, in order. */
  replace: (indexes: readonly number[], files: readonly File[]) => Promise<void>;
  /** Recolour every frame; resolves whether it worked. */
  recolour: (r: Recolour) => Promise<boolean>;
  /** A new frame rate; a drag of one slider is one undo step. */
  setSpeed: (fps: number) => void;
  /** Add a vector spec sized to the frames (they are kept). */
  convert: () => Promise<void>;
}

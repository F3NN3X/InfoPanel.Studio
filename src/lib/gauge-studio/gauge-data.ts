/** What saving a gauge to My library stores (spec §6): the item's `data` from the pieces the editor has. */
import type { VectorGauge } from "@/lib/infopanel/gauges/vector";
import type { GaugeLibraryData, LibraryFrame } from "./model";

export interface GaugeDataParts {
  gauge: VectorGauge | null;
  frames?: readonly LibraryFrame[];
  min?: number;
  max?: number;
  animationSpeed?: number;
  /** The profile it came from. */
  source?: string;
  /** The item being updated: what the parts leave open stays as it was. */
  prev?: Partial<Pick<GaugeLibraryData, "min" | "max" | "animationSpeed" | "frames" | "source">>;
}

/** The item's `data`: a spec's own scale sets the range, else the given one, else the item's, else 0..100. */
export function gaugeDataFor(p: GaugeDataParts): GaugeLibraryData {
  const frames = p.frames ?? p.prev?.frames;
  const source = p.source ?? p.prev?.source;
  return {
    ...(p.gauge ? { vector: p.gauge } : {}),
    ...(frames?.length ? { frames: [...frames] } : {}),
    min: p.gauge?.scale?.min ?? p.min ?? p.prev?.min ?? 0,
    max: p.gauge?.scale?.max ?? p.max ?? p.prev?.max ?? 100,
    animationSpeed: p.animationSpeed ?? p.prev?.animationSpeed ?? 0,
    ...(source ? { source } : {}),
  };
}

/** The asset ids an item's `files` lists for its frames: each once, in order. */
export const frameFiles = (frames: readonly LibraryFrame[] | undefined): string[] => [...new Set((frames ?? []).map((f) => f.id))];

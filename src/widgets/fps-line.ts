import { fmt } from "./kit";

/** The "1% low 58 · 12.6 ms" sub line; a reading that is 0 or missing is left out rather than shown as a 0 fps stutter. */
export function fpsSubLine(low: number, frameMs: number): string {
  return [low > 0 ? `1% low ${fmt(low)}` : "", frameMs > 0 ? `${fmt(frameMs, 1)} ms` : ""].filter(Boolean).join(" · ");
}

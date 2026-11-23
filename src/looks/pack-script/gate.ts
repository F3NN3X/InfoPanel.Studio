// When a pack script runs, by the motion block's rules (motion.ts `planMotion`): never at the Effects level Off, in lite mode or
// under reduced motion, never on a hidden page, never unless the server says this pack's script runs (`scriptRuns`) and the
// browser has what the sandbox needs. Calm runs it at the lower rate and tells the script. The watchdog and the flash limit are
// here too: both pure, both read by the host. A change of plan ends the worker; a new plan starts a new one.
import type { FxLevel } from "../pack-json";
import { FLASH_MAX } from "../pack-json";
import { SCRIPT_FPS, WATCHDOG } from "./limits";

/** What decides whether a script runs on this screen now. */
export interface ScriptEnv {
  level: FxLevel;
  lite: boolean;
  reduceMotion: boolean;
  hidden: boolean;
  /** The server's word (`GET /api/packs/<id>/trust` `scriptRuns`). */
  runs: boolean;
  /** Worker, OffscreenCanvas and WebAssembly are there (an older browser keeps the declarative effects). */
  supported: boolean;
}

/** How a script runs: the level it is told and its frame rate. */
export interface ScriptPlan {
  level: "full" | "calm";
  fps: number;
}

/** The plan for a script on this screen, or undefined when it does not run. Pure. */
export function planScript(env: ScriptEnv): ScriptPlan | undefined {
  if (!env.runs || !env.supported || env.hidden || env.level === "off" || env.lite || env.reduceMotion) return undefined;
  return { level: env.level, fps: SCRIPT_FPS[env.level] };
}

/** Whether the browser has the sandbox's parts. */
export const sandboxSupported = (): boolean =>
  typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined" && typeof WebAssembly !== "undefined" && typeof HTMLCanvasElement !== "undefined" && "transferControlToOffscreen" in HTMLCanvasElement.prototype;

/** Counts the frames over budget; `over` says whether the script has now had `WATCHDOG.over` of them inside the window. */
export function watchdog(limit: { over: number; windowMs: number } = WATCHDOG): { over: (now: number) => boolean } {
  let at: number[] = [];
  return {
    over(now) {
      at = [...at.filter((t) => now - t < limit.windowMs), now];
      return at.length >= limit.over;
    },
  };
}

/** A change of this much relative luminance in any cell of the overlay is half a flash (WCAG 2.3.1 counts a pair of opposing changes). */
export const FLASH_STEP = 0.1;

/**
 * The flash limit, enforced by the host: each frame's luminance per cell (the overlay sampled small) against the frame on show;
 * a frame that changes a cell by `FLASH_STEP` or more is a transition, and at most `FLASH_MAX` flashes (twice as many transitions)
 * pass in any second. `allow` says whether this frame may be shown; a refused frame leaves the last one on show.
 */
export function flashGuard(max = FLASH_MAX): { allow: (cells: ArrayLike<number>, now: number) => boolean } {
  let shown: ArrayLike<number> | undefined;
  let at: number[] = [];
  return {
    allow(cells, now) {
      let change = 0;
      for (let i = 0; i < cells.length; i++) change = Math.max(change, Math.abs(cells[i] - (shown?.[i] ?? 0)));
      if (change < FLASH_STEP) {
        shown = cells;
        return true;
      }
      at = at.filter((t) => now - t < 1000);
      if (at.length >= max * 2) return false;
      at.push(now);
      shown = cells;
      return true;
    },
  };
}

/** The luminance of each cell of an RGBA sample (premultiplied by its alpha: the overlay is drawn over the page). */
export function cellLuminance(rgba: ArrayLike<number>): Float32Array {
  const out = new Float32Array(rgba.length / 4);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  for (let i = 0; i < out.length; i++) {
    const k = i * 4;
    out[i] = (0.2126 * lin(rgba[k]) + 0.7152 * lin(rgba[k + 1]) + 0.0722 * lin(rgba[k + 2])) * (rgba[k + 3] / 255);
  }
  return out;
}

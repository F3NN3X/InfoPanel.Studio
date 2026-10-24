// Which AudioMeter plugin container an audio widget reads, and its real spectrum.
import { useRef } from "react";
import { parseSpectrum, SPECTRUM_ENTRY } from "@/lib/audio/spectrum";
import { get, has, num } from "./core/data";
import type { Data } from "./core/types";

/** The AudioMeter plugin's namespace (`plugins.audio-level-meter.<device>.<entry>`). */
export const AUDIO = "plugins.audio-level-meter.";

/**
 * The audio-level-meter container to read: unset = `default-audio`; a pinned one while it reports a
 * level; else ("" or a device gone quiet) the loudest live one, so music routed to a virtual or
 * secondary device still drives the visualiser. A level is the `audio-level` entry, or one the
 * plugin names "Level" (`names`).
 */
export function levelDevice(d: Data, wanted: string | undefined, names?: Record<string, string>): string {
  if (wanted === undefined) return "default-audio";
  if (wanted && has(get(d, `${AUDIO}${wanted}.audio-level`))) return wanted;
  let best = wanted;
  let top = -Infinity;
  for (const [device, v] of Object.entries(deviceLevels(d, names))) {
    if (v > top) {
      top = v;
      best = device;
    }
  }
  return best;
}

/** Each device's level (0–100): its `audio-level` entry, or one the plugin names "Level" (`names`). */
export function deviceLevels(d: Data, names?: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of Object.keys(d)) {
    if (!key.startsWith(AUDIO) || !(key.endsWith(".audio-level") || names?.[key] === "Level")) continue;
    const v = num(get(d, key));
    if (Number.isFinite(v)) out[key.slice(AUDIO.length).split(".")[0]] = v;
  }
  return out;
}

/** Auto's device choice over time: the current device and a challenger waiting to take over. */
export interface DeviceHold {
  device: string;
  challenger?: string;
  since?: number;
}

/** A device at or below this level (%) counts as silent. */
export const SILENT_LEVEL = 1;
/** A challenger must be this many level points louder than the current device… */
export const SWITCH_MARGIN = 10;
/** …for this long before Auto switches to it. */
export const SWITCH_MS = 1500;

/**
 * Sticky Auto: keep the current device while it plays, so Auto doesn't flicker between devices whose
 * levels cross. Switch at once when the current device goes silent (or disappears), and to another
 * device only once it has been clearly louder (`SWITCH_MARGIN`) for `SWITCH_MS`.
 */
export function stickyDevice(levels: Record<string, number>, hold: DeviceHold | null, now: number): DeviceHold {
  let loudest = "";
  let top = -Infinity;
  for (const [device, v] of Object.entries(levels)) {
    if (v > top) {
      top = v;
      loudest = device;
    }
  }
  if (!loudest) return hold ?? { device: "" };
  const current = hold?.device;
  const level = current !== undefined ? levels[current] : undefined;
  if (!current || level === undefined || (level <= SILENT_LEVEL && top > SILENT_LEVEL)) return { device: loudest };
  if (loudest === current || top < level + SWITCH_MARGIN) return { device: current };
  if (hold?.challenger !== loudest || hold.since === undefined) return { device: current, challenger: loudest, since: now };
  return now - hold.since >= SWITCH_MS ? { device: loudest } : hold;
}

/** The device's spectrum bands (0..1), or null before plugin v1.3.0 / with the spectrum off. */
export const spectrumOf = (d: Data, device: string): Float32Array | null => parseSpectrum(get(d, `${AUDIO}${device}.${SPECTRUM_ENTRY}`));

/**
 * `levelDevice` with a sticky Auto (`stickyDevice`): unset = `default-audio`; a pinned device while it
 * reports; else ("" or a pinned device gone quiet) Auto, which holds its pick between renders. `among`
 * limits Auto to those containers: the loudest of the devices a widget has picked.
 */
export function useLevelDevice(d: Data, wanted: string | undefined, names?: Record<string, string>, among?: readonly string[]): string {
  const hold = useRef<DeviceHold | null>(null);
  if (wanted === undefined) return "default-audio";
  if (wanted && has(get(d, `${AUDIO}${wanted}.audio-level`))) return wanted;
  const levels = Object.entries(deviceLevels(d, names)).filter(([id]) => !among || among.includes(id));
  hold.current = stickyDevice(Object.fromEntries(levels), hold.current, performance.now());
  return hold.current.device || wanted;
}

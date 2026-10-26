// A fader's readout, apart from the widget: the island reads it from the kiosk entry.
import { SILENCE_DB, formatDb } from "@/lib/audio/decibels";

/**
 * A fader as Wave Link's calibrated gain in dB (plugin 1.2+: `levelDb`, null = −∞), or its
 * position in % from older plugins.
 */
export const fader = (level: number | null, levelDb?: number | null): string => {
  if (levelDb !== undefined) return formatDb(levelDb ?? SILENCE_DB, { decimals: 1 });
  return level === null ? "—" : `${Math.round(level * 100)}%`;
};

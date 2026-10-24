// The AudioLevelMeter / volume-plugin keys the audio widgets read.
import { get, num, type Data } from "./kit";

const LEVEL = /^plugins\.audio-level-meter\.([^.]+)\.device-name$/;
const GUID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** The device GUID a level-meter container id ends with. */
export const guidOf = (id: string): string | undefined => id.match(GUID)?.[1];

/** The level-meter containers, in key order. */
export const audioIds = (d: Data): string[] => [...new Set(Object.keys(d || {}).map((k) => k.match(LEVEL)?.[1]).filter((id): id is string => !!id))];

/** "Speakers (Realtek …)" → "Speakers". */
export const shortName = (full: string): string => full.replace(/\s*\(.+\)$/, "");

/** The container that meters the active default device is labelled so it does not read as a duplicate. */
export const deviceLabel = (id: string, full: string): string => (id === "default-audio" ? "Default device" : shortName(full));

/** `volume` / `mute` of the volume-plugin entry for a container, matched by the device GUID its id ends with. The
 * default-device container has no GUID; the plugin publishes the default device under `default`. */
export function volumeEntry(d: Data, id: string, suffix: "volume" | "mute"): string | undefined {
  if (id === "default-audio") {
    const key = `plugins.volume-plugin.default.${suffix}`;
    return d?.[key] == null ? undefined : get(d, key);
  }
  const g = guidOf(id);
  const key = g && Object.keys(d).find((k) => k.startsWith("plugins.volume-plugin") && k.includes(`{${g}}`) && k.endsWith(`.${suffix}`));
  return key ? get(d, key) : undefined;
}

export interface AudioDevice {
  id: string;
  name: string;
  full: string;
  /** % of full scale */
  l: number;
  r: number;
  level: number;
  /** dB */
  peak: number;
  rms: number;
  hold: number;
  /** volume %, NaN when the volume plugin has no entry */
  vol: number;
  muted: boolean;
}

export function readDevice(d: Data, id: string): AudioDevice {
  const k = (s: string) => get(d, `plugins.audio-level-meter.${id}.${s}`);
  const hold = num(k("peak-hold"));
  const full = String(k("device-name"));
  return {
    id,
    name: deviceLabel(id, full),
    full,
    l: num(k("left-channel")),
    r: num(k("right-channel")),
    level: num(k("audio-level")),
    peak: num(k("peak-level")),
    rms: num(k("rms-level")),
    hold: hold < -200 ? -96 : hold,
    vol: num(volumeEntry(d, id, "volume")),
    muted: volumeEntry(d, id, "mute") === "True",
  };
}

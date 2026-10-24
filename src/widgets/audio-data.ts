// The AudioLevelMeter / volume-plugin keys the audio widgets read.
import { get, num, type Data } from "./kit";

const LEVEL = /^plugins\.audio-level-meter\.([^.]+)\.device-name$/;
const GUID = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** The device GUID a level-meter container id ends with. */
export const guidOf = (id: string): string | undefined => id.match(GUID)?.[1];

/** The level-meter containers, in key order. */
export const audioIds = (d: Data): string[] => [...new Set(Object.keys(d || {}).map((k) => k.match(LEVEL)?.[1]).filter((id): id is string => !!id))];

export type Flow = "output" | "input";
/** The Show filter of the audio widgets: both flows, or one. */
export type FlowFilter = "all" | Flow;

/** A container's flow: its `data-flow` entry. Containers older plugin versions publish have none, and are all outputs. */
export const flowOf = (d: Data, id: string): Flow => (get(d, `plugins.audio-level-meter.${id}.data-flow`) === "input" ? "input" : "output");

/** The stored Show filter; anything else reads as All devices. */
export const flowFilterOf = (v: unknown): FlowFilter => (v === "output" || v === "input" ? v : "all");

/** Whether a flow passes the Show filter. */
export const inFlow = (flow: Flow, show: FlowFilter): boolean => show === "all" || show === flow;

/** The level-meter containers the Show filter lets through. */
export const audioIdsIn = (d: Data, show: FlowFilter): string[] => audioIds(d).filter((id) => inFlow(flowOf(d, id), show));

/** `ids` narrowed to the picked devices (container id, or device name as a saved bridge keeps it), in the picked order; nothing picked = all. */
export function pickedIds(d: Data, ids: string[], picked: string[] | undefined): string[] {
  if (!picked?.length) return ids;
  const nameOf = (id: string) => shortName(String(get(d, `plugins.audio-level-meter.${id}.device-name`))).toLowerCase();
  return picked.flatMap((c) => ids.find((id) => id === c || nameOf(id) === c.toLowerCase()) ?? []);
}

/** The loudest of the containers (the first when none reports a level); undefined without any. */
export function loudestId(d: Data, ids: string[]): string | undefined {
  let best: string | undefined;
  let top = -Infinity;
  for (const id of ids) {
    const v = num(get(d, `plugins.audio-level-meter.${id}.audio-level`));
    if (best === undefined || v > top) {
      best = id;
      top = Number.isFinite(v) ? v : top;
    }
  }
  return best;
}

/** "Speakers (Realtek …)" → "Speakers". */
export const shortName = (full: string): string => full.replace(/\s*\(.+\)$/, "");

/** The device GUID inside any id (a volume-plugin entry id keeps its GUID in braces). */
const guidIn = (id: string): string | undefined => id.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i)?.[1];

/** The flow of a volume-plugin entry: that of the level-meter container with the same device GUID, else output. */
export function volumeFlowOf(d: Data, volumeId: string): Flow {
  const g = guidIn(volumeId);
  const container = g && audioIds(d).find((id) => guidOf(id) === g);
  return container ? flowOf(d, container) : "output";
}

/** Whether a volume-plugin entry is one of the picked devices (container ids; `default-audio` is the entry `default`). */
export const volumePicked = (volumeId: string, picks: readonly string[]): boolean =>
  picks.some((x) => (x === "default-audio" ? volumeId === "default" : guidOf(x) ? guidIn(volumeId) === guidOf(x) : x === volumeId));

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

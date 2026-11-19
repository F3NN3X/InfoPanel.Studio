import type { SensorValue } from "@/hooks/useSensors";
import type { SensorMap } from "@/modules/types";

/**
 * Pure helpers for the Data API's filtered SSE streams
 * (`/events?prefix=…&interval=…`): the first message after a (re)connect is
 * every key under the prefix, later ones only the changed and removed keys.
 */

/** One message of a filtered stream. */
export interface StreamEvent {
  timestamp: number;
  sensors?: Record<string, SensorValue>;
  removed?: string[];
}

const FIELDS = ["value", "text", "unit", "min", "max", "avg", "name", "source"] as const;

/** True when two readings would render the same. */
export function sameSensor(a: SensorValue | undefined, b: SensorValue | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return FIELDS.every((f) => a[f] === b[f]);
}

/**
 * Merge one stream message into the map, copy-on-write. Keys whose reading
 * did not change keep their old object, and a message that changes nothing
 * returns `prev` itself. `resetPrefix` marks the full set sent on connect:
 * keys under it that the message does not carry are dropped, except those
 * under `spare` (another stream's, which this one never carries).
 */
export function mergeEvent(
  prev: SensorMap,
  event: StreamEvent,
  resetPrefix: string | null,
  spare?: string | readonly string[]
): { values: SensorMap; changed: string[] } {
  let next: SensorMap | null = null;
  const changed: string[] = [];
  const write = (): SensorMap => (next ??= { ...prev });

  const incoming = event.sensors ?? {};
  for (const [key, sensor] of Object.entries(incoming)) {
    if (sameSensor(prev[key], sensor)) continue;
    write()[key] = sensor;
    changed.push(key);
  }
  for (const key of event.removed ?? []) {
    if (!(key in prev)) continue;
    delete write()[key];
    changed.push(key);
  }
  if (resetPrefix !== null) {
    const spared = (key: string) =>
      typeof spare === "string" ? key.startsWith(spare) : spare?.some((s) => key.startsWith(s)) ?? false;
    for (const key of Object.keys(prev)) {
      if (key.startsWith(resetPrefix) && !(key in incoming) && !spared(key)) {
        delete write()[key];
        changed.push(key);
      }
    }
  }
  return { values: next ?? prev, changed };
}

/**
 * The stream prefix a key (or key prefix) belongs to: the plugin for plugin
 * keys (`plugins.<first id segment>.`), else the top-level source
 * (`libre.`, `system.`, …). `plugins.` alone stays `plugins.`.
 */
export function namespaceOf(prefix: string): string {
  const parts = prefix.split(".");
  if (parts[0] === "plugins") {
    return parts.length > 2 && parts[1] ? `plugins.${parts[1]}.` : "plugins.";
  }
  return `${parts[0]}.`;
}

/**
 * The streams to open for the wanted namespaces. Plain HTTP allows six
 * connections per origin, so past `max` streams the plugin namespaces fold
 * into one `plugins.` stream, and if that is still too many, everything
 * comes from the one unfiltered stream (`""`).
 */
export function planStreams(wanted: Iterable<string>, max: number): string[] {
  const set = new Set(wanted);
  // A `plugins.` stream already carries every plugin namespace.
  const all = [...set]
    .filter((ns) => !(set.has("plugins.") && ns.startsWith("plugins.") && ns !== "plugins."))
    .sort();
  if (all.length <= max) return all;
  const folded = [...new Set(all.map((ns) => (ns.startsWith("plugins.") ? "plugins." : ns)))];
  return folded.length <= max ? folded.sort() : [""];
}

/** The audio-level meter's keys: a 10 Hz stream while an audio widget is open, which most widgets never show. */
export const AUDIO_PREFIX = "plugins.audio-level-meter.";

/** True when any changed key falls under one of the prefixes (null = any), unless every changed key is under `quiet`. */
export function touches(changed: readonly string[], prefixes: readonly string[] | null, quiet?: string): boolean {
  if (changed.length === 0) return false;
  if (quiet && changed.every((key) => key.startsWith(quiet))) return false;
  if (prefixes === null) return true;
  return changed.some((key) => prefixes.some((p) => key.startsWith(p)));
}

/**
 * A native widget's Data API key as an InfoPanel binding. Every InfoPanel reading carries a `ref`
 * (`bindingFromRef` reads it). The keys the dashboard pushes itself (`system.*`, `spotify.*`) have none and
 * InfoPanel can't read a pushed value, so they are remapped to the reading InfoPanel has for the same thing.
 */
import type { ChosenSensor } from "../editor/bind.ts";
import { bindingFromRef, type DataApiValue, type NativeBinding } from "../sensors.ts";
import { resolveRole, type Role } from "../templates/roles.ts";

export type KeyBinding = { ok: true; sensor: ChosenSensor; binding: NativeBinding; via: "ref" | "remap" } | { ok: false; reason: string };

/** The pushed system keys and the role whose reading stands in for each. */
const SYSTEM_ROLES: Readonly<Record<string, Role>> = {
  "system.cpu.load": "cpu.load",
  "system.ram.load": "ram.load",
  "system.ram.free": "ram.free",
};

/** The pushed Spotify keys and the Spotify plugin's entry for each. */
const SPOTIFY_ENTRIES: Readonly<Record<string, string>> = {
  "spotify.progress": "track-progress",
  "spotify.album": "album",
  "spotify.art": "cover-art",
  "spotify.track": "current-track",
  "spotify.artist": "artist",
  "spotify.playing": "playback-state",
};

const SPOTIFY_PREFIX = "plugins.spotify-plugin.spotify.";

const chosen = (key: string, v: DataApiValue): ChosenSensor => ({ key, name: v.name ?? key, ...(v.unit ? { unit: v.unit } : {}), ...(v.ref ? { ref: v.ref } : {}) });

const viaRef = (sensor: ChosenSensor, via: "ref" | "remap"): KeyBinding => {
  const binding = sensor.ref ? bindingFromRef(sensor.ref) : null;
  return binding ? { ok: true, sensor, binding, via } : { ok: false, reason: `${sensor.key} has no InfoPanel reference` };
};

/** The key's InfoPanel binding, or why there is none (the item is then shown as a preview only). */
export function bindKey(key: string, sensors: Readonly<Record<string, DataApiValue>>): KeyBinding {
  const own = sensors[key];
  if (own?.ref) return viaRef(chosen(key, own), "ref");
  const role = SYSTEM_ROLES[key];
  if (role) {
    const s = resolveRole(role, sensors);
    return s ? viaRef(s, "remap") : { ok: false, reason: `no reading for ${role} on this PC` };
  }
  const entry = SPOTIFY_ENTRIES[key];
  if (entry) {
    const to = sensors[SPOTIFY_PREFIX + entry];
    return to ? viaRef(chosen(SPOTIFY_PREFIX + entry, to), "remap") : { ok: false, reason: "the Spotify plugin isn't running" };
  }
  return { ok: false, reason: own ? `${key} has no InfoPanel reference` : `${key} isn't in the Data API` };
}

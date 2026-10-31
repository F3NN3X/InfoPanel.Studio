import { TEMPLATE_MODULES } from "@/widgets/registry";
import type { DashboardModule } from "./types";

/**
 * Dashboard module registry: the template widgets (`src/widgets/registry.ts`). The App renders
 * everything registered and feeds unclaimed keys to the generic fallback ("Other sensors").
 */
export const modules: DashboardModule[] = TEMPLATE_MODULES;

/**
 * The plugins a built-in widget covers (the keys the retired legacy modules claimed): their keys stay
 * out of the "Other sensors" catch-all whether or not such a widget is placed.
 */
const claimedPrefixes = [
  "system.cpu.",
  "system.ram.",
  "spotify.",
  "plugins.spotify-plugin.",
  "plugins.media-plugin.",
  "plugins.InfoPanel.SteamAPI.",
  "libre.",
  "hwinfo.",
  "plugins.yr-weather-plugin.",
  "plugins.InfoPanel.RTSS.",
  "plugins.fps-plugin.",
  "plugins.audio-level-meter.",
  "plugins.InfoPanel.VBZ.",
  "plugins.bluetooth-battery-plugin.",
  "plugins.InfoPanel.Notifications.",
  "plugins.InfoPanel.TextFile.",
];

/** True when a built-in widget covers the key. */
export function isClaimed(key: string): boolean {
  return claimedPrefixes.some((p) => key.startsWith(p));
}

/** Every prefix a module renders from (owned and read). */
export function moduleReads(mod: DashboardModule): string[] {
  return [...mod.prefixes, ...(mod.reads ?? [])];
}

export type { DashboardModule, SensorMap } from "./types";

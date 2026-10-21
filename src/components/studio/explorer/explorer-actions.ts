import type { DataPoint } from "@/lib/data-points";
import { newPanel, uid, type DashboardConfig, type SourcePref, type Widget } from "@/lib/layout";
import type { PanelPreset } from "@/lib/panelPresets";
import { onPage } from "@/lib/pages";
import { addPresetPlacement } from "../studio-actions";

/** The panel preset behind "New widget from this value": one stat bound to the point (numbers get a taller zone). */
export function statPreset(point: DataPoint): PanelPreset {
  return {
    id: "explorer-stat",
    title: point.name,
    colSpan: 2,
    rowSpan: point.type === "number" ? 2 : 1,
    make: () => {
      const panel = newPanel(point.name);
      const stat: Widget = {
        id: uid("w"),
        kind: "stat",
        label: point.name,
        sensor: point.key,
        visible: true,
      };
      return { ...panel, widgets: [stat] };
    },
  };
}

/** Add a panel zone with one stat bound to `point` to a page of the profile (the first by default). */
export function addStatZone(
  config: DashboardConfig,
  profileId: string,
  point: DataPoint,
  zoneId: string,
  pageId?: string
): DashboardConfig {
  return {
    ...config,
    profiles: config.profiles.map((p) =>
      p.id === profileId ? onPage(pageId, (v) => addPresetPlacement(v, zoneId, statPreset(point)))(p) : p
    ),
  };
}

/**
 * A source preference (show / hide, display name) patched into the config. An empty display name drops
 * the key, so the source shows under its own name again.
 */
export function withSourcePref(config: DashboardConfig, key: string, pref: Partial<SourcePref>): DashboardConfig {
  const next = { ...config.sourcePrefs?.[key], ...pref };
  if (!next.displayName) delete next.displayName;
  return { ...config, sourcePrefs: { ...config.sourcePrefs, [key]: next } };
}

import type { AlertRule, AlertsConfig } from "@/lib/alerts";
import { ISLAND_SETTING } from "@/lib/island/sources";
import { fontById } from "@/lib/fonts";
import type { GeneralFont, ResolvedGeneral } from "@/lib/general";
import type { IslandConfig } from "@/lib/island/config";
import type { MonitorProfile } from "@/lib/layout";
import { effectiveSettings, type DashboardModule } from "@/modules/types";
import { allSections, widgetContext } from "./inspector-model";
import { placementTitle } from "./studio-modules";

/** One zone of the profile whose widget can send to the island. */
export interface IslandWidgetRow {
  pageId: string;
  pageName: string;
  zoneId: string;
  module: string;
  title: string;
  /** "Send to island" resolved over the widget's default. */
  on: boolean;
  /** A hidden zone sends nothing. */
  visible: boolean;
  /** Another zone of the same widget sends first (one per widget, `islandFeeds`). */
  shadowed: boolean;
}

/** Every zone, on every page of the profile, whose widget has an island source; page order, then zone order. */
export function islandWidgets(profile: MonitorProfile, modules: readonly DashboardModule[]): IslandWidgetRow[] {
  const byId = new Map(modules.map((m) => [m.id, m]));
  const sending = new Set<string>();
  const rows: IslandWidgetRow[] = [];
  for (const page of profile.pages) {
    for (const p of page.placements) {
      const mod = byId.get(p.module);
      if (!mod?.island) continue;
      const on = effectiveSettings(mod, p.settings)[ISLAND_SETTING] === true;
      const counts = on && p.visible;
      rows.push({
        pageId: page.id,
        pageName: page.name,
        zoneId: p.id,
        module: mod.id,
        title: placementTitle(p),
        on,
        visible: p.visible,
        shadowed: counts && sending.has(mod.id),
      });
      if (counts) sending.add(mod.id);
    }
  }
  return rows;
}

/** The widgets with an island source that the profile does not place yet, by title. */
export function unplacedIslandWidgets(profile: MonitorProfile, modules: readonly DashboardModule[]): string[] {
  const placed = new Set(profile.pages.flatMap((pg) => pg.placements.map((p) => p.module)));
  return modules
    .filter((m) => m.island && !placed.has(m.id))
    .map((m) => m.title)
    .sort((a, b) => a.localeCompare(b));
}

/** The inspector section holding a widget's "Send to island" (the jump target), if it has one. */
export function islandSectionId(mod: DashboardModule | undefined): string | undefined {
  if (!mod?.island) return undefined;
  return allSections(widgetContext(mod)).find((s) => s.settings.some((d) => d.key === ISLAND_SETTING))?.id;
}

/** The alert rules that show on this profile's island: display style Island (or the default), for this profile. */
export function islandRules(alerts: AlertsConfig, profileId: string): AlertRule[] {
  return alerts.rules.filter(
    (r) =>
      (r.outputs.display?.style ?? alerts.defaults.style) === "island" &&
      (!r.profiles || r.profiles.length === 0 || r.profiles.includes(profileId))
  );
}

/** What a read-only island row shows: the value, where it comes from, and whether the island still holds its own. */
export interface IslandLink {
  value: string;
  from: string;
  own: boolean;
}

/**
 * The island's Font row (SPEC §10.3): the screen's page font, set in Theme. An island saved with a font of
 * its own keeps rendering with it (`own`); the row says so and offers to follow Theme.
 */
export function islandFontLink(island: Pick<IslandConfig, "font"> | undefined, pageFont: GeneralFont): IslandLink {
  const own = island !== undefined && island.font !== "system";
  const font = own ? island.font : pageFont;
  const label = fontById(font)?.label ?? font;
  return { value: font === "system" ? "System" : label, from: own ? "this island" : "Theme", own };
}

/**
 * The island's Clock format row: hours and seconds as the Dashboard's clock sets them (Settings › Clock &
 * date). An island saved with its own hours or seconds keeps them (`own`), and the row offers to follow
 * the Dashboard.
 */
export function islandClockLink(island: Pick<IslandConfig, "hours" | "seconds"> | undefined, general: Pick<ResolvedGeneral, "hour12" | "showSeconds">): IslandLink {
  const own = island !== undefined && (island.hours !== "general" || island.seconds !== "general");
  const hours = island && island.hours !== "general" ? island.hours === "12" : general.hour12;
  const seconds = island && island.seconds !== "general" ? island.seconds === "show" : general.showSeconds;
  const text = hours === undefined ? "Locale" : hours ? "12 h" : "24 h";
  return { value: seconds ? text : `${text} · no seconds`, from: own ? "this island" : "Dashboard", own };
}

/** The patch that gives the island's own font and clock back to Theme and the Dashboard. */
export const FOLLOW_THEME: Pick<IslandConfig, "font"> = { font: "system" };
export const FOLLOW_DASHBOARD: Pick<IslandConfig, "hours" | "seconds"> = { hours: "general", seconds: "general" };

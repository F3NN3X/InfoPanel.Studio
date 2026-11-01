import { upgradeConfig } from "@/lib/config-upgrade";
import { describe, expect, it } from "vitest";
import { modules } from "@/modules";
import { alignOf, compactOf, sizeTierOf } from "@/modules/setting-readers";
import { effectiveSettings, type DashboardModule, type ModuleSettings } from "@/modules/types";
import type { StoredConfig } from "@/lib/layout";
import { profileWithPage } from "@/lib/pages";
import { appearanceOf, resolveWith } from "@/lib/style-resolve";

/** The look keys v5 layered (`PROFILE_STYLE_KEYS` before config v7 moved the small-zone and alignment keys). */
const V5_STYLE_KEYS: ReadonlySet<string> = new Set([
  "surface", "accent", "skin", "variant", "graph", "meter", "smoothing", "compactView", "autoScale", "scale", "alignX", "alignY",
  "padding", "gap", "radius", "textColor", "mutedColor", "font", "fontWeight", "labelCase", "stroke", "customCss",
  "borderWidth", "borderColor", "glow", "glowColor", "surfaceOpacity", "blur",
]);
const PROFILE_STYLE_KEYS = V5_STYLE_KEYS;

/** The keys v7 renamed or dropped: compared as what they draw (`rendered`). */
const RENAMED = ["variant", "compactView", "compact", "layout", "sizeTier", "alignX", "alignY", "align", "alignSpread", "autoScale"];

/**
 * What a zone draws from its resolved settings: the rest as resolved, the
 * renamed keys as the shell reads them (a Card the widget cannot draw is its
 * full layout, a widget with neither view shows it at any choice; `autoScale`
 * did nothing without a design size).
 */
function rendered(mod: DashboardModule, settings: ModuleSettings): ModuleSettings {
  const all = { ...settings, ...effectiveSettings(mod, settings) };
  const rest = Object.fromEntries(Object.entries(effectiveSettings(mod, settings)).filter(([key]) => !RENAMED.includes(key)));
  const compact = compactOf(all);
  const drawn = compact === "card" ? mod.compact?.card !== false : mod.compact === undefined || mod.compact.card || mod.compact.dense !== false;
  const { alignX, alignY } = alignOf(all);
  return { ...rest, compact: drawn ? compact : "auto", sizeTier: sizeTierOf(all) ?? "auto", alignX, alignY };
}

/**
 * Render parity of the v6 and v7 migrations: every module, under an
 * unchanged v5 config, renders as before. The v5 resolution is frozen here
 * (module default → dashboard style → profile style → own, own skipped
 * while following or forced, the v5 style keys layered).
 */
function v5Resolve(own: ModuleSettings, dashboard: ModuleSettings, profile: ModuleSettings, mode: string | undefined, enforce: boolean): ModuleSettings {
  const settings: ModuleSettings = {};
  for (const [key, value] of Object.entries(own)) if (!PROFILE_STYLE_KEYS.has(key)) settings[key] = value;
  for (const layer of [dashboard, profile, enforce || mode === "follow" ? {} : own]) {
    for (const [key, value] of Object.entries(layer)) if (PROFILE_STYLE_KEYS.has(key)) settings[key] = value;
  }
  return settings;
}

const dashboard = { accent: "#111111", surface: "theme", radius: "8", variant: "studio", compactView: "off" };
const profile = { accent: "#222222", glow: "soft", autoScale: false, smoothing: "smooth" };
const own = { accent: "#333333", font: "mono", glow: "strong", compactView: "on", label: "X", scale: 120 };

const MODES = [undefined, "custom", "follow"] as const;
const FORCE: { dashboard?: boolean; profile?: boolean }[] = [{}, { dashboard: true }, { profile: true }, { dashboard: true, profile: false }];

describe("v6 + v7 render parity", () => {
  for (const force of FORCE) {
    it(`every module renders as before (force ${JSON.stringify(force)})`, () => {
      const placements = modules.flatMap((m) =>
        MODES.map((mode) => ({
          id: `${m.id}:${mode}`,
          module: m.id,
          colStart: 1,
          rowStart: 1,
          colSpan: 1,
          rowSpan: 1,
          visible: true,
          settings: own,
          ...(mode ? { styleMode: mode } : {}),
        }))
      );
      const stored = {
        version: 5,
        activeProfile: "auto",
        style: dashboard,
        ...(force.dashboard !== undefined ? { styleEnforce: force.dashboard } : {}),
        profiles: [
          {
            id: "p",
            name: "Desk",
            width: 1920,
            height: 1080,
            cols: 12,
            rows: 6,
            fit: "scroll",
            style: profile,
            ...(force.profile !== undefined ? { styleEnforce: force.profile } : {}),
            pages: [{ id: "main", name: "Main", placements }],
          },
        ],
      } as unknown as StoredConfig;
      const config = upgradeConfig(stored);
      const view = profileWithPage(config.profiles[0]);
      const appearance = appearanceOf(config, view);
      const enforce = force.profile ?? force.dashboard ?? false;
      for (const z of view.placements) {
        const mod = modules.find((m) => m.id === z.module)!;
        const mode = placements.find((p) => p.id === z.id)!.styleMode;
        const before = rendered(mod, v5Resolve(own, dashboard, profile, mode, enforce));
        const after = rendered(mod, resolveWith(appearance, z.settings, z.follow, undefined, mod.settings) ?? {});
        expect(after, z.id).toEqual(before);
      }
    });
  }
});

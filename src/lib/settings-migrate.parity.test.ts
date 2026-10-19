import { describe, expect, it } from "vitest";
import { modules } from "@/modules";
import { PROFILE_STYLE_KEYS } from "@/modules/standard-settings";
import { effectiveSettings, type ModuleSettings } from "@/modules/types";
import { mergeConfig, type StoredConfig } from "./layout";
import { profileWithPage } from "./pages";
import { appearanceOf, resolveWith } from "./style-resolve";

/**
 * Render parity of the v6 migration: every module, under an unchanged
 * v5 config, renders with the same resolved settings as before. The v5
 * resolution is frozen here (module default → dashboard style → profile
 * style → own, own skipped while following or forced, `PROFILE_STYLE_KEYS`
 * layered).
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

describe("v6 render parity", () => {
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
      const config = mergeConfig(stored);
      const view = profileWithPage(config.profiles[0]);
      const appearance = appearanceOf(config, view);
      const enforce = force.profile ?? force.dashboard ?? false;
      for (const z of view.placements) {
        const mod = modules.find((m) => m.id === z.module)!;
        const mode = placements.find((p) => p.id === z.id)!.styleMode;
        const before = effectiveSettings(mod, v5Resolve(own, dashboard, profile, mode, enforce));
        const after = effectiveSettings(mod, resolveWith(appearance, z.settings, z.follow));
        expect(after, z.id).toEqual(before);
      }
    });
  }
});

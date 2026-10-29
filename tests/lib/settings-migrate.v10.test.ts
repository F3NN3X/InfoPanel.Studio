import { upgradeConfig } from "@/lib/config-upgrade";
import { describe, expect, it } from "vitest";
import { parseProfileFile } from "@/components/studio/profile-file";
import { CONFIG_VERSION, type Placement, type StoredConfig } from "@/lib/layout";
import { profileWithPage } from "@/lib/pages";
import { migratePlacementV10, migrateProfileV10 } from "@/lib/settings-migrate";
import { appearanceOf, resolveWith } from "@/lib/style-resolve";
import { modules } from "@/modules";
import type { ModuleSettings } from "@/modules/types";

const zone = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  module: "CpuMonitor",
  colStart: 1,
  rowStart: 1,
  colSpan: 3,
  rowSpan: 2,
  visible: true,
  ...extra,
});

const stored = (version: number, placements: Record<string, unknown>[]): StoredConfig =>
  ({
    version,
    activeProfile: "auto",
    profiles: [{ id: "p", name: "Desk", width: 1920, height: 1080, cols: 12, rows: 6, fit: "scroll", pages: [{ id: "main", name: "Main", placements }] }],
  }) as unknown as StoredConfig;

const zonesOf = (c: ReturnType<typeof upgradeConfig>): Placement[] => c.profiles[0].pages[0].placements;

/** What each zone resolves to under its profile's theme (the settings a widget renders with). */
function effective(config: ReturnType<typeof upgradeConfig>): Record<string, ModuleSettings> {
  const view = profileWithPage(config.profiles[0]);
  const appearance = appearanceOf(config, view);
  return Object.fromEntries(
    view.placements.map((z): [string, ModuleSettings] => {
      const mod = modules.find((m) => m.id === z.module)!;
      return [z.id, resolveWith(appearance, z.settings, z.follow, undefined, mod.settings) ?? {}];
    })
  );
}

/** The presets as picking them wrote the zone (`applies`), with the marker. */
const PICKED: Record<string, ModuleSettings> = {
  dark: { preset: "dark", surface: "matte-dark", tint: false },
  light: { preset: "light", surface: "matte-light", tint: false },
  vivid: { preset: "vivid", surface: "glass", tint: true },
  mono: { preset: "mono", surface: "matte-dark", tint: false, accent: "#fafafa" },
};

describe("v10: the widget preset key", () => {
  it("drops the key and nothing else, and every preset zone resolves as before", () => {
    const legacy = stored(9, Object.entries(PICKED).map(([id, settings]) => zone(id, { settings: { ...settings, sensor: "libre.cpu" }, follow: { surface: false, colors: false } })));
    const migrated = upgradeConfig(legacy);
    const before = effective({ ...migrated, profiles: [{ ...migrated.profiles[0], pages: [{ ...migrated.profiles[0].pages[0], placements: legacy.profiles![0].pages![0].placements as Placement[] }] }] });
    expect(migrated.version).toBe(CONFIG_VERSION);
    for (const z of zonesOf(migrated)) {
      const { preset: _p, ...kept } = PICKED[z.id];
      expect(z.settings).toEqual({ ...kept, sensor: "libre.cpu" });
      expect(z.follow).toEqual({ surface: false, colors: false });
    }
    // The resolved settings differ only by the retired key.
    for (const [id, settings] of Object.entries(effective(migrated))) {
      const { preset: _p, ...was } = before[id];
      expect(settings).toEqual(was);
    }
  });

  it("a zone whose only setting was the preset ends with no settings", () => {
    const [z] = zonesOf(upgradeConfig(stored(9, [zone("a", { settings: { preset: "default" } })])));
    expect(z.settings).toBeUndefined();
  });

  it("is a no-op, by identity, on a zone or profile without the key", () => {
    const p = upgradeConfig(stored(10, [zone("a", { settings: { accent: "#ff0000" } }), zone("b")])).profiles[0];
    expect(migrateProfileV10(p)).toBe(p);
    for (const z of p.pages[0].placements) expect(migratePlacementV10(z)).toBe(z);
  });

  it("a migrated config migrates to itself", () => {
    const once = upgradeConfig(stored(9, [zone("a", { settings: PICKED.vivid })]));
    expect(upgradeConfig(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });

  it("drops the key from a profile file too (the import path runs upgradeConfig)", async () => {
    const text = JSON.stringify({
      name: "Desk",
      width: 1920,
      height: 1080,
      pages: [{ id: "main", name: "Main", placements: [zone("a", { settings: PICKED.mono })] }],
    });
    const result = await parseProfileFile(text);
    if ("error" in result) throw new Error(result.error);
    expect(result.profile.pages[0].placements[0].settings).toEqual({ surface: "matte-dark", tint: false, accent: "#fafafa" });
  });
});

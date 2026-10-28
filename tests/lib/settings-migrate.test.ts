import { describe, expect, it } from "vitest";
import { normalizeAppearancePresets } from "@/lib/appearance-presets";
import { CONFIG_VERSION, mergeConfig, type StoredConfig } from "@/lib/layout";
import { followFromOwn, migratePlacementV6, migrateProfileV6 } from "@/lib/settings-migrate";
import { allLocked } from "@/lib/theme-model";

const zone = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  module: "CpuMonitor",
  colStart: 1,
  rowStart: 1,
  colSpan: 1,
  rowSpan: 1,
  visible: true,
  ...extra,
});

const v5 = (zones: Record<string, unknown>[], extra: Record<string, unknown> = {}, profile: Record<string, unknown> = {}): StoredConfig =>
  ({
    version: 5,
    activeProfile: "auto",
    profiles: [{ id: "p", name: "Desk", width: 1920, height: 1080, cols: 12, rows: 6, fit: "scroll", pages: [{ id: "main", name: "Main", placements: zones }], ...profile }],
    ...extra,
  }) as unknown as StoredConfig;

const zonesOf = (c: ReturnType<typeof mergeConfig>) => c.profiles[0].pages[0].placements;
const own = { accent: "#ff0000", glow: "soft", sensor: "libre.cpu" };

describe("v6: styleMode → follow", () => {
  it("follow: every section follows, the own values kept (SPEC §9)", () => {
    const [z] = zonesOf(mergeConfig(v5([zone("a", { styleMode: "follow", settings: own })])));
    expect(z.follow).toBeUndefined();
    expect(z.settings).toEqual(own);
    expect("styleMode" in z).toBe(false);
  });

  it("custom: every section with own themed values is custom", () => {
    const [z] = zonesOf(mergeConfig(v5([zone("a", { styleMode: "custom", settings: own })])));
    expect(z.follow).toEqual({ colors: false, border: false });
  });

  it("unset (pre-v6): the same as custom; no own look: every section follows", () => {
    const [a, b] = zonesOf(mergeConfig(v5([zone("a", { settings: own }), zone("b", { settings: { sensor: "x" } })])));
    expect(a.follow).toEqual({ colors: false, border: false });
    expect(b.follow).toBeUndefined();
  });

  it("leaves a v6 zone's follow alone (an unset follow after Use theme keeps following)", () => {
    const stored = { ...v5([zone("a", { settings: own })]), version: 6 };
    const [z] = zonesOf(mergeConfig(stored));
    expect(z.follow).toBeUndefined();
    expect(z.settings).toEqual(own);
  });
});

describe("v6: profile style and force", () => {
  it("moves a profile's style into its widget theme", () => {
    const c = mergeConfig(v5([], {}, { style: { accent: "#00ff00", radius: "8" } }));
    expect(c.profiles[0].widgetTheme).toEqual({ values: { accent: "#00ff00", radius: "8" } });
    expect("style" in c.profiles[0]).toBe(false);
  });

  it("keeps an empty style as the profile's own (Style: Custom)", () => {
    expect(mergeConfig(v5([], {}, { style: {} })).profiles[0].widgetTheme).toEqual({ values: {} });
  });

  it("locks every section of a forced profile, the dashboard's switch where the profile has none", () => {
    expect(allLocked(mergeConfig(v5([], {}, { styleEnforce: true })).profiles[0].widgetTheme)).toBe(true);
    expect(allLocked(mergeConfig(v5([], { styleEnforce: true })).profiles[0].widgetTheme)).toBe(true);
    expect(mergeConfig(v5([], { styleEnforce: true }, { styleEnforce: false })).profiles[0].widgetTheme).toBeUndefined();
    const c = mergeConfig(v5([], { styleEnforce: true }));
    expect("styleEnforce" in c).toBe(false);
    expect("styleEnforce" in c.profiles[0]).toBe(false);
  });

  it("keeps the dashboard style's themed keys only (since v16 on each screen)", () => {
    expect(mergeConfig(v5([], { style: { accent: "#fff", variant: "studio" } })).profiles[0].widgetTheme?.values).toEqual({ accent: "#fff" });
  });

  it("writes the old global variant / compactView / autoScale into the widgets that rendered with them", () => {
    const zones = [
      zone("plain"),
      zone("own", { settings: { variant: "default" } }),
      zone("follows", { styleMode: "follow", settings: { variant: "default", compactView: "off" } }),
      zone("blank", { module: "blank" }),
    ];
    const c = mergeConfig(v5(zones, { style: { compactView: "on" } }, { style: { variant: "studio" } }));
    const [plain, ownV, follows, blank] = zonesOf(c);
    // v7 then folds them into `compact`: studio wins (dense), default + Card on = card.
    expect(plain.settings).toEqual({ compact: "dense" });
    expect(ownV.settings).toEqual({ compact: "card" });
    expect(follows.settings).toEqual({ compact: "dense" });
    expect(blank.settings).toBeUndefined();
    // The style had nothing themed left: the profile keeps a style of its own, empty.
    expect(c.profiles[0].widgetTheme).toEqual({ values: {} });
  });

  it("drops a following widget's ignored variant when nothing global set one (it showed the default)", () => {
    const [z] = zonesOf(mergeConfig(v5([zone("a", { styleMode: "follow", settings: { variant: "studio", accent: "#f00" } })])));
    expect(z.settings).toEqual({ accent: "#f00" });
  });
});

describe("v6: idempotence", () => {
  const legacy = v5(
    [zone("a", { styleMode: "follow", settings: own }), zone("b", { styleMode: "custom", settings: own }), zone("c", { settings: own })],
    { style: { variant: "studio", accent: "#111" }, styleEnforce: true },
    { style: { accent: "#222" } }
  );

  it("a migrated config migrates to itself", () => {
    const once = mergeConfig(legacy);
    expect(once.version).toBe(CONFIG_VERSION);
    expect(mergeConfig(JSON.parse(JSON.stringify(once)))).toEqual(once);
  });

  it("the profile and placement steps are no-ops on their own output for v6 data", () => {
    const once = mergeConfig(legacy);
    const p = once.profiles[0];
    expect(migrateProfileV6(p, { legacy: false })).toEqual(p);
    const z = p.pages[0].placements[1];
    expect(migratePlacementV6(z, { legacy: false })).toBe(z);
  });
});

describe("v6 where outside data enters", () => {
  it("followFromOwn: a saved panel's or a dropped style's own look is custom", () => {
    expect(followFromOwn({ accent: "#fff", label: "x" })).toEqual({ colors: false });
    expect(followFromOwn({ label: "x" })).toBeUndefined();
    expect(followFromOwn(undefined)).toBeUndefined();
  });

  it("appearance presets keep themed keys only", () => {
    const [preset] = normalizeAppearancePresets([
      { id: "a", name: "A", theme: "zinc", radius: 0.5, style: { accent: "#ffffff", variant: "studio", compactView: "on" } },
    ])!;
    expect(preset.style).toEqual({ accent: "#ffffff" });
  });
});

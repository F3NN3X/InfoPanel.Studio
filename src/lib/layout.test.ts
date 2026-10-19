import { describe, expect, it } from "vitest";
import { applyView, mainPage, pageOf, profileWithPage } from "./pages";
import { panelLegacyLook } from "./panel-model";
import {
  CONFIG_VERSION,
  PANEL_ID,
  defaultConfig,
  mergeConfig,
  type PanelDef,
  type StoredProfile,
} from "./layout";
import { arcv2Profile } from "./__fixtures__/arcv2-profile";
import { ISLAND_DEFAULTS } from "./island/config";

const legacyPanel: PanelDef = {
  id: "p",
  title: "Net",
  titleVisible: false,
  visible: true,
  background: "panel",
  layout: "wrap",
  widgets: [{ id: "w", kind: "bar", visible: true }],
};

// A v2 profile: its zones are `placements`, not pages.
const userProfile = (extra: Partial<StoredProfile> = {}): StoredProfile => ({
  id: "mine",
  name: "Mine",
  width: 1920,
  height: 550,
  cols: 12,
  rows: 2,
  fit: "fill",
  placements: [
    { id: "a", module: PANEL_ID, colStart: 1, rowStart: 1, colSpan: 4, rowSpan: 1, visible: true, panel: legacyPanel },
    { id: "b", module: "SystemOverview", colStart: 5, rowStart: 1, colSpan: 4, rowSpan: 1, visible: true },
  ],
  ...extra,
});

describe("mergeConfig", () => {
  it("fills a missing config with the defaults: one blank profile", () => {
    const c = mergeConfig({});
    expect(c.version).toBe(8);
    expect(c.activeProfile).toBe("auto");
    expect(c.profiles).toHaveLength(1);
    expect(c.profiles[0]).toMatchObject({ id: "main", width: 1920, height: 1080 });
    expect(c.profiles[0].pages).toHaveLength(1);
    expect(pageOf(c.profiles[0]).placements).toEqual([]);
    expect(c.stylePresets).toBeUndefined();
    expect(c.panelPresets).toBeUndefined();
  });

  it("gives a fresh install the same one blank profile", () => {
    const c = defaultConfig();
    expect(c.version).toBe(CONFIG_VERSION);
    expect(c.profiles.map((p) => p.id)).toEqual(["main"]);
    expect(pageOf(c.profiles[0]).placements).toEqual([]);
  });

  it("keeps user profiles and injects no sample profile", () => {
    const ids = mergeConfig({ profiles: [userProfile()] }).profiles.map((p) => p.id);
    expect(ids).toEqual(["mine"]);
  });

  it("keeps a stored copy of a formerly shipped profile as it is", () => {
    const old = { ...arcv2Profile(), sampleVersion: 4, pages: [mainPage()] };
    const arc = mergeConfig({ profiles: [userProfile(), old] }).profiles.find((p) => p.id === "arcv2")!;
    expect(arc.sampleVersion).toBe(4);
    expect(pageOf(arc).placements).toEqual([]);
  });

  it("moves a v3 config to v4, rewriting legacy zones on every page and leaving others alone", () => {
    const legacy = (id: string, module: string, settings?: Record<string, string | boolean>) => ({ id, module, colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true, settings });
    const stored = {
      ...userProfile(),
      placements: undefined,
      pages: [
        { id: "one", name: "One", placements: [legacy("s", "systemmodern", { showCores: true }), legacy("u", "someplugin", { x: "1" })] },
        { id: "two", name: "Two", placements: [legacy("t", "textfile")] },
      ],
    };
    const c = mergeConfig({ version: 3, profiles: [stored] });
    expect(c.version).toBe(8);
    const [one, two] = c.profiles[0].pages;
    expect(one.placements[0]).toMatchObject({ id: "s", module: "SystemOverview", settings: { coreView: "heatmap", sections: "cpu,gpu,vram,ram" } });
    expect(one.placements[0].settings).not.toHaveProperty("showCores");
    expect(one.placements[1]).toEqual(legacy("u", "someplugin", { x: "1" }));
    expect(two.placements[0]).toMatchObject({ id: "t", module: "TextFile", settings: { surface: "theme" } });
    // Already migrated: merging again changes nothing.
    expect(mergeConfig(JSON.parse(JSON.stringify(c)))).toEqual(JSON.parse(JSON.stringify(c)));
  });

  it("leaves a card's surface to a dashboard or profile style that picks one", () => {
    const textfile = { id: "t", module: "textfile", colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true };
    const surfaceOf = (c: ReturnType<typeof mergeConfig>) => pageOf(c.profiles[0]).placements[0].settings?.surface;
    expect(surfaceOf(mergeConfig({ profiles: [userProfile({ placements: [textfile] })], style: { surface: "glass" } }))).toBeUndefined();
    expect(surfaceOf(mergeConfig({ profiles: [userProfile({ placements: [textfile], style: { surface: "matte-dark" } })] }))).toBeUndefined();
    expect(surfaceOf(mergeConfig({ profiles: [userProfile({ placements: [textfile], style: { surface: "auto" } })] }))).toBe("theme");
  });

  it("normalizes panel placements and leaves module placements alone", () => {
    const [mine] = mergeConfig({ profiles: [userProfile()] }).profiles;
    const [panel, module] = pageOf(mine).placements;
    expect(panel.panel).toMatchObject({ layout: "stack", direction: "row", wrap: true, title: "Net" });
    expect(panel.panel?.widgets[0].box).toEqual({ w: "fill" });
    expect(panel.settings).toEqual({ label: "" });
    expect(panelLegacyLook(panel)).toEqual({ surface: "panel" });
    expect(module.settings).toBeUndefined();
    expect(module.panel).toBeUndefined();
  });

  it("keeps a profile's island, guarded, and adds none to a profile without one", () => {
    const [plain] = mergeConfig({ profiles: [userProfile()] }).profiles;
    expect(plain.island).toBeUndefined();
    expect(JSON.parse(JSON.stringify(plain))).not.toHaveProperty("island");
    // Stored before the later options existed (values, reserve, look, motion...): those take their defaults.
    const island = { enabled: true, idle: "time-date", size: "l", offsetY: 99, collapseAfter: 30 };
    const [mine] = mergeConfig({ profiles: [userProfile({ island } as never)] }).profiles;
    expect(mine.island).toEqual({ ...ISLAND_DEFAULTS, ...island, offsetY: 64 });
    // It is a profile field, so it survives the page view round trip.
    expect(applyView(mine, profileWithPage(mine)).island).toEqual(mine.island);
  });

  it("is stable when a loaded config is merged again", () => {
    const once = mergeConfig({ profiles: [userProfile()] });
    expect(mergeConfig(JSON.parse(JSON.stringify(once)))).toEqual(JSON.parse(JSON.stringify(once)));
  });


  it("keeps the dashboard style, its force switch becoming the profiles' locks, dropping malformed ones", () => {
    const merged = mergeConfig({ profiles: [userProfile()], style: { accent: "#ff0000" }, styleEnforce: true });
    expect(merged.style).toEqual({ accent: "#ff0000" });
    expect(merged).not.toHaveProperty("styleEnforce");
    expect(merged.profiles[0].widgetTheme?.locks?.colors).toBe(true);
    const bad = mergeConfig({ profiles: [userProfile()], style: ["x"], styleEnforce: "yes" } as never);
    expect(bad.style).toBeUndefined();
    expect(bad.profiles[0].widgetTheme).toBeUndefined();
  });

  it("unpins a profile that no longer exists", () => {
    expect(mergeConfig({ activeProfile: "gone", profiles: [userProfile()] }).activeProfile).toBe("auto");
    expect(mergeConfig({ activeProfile: "mine", profiles: [userProfile()] }).activeProfile).toBe("mine");
  });

  it("keeps stored style presets and drops a non-list", () => {
    const preset = { id: "s", name: "S", settings: { radius: "4" } };
    expect(mergeConfig({ stylePresets: [preset] }).stylePresets).toEqual([preset]);
    expect(mergeConfig({ stylePresets: "x" } as never).stylePresets).toBeUndefined();
  });

  it("keeps the user's appearance presets, guarding each field", () => {
    const good = { id: "a", name: " Mine ", description: "d", theme: "paper", radius: 0.75, style: { surface: "theme" } };
    const c = mergeConfig({
      appearancePresets: [
        good,
        { id: "b", name: "Bad bits", theme: { card: "0 0% 50%", bogus: "x" }, radius: 9, style: { surface: "lava", padding: "8", label: "x" }, background: { type: "image", src: "javascript:alert(1)" } },
        { id: "builtin:dark", name: "Fake builtin", theme: "zinc", radius: 0.5, style: {} },
        { id: "c", name: "", theme: "zinc" },
        { id: "d", name: "No theme", theme: "sepia" },
        "x",
      ],
    } as never);
    expect(c.appearancePresets?.map((p) => p.id)).toEqual(["a", "b"]);
    expect(c.appearancePresets?.[0]).toEqual({ ...good, name: "Mine" });
    const bad = c.appearancePresets![1];
    expect(bad.style).toEqual({ padding: "8" });
    expect(bad.radius).toBe(2);
    expect(bad.background).toEqual({ type: "image" });
    expect(typeof bad.theme === "object" && bad.theme.card).toBe("0 0% 50%");
    expect(bad.theme).not.toHaveProperty("bogus");
    expect(mergeConfig({ appearancePresets: "x" } as never).appearancePresets).toBeUndefined();
    expect(mergeConfig({ appearancePresets: [] }).appearancePresets).toBeUndefined();
    expect(mergeConfig(JSON.parse(JSON.stringify(c))).appearancePresets).toEqual(c.appearancePresets);
  });

  it("passes the dashboard and profile backgrounds through, normalized", () => {
    const c = mergeConfig({
      background: { type: "image", src: "/bg.png", dim: 140 },
      profiles: [userProfile({ background: { type: "none" } }), { ...userProfile(), id: "other" }],
    });
    expect(c.background).toEqual({ type: "image", src: "/bg.png", dim: 100 });
    expect(c.profiles.find((p) => p.id === "mine")?.background).toEqual({ type: "none" });
    expect(c.profiles.find((p) => p.id === "other")?.background).toBeUndefined();
    expect(mergeConfig(JSON.parse(JSON.stringify(c)))).toEqual(JSON.parse(JSON.stringify(c)));
  });

  it("drops an unusable background", () => {
    const c = mergeConfig({
      background: { type: "pattern" } as never,
      profiles: [userProfile({ background: "red" as never })],
    });
    expect(c.background).toBeUndefined();
    expect(c.profiles[0].background).toBeUndefined();
  });

  it("guards the general settings", () => {
    expect(mergeConfig({}).general).toBeUndefined();
    const c = mergeConfig({ general: { font: "serif", locale: "de-DE", motion: "warp" } as never });
    expect(c.general).toEqual({ font: "serif", locale: "de-DE" });
  });

  it("guards a profile's gap, padding, theme and radius", () => {
    const [mine] = mergeConfig({
      profiles: [
        userProfile({
          gap: 24.6,
          padding: -5,
          theme: { background: "0 0% 100%", nonsense: 1 } as never,
          radius: 1,
        }),
      ],
    }).profiles;
    expect(mine).toMatchObject({ gap: 25, padding: 0, theme: { background: "0 0% 100%" }, radius: 1 });
    expect(mine.theme).not.toHaveProperty("nonsense");
    const [bad] = mergeConfig({
      profiles: [userProfile({ gap: "wide" as never, theme: "paper" as never, radius: Number.NaN })],
    }).profiles;
    expect(bad.gap).toBeUndefined();
    expect(bad.theme).toBeUndefined();
    expect(bad.radius).toBeUndefined();
  });
});

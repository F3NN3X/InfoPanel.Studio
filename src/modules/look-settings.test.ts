import { describe, expect, it } from "vitest";
import { categorize, categoryTab } from "@/components/studio/inspector-categories";
import { settingStateOf } from "@/components/studio/settings-model";
import { resolveStyle } from "@/lib/style-resolve";
import { SKIN_PACKS } from "@/widgets/core/theme";
import { CARD_SETTINGS, PANEL_SETTINGS, PROFILE_STYLE_KEYS, STANDARD_SETTINGS, STYLE_SETTINGS } from "./standard-settings";
import { isMore } from "./types";

const LOOK_DEFAULTS = { skin: "auto", variant: "default", graph: "auto", meter: "auto", compactView: "auto" };
const find = (defs: typeof STYLE_SETTINGS, key: string) => defs.find((d) => d.key === key)!;
const values = (defs: typeof STYLE_SETTINGS, key: string) => find(defs, key).options!.map((o) => o.value);

describe("look settings", () => {
  it("are profile style keys with the agreed defaults", () => {
    for (const [key, value] of Object.entries(LOOK_DEFAULTS)) {
      expect(PROFILE_STYLE_KEYS.has(key), key).toBe(true);
      expect(find(STYLE_SETTINGS, key).default, key).toBe(value);
    }
  });

  it("offer auto plus every skin pack", () => {
    expect(values(STYLE_SETTINGS, "skin")).toEqual(["auto", ...SKIN_PACKS.map((p) => p.name)]);
    expect(find(STYLE_SETTINGS, "skin").options![1].label).toBe("Default");
  });

  it("offer the graph, meter and variant choices", () => {
    expect(values(STYLE_SETTINGS, "graph")).toEqual(["auto", "area", "line", "step", "bars", "dots", "braille"]);
    expect(values(STYLE_SETTINGS, "meter")).toEqual(["auto", "bar", "pill", "segments", "blocks", "hair", "wave", "square"]);
    expect(values(STYLE_SETTINGS, "variant")).toEqual(["default", "studio"]);
    expect(values(STYLE_SETTINGS, "compactView")).toEqual(["auto", "off", "on"]);
    expect(find(STYLE_SETTINGS, "compactView").label).toBe("Summary card");
  });

  it("reach widgets, cards and (skin, graph, meter only) panels", () => {
    for (const key of Object.keys(LOOK_DEFAULTS)) {
      expect(STANDARD_SETTINGS.some((d) => d.key === key), key).toBe(true);
      expect(CARD_SETTINGS.some((d) => d.key === key), key).toBe(true);
    }
    const panel = PANEL_SETTINGS.map((d) => d.key);
    expect(["skin", "graph", "meter"].every((k) => panel.includes(k))).toBe(true);
    expect(panel).not.toContain("variant");
    expect(panel).not.toContain("compactView");
  });

  it("file under Skin & graphics in Style, with graph and meter behind More, and graph updates in Motion", () => {
    const categories = categorize(STANDARD_SETTINGS);
    const skin = categories.find((c) => c.title === "Skin & graphics")!;
    expect(skin.general).toBe(true);
    expect(skin.defs.map((d) => d.key)).toEqual(["skin", "graph", "meter", "stroke"]);
    expect(categoryTab(skin)).toBe("style");
    expect(skin.defs.filter(isMore).map((d) => d.key)).toEqual(["graph", "meter"]);
    const motion = categories.find((c) => c.title === "Motion")!;
    expect(motion.defs.map((d) => d.key)).toEqual(["smoothing"]);
    expect(categoryTab(motion)).toBe("behaviour");
  });

  it("resolve dashboard, then profile, then the widget, with source dots", () => {
    const dashboard = { skin: "tui" };
    const profile = { skin: "hud" };
    expect(resolveStyle({ dashboard })).toMatchObject({ settings: { skin: "tui" }, source: { skin: "dashboard" } });
    expect(resolveStyle({ dashboard, profile })).toMatchObject({ settings: { skin: "hud" }, source: { skin: "profile" } });
    const own = { skin: "ink" };
    expect(resolveStyle({ dashboard, profile, own, mode: "custom" })).toMatchObject({ settings: { skin: "ink" }, source: { skin: "own" } });
    expect(resolveStyle({ dashboard, profile, own, mode: "follow" }).settings.skin).toBe("hud");
    expect(resolveStyle({ dashboard, profile, own, mode: "custom", enforce: true }).settings.skin).toBe("hud");
  });

  it("show the layer a skin comes from", () => {
    const skin = find(STYLE_SETTINGS, "skin");
    expect(settingStateOf(skin, undefined, undefined)).toBe("default");
    expect(settingStateOf(skin, { skin: "ink" }, undefined)).toBe("here");
    expect(settingStateOf(skin, { skin: "ink" }, { skin: "hud" })).toBe("overriding");
    expect(settingStateOf(skin, {}, { skin: "hud" })).toBe("profile");
  });
});

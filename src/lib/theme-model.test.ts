import { describe, expect, it } from "vitest";
import { PROFILE_STYLE_KEYS, STANDARD_DEFAULTS } from "@/modules/standard-settings";
import type { ModuleSetting } from "@/modules/types";
import {
  allLocked,
  following,
  isLocked,
  normalizeWidgetTheme,
  ownApplies,
  SECTION_IDS,
  sectionOfKey,
  THEME_DEFAULTS,
  THEMED_KEYS,
  themeSet,
  themeVal,
  valueOf,
  withAllLocked,
  withThemeValues,
  type ThemeLevels,
} from "./theme-model";

const def = (key: string, extra: Partial<ModuleSetting> = {}): ModuleSetting => ({ key, label: key, type: "color", default: "", ...extra });

describe("themed keys and sections", () => {
  it("are today's look keys, Units & format, the thresholds, the palette roles and the meters' response (config v7)", () => {
    const thresholds = ["load", "temp", "full", "db", "value"].flatMap((q) => [`warn.${q}`, `crit.${q}`]);
    const roles = ["s1", "s2", "s3", "s4", "s5", "s6", "ok", "warn", "crit"];
    // alignX / alignY stay readable until PR 8 (align + alignSpread replace them).
    const legacy = ["alignX", "alignY"];
    expect([...THEMED_KEYS].sort()).toEqual(
      [...PROFILE_STYLE_KEYS, ...legacy, "tempUnit", "rateUnit", "decimals", "clock", ...thresholds, ...roles, "meterBallistics"].sort()
    );
    for (const key of ["autoScale", "variant", "compactView", "compact", "sizeTier", "layout"]) expect(THEMED_KEYS.has(key), key).toBe(false);
  });

  it("file each key in one followable section (SPEC §2.2)", () => {
    expect(sectionOfKey("accent")).toBe("colors");
    expect(sectionOfKey("alignY")).toBe("spacing");
    expect(sectionOfKey("glowColor")).toBe("border");
    expect(sectionOfKey("smoothing")).toBe("motion");
    expect(sectionOfKey("customCss")).toBe("css");
    expect(sectionOfKey("sensor")).toBeUndefined();
    expect(sectionOfKey("variant")).toBeUndefined();
    expect(SECTION_IDS).toHaveLength(11);
  });

  it("default to today's standard defaults (nothing repaints on upgrade), the spec's thresholds (owner decision Q3)", () => {
    expect(Object.keys(THEME_DEFAULTS).sort()).toEqual([...THEMED_KEYS].sort());
    for (const [key, value] of Object.entries(THEME_DEFAULTS)) if (key in STANDARD_DEFAULTS) expect(STANDARD_DEFAULTS[key], key).toBe(value);
    expect(THEME_DEFAULTS).toMatchObject({ "warn.load": 80, "crit.load": 92, "warn.temp": 80, "crit.temp": 90, "warn.full": 85, "crit.full": 95, "warn.db": -9, "crit.db": -2, "warn.value": 70, "crit.value": 90 });
    expect(THEME_DEFAULTS).toMatchObject({ tempUnit: "c", rateUnit: "auto", decimals: "auto", clock: "auto", meterBallistics: "peak", s1: "", ok: "", crit: "" });
  });

});

describe("resolution (SPEC §3.2)", () => {
  const levels: ThemeLevels = {
    base: { accent: "#base", font: "serif", radius: "4" },
    profile: { values: { accent: "#profile", glow: "soft" }, locks: { border: true } },
    page: { values: { accent: "#page", font: "mono" }, follow: { colors: false } },
  };

  it("themeVal: the page for a section it made its own, else the profile, the base, the defaults", () => {
    expect(themeVal(levels, "accent")).toBe("#page");
    expect(themeVal(levels, "font")).toBe("serif");
    expect(themeVal(levels, "glow")).toBe("soft");
    expect(themeVal(levels, "radius")).toBe("4");
    expect(themeVal(levels, "blur")).toBe("auto");
    expect(themeSet(levels, "blur")).toBeUndefined();
    expect(themeSet(levels, "sensor")).toBeUndefined();
  });

  it("following: a widget section follows unless custom; a locked section always follows", () => {
    expect(following(levels, undefined, "colors")).toBe(true);
    expect(following(levels, { colors: false }, "colors")).toBe(false);
    expect(following(levels, { colors: true }, "colors")).toBe(true);
    expect(following(levels, { border: false }, "border")).toBe(true);
    expect(isLocked(levels, "border")).toBe(true);
    expect(isLocked(levels, "colors")).toBe(false);
  });

  const table: [string, { settings?: Record<string, string>; follow?: Record<string, boolean> }, Partial<ModuleSetting>, string][] = [
    ["following: the theme", { settings: { accent: "#own" } }, {}, "#page"],
    ["custom: the own value", { settings: { accent: "#own" }, follow: { colors: false } }, {}, "#own"],
    ["custom without one: the theme", { follow: { colors: false } }, {}, "#page"],
    ["locked: the theme, custom or not", { settings: { glow: "strong" }, follow: { border: false } }, { key: "glow", default: "none" }, "soft"],
    ["per widget: the own value", { settings: { accent: "#own" } }, { perWidget: true }, "#own"],
    ["not themed: the own value", { settings: { tint: "yes" } }, { key: "tint" }, "yes"],
    ["not themed, unset: the row default", {}, { key: "tint", default: "no" }, "no"],
    ["unset everywhere: the row default", {}, { key: "borderColor", default: "#row" }, "#row"],
  ];
  it("valueOf reads the theme or the own value by section state", () => {
    for (const [name, zone, row, expected] of table) expect(valueOf(levels, zone, def(row.key ?? "accent", row)), name).toBe(expected);
  });

  it("valueOf falls back to the theme default where the row has none", () => {
    expect(valueOf({}, {}, { key: "smoothing", default: undefined as never })).toBe("stepped");
  });

  it("ownApplies: only where the section is custom (and not locked), always for other keys", () => {
    expect(ownApplies(levels, {}, "accent")).toBe(false);
    expect(ownApplies(levels, { follow: { colors: false } }, "accent")).toBe(true);
    expect(ownApplies(levels, { follow: { border: false } }, "glow")).toBe(false);
    expect(ownApplies(levels, {}, "sensor")).toBe(true);
  });

});

describe("theme edits", () => {

  it("withThemeValues / withAllLocked keep the rest and drop an empty theme", () => {
    const locked = withAllLocked(undefined, true);
    expect(allLocked(locked)).toBe(true);
    expect(withThemeValues(locked, { accent: "#fff" })).toEqual({ ...locked, values: { accent: "#fff" } });
    expect(withAllLocked(withThemeValues(locked, { accent: "#fff" }), false)).toEqual({ values: { accent: "#fff" } });
    expect(withThemeValues({ values: { accent: "#fff" } }, undefined)).toBeUndefined();
    expect(withThemeValues(undefined, {})).toEqual({ values: {} });
    expect(allLocked({ locks: { colors: true } })).toBe(false);
  });

  it("normalizeWidgetTheme keeps themed values and boolean flags of known sections", () => {
    expect(normalizeWidgetTheme(null)).toBeUndefined();
    expect(normalizeWidgetTheme({})).toBeUndefined();
    expect(
      normalizeWidgetTheme({
        values: { accent: "#fff", variant: "studio", glow: { bad: 1 } },
        follow: { colors: false, nope: false, type: "no" },
        locks: { border: true },
      })
    ).toEqual({ values: { accent: "#fff" }, follow: { colors: false }, locks: { border: true } });
    expect(normalizeWidgetTheme({ values: {} })).toEqual({ values: {} });
  });
});

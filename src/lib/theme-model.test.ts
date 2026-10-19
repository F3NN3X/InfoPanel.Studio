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
  sectionsWithValues,
  THEME_DEFAULTS,
  THEMED_KEYS,
  themedOf,
  themeKeyOf,
  themeSet,
  themeVal,
  valueOf,
  withAllLocked,
  withFlag,
  withThemeValues,
  type ThemeLevels,
} from "./theme-model";

const def = (key: string, extra: Partial<ModuleSetting> = {}): ModuleSetting => ({ key, label: key, type: "color", default: "", ...extra });

describe("themed keys and sections", () => {
  it("are today's look keys minus autoScale, variant and compactView", () => {
    expect([...THEMED_KEYS].sort()).toEqual(
      [...PROFILE_STYLE_KEYS].filter((k) => !["autoScale", "variant", "compactView"].includes(k)).sort()
    );
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

  it("default to today's standard defaults (nothing repaints on upgrade)", () => {
    expect(Object.keys(THEME_DEFAULTS).sort()).toEqual([...THEMED_KEYS].sort());
    for (const [key, value] of Object.entries(THEME_DEFAULTS)) expect(STANDARD_DEFAULTS[key], key).toBe(value);
  });

  it("read a row's own key until palette roles are themed (PR 3)", () => {
    expect(themeKeyOf(def("cpuColor", { role: "s1" }))).toBe("cpuColor");
    expect(themeKeyOf(def("ringColor", { role: "accent" }))).toBe("ringColor");
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
  for (const [name, zone, row, expected] of table) {
    it(`valueOf — ${name}`, () => {
      expect(valueOf(levels, zone, def(row.key ?? "accent", row))).toBe(expected);
    });
  }

  it("valueOf falls back to the theme default where the row has none", () => {
    expect(valueOf({}, {}, { key: "smoothing", default: undefined as never })).toBe("stepped");
  });

  it("ownApplies: only where the section is custom (and not locked), always for other keys", () => {
    expect(ownApplies(levels, {}, "accent")).toBe(false);
    expect(ownApplies(levels, { follow: { colors: false } }, "accent")).toBe(true);
    expect(ownApplies(levels, { follow: { border: false } }, "glow")).toBe(false);
    expect(ownApplies(levels, {}, "sensor")).toBe(true);
  });

  it("gives visibleIf the resolved values: glow from the theme shows Glow color", () => {
    const glowColor = { visibleIf: (v: Record<string, unknown>) => (v.glow ?? "none") !== "none" };
    const resolved = { glow: valueOf(levels, {}, def("glow", { default: "none" })) };
    expect(glowColor.visibleIf(resolved)).toBe(true);
    const own = { glow: valueOf({}, { settings: { glow: "soft" }, follow: { border: false } }, def("glow", { default: "none" })) };
    expect(glowColor.visibleIf(own)).toBe(true);
    expect(glowColor.visibleIf({ glow: valueOf({}, {}, def("glow", { default: "none" })) })).toBe(false);
  });
});

describe("theme edits", () => {
  it("withFlag stores only what differs from the flag's default", () => {
    expect(withFlag(undefined, "colors", false)).toEqual({ colors: false });
    expect(withFlag({ colors: false }, "colors", true)).toBeUndefined();
    expect(withFlag({ colors: false, type: false }, "colors", true)).toEqual({ type: false });
    expect(withFlag(undefined, "colors", true, false)).toEqual({ colors: true });
    expect(withFlag({ colors: true }, "colors", false, false)).toBeUndefined();
  });

  it("withThemeValues / withAllLocked keep the rest and drop an empty theme", () => {
    const locked = withAllLocked(undefined, true);
    expect(allLocked(locked)).toBe(true);
    expect(withThemeValues(locked, { accent: "#fff" })).toEqual({ ...locked, values: { accent: "#fff" } });
    expect(withAllLocked(withThemeValues(locked, { accent: "#fff" }), false)).toEqual({ values: { accent: "#fff" } });
    expect(withThemeValues({ values: { accent: "#fff" } }, undefined)).toBeUndefined();
    expect(withThemeValues(undefined, {})).toEqual({ values: {} });
    expect(allLocked({ locks: { colors: true } })).toBe(false);
  });

  it("themedOf / sectionsWithValues read only themed keys", () => {
    expect(themedOf({ accent: "#fff", variant: "studio", sensor: "x" })).toEqual({ accent: "#fff" });
    expect(sectionsWithValues({ glow: "soft", accent: "#fff", label: "x" })).toEqual(["colors", "border"]);
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

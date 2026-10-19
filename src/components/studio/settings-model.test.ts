import { describe, expect, it } from "vitest";
import { PROFILE_STYLE_KEYS, STANDARD_SETTINGS } from "@/modules/standard-settings";
import { effectiveSettings, type ModuleSetting } from "@/modules/types";
import {
  dropKeys,
  filterSettings,
  matchesQuery,
  presetChoice,
  presetDefaults,
  settingState,
  settingStateOf,
} from "./settings-model";

const def = (key: string, extra: Partial<ModuleSetting> = {}): ModuleSetting => ({
  key,
  label: key,
  type: "boolean",
  default: false,
  ...extra,
});

describe("filterSettings", () => {
  const GROUP_EFFECTS = "Border & effects";
  const defs = [
    def("glow", { label: "Edge glow", group: GROUP_EFFECTS }),
    def("glowColor", { label: "Glow color (empty = accent)", group: GROUP_EFFECTS }),
    def("tempUnit", {
      label: "Temperature unit",
      type: "select",
      options: [
        { value: "c", label: "Celsius" },
        { value: "f", label: "Fahrenheit" },
      ],
    }),
    def("cafe", { label: "Café mode" }),
    def("blur", { label: "Background blur", group: GROUP_EFFECTS }),
    def("tempWarn", { label: "Warn at", group: "Thresholds" }),
  ];
  const keys = (q: string) => filterSettings(defs, q).map((d) => d.key);

  it("returns everything for a blank query", () => {
    expect(keys("")).toHaveLength(defs.length);
    expect(keys("   ")).toHaveLength(defs.length);
  });

  it("matches the label case-insensitively", () => {
    expect(keys("GLOW")).toEqual(["glow", "glowColor"]);
  });

  it("does not pull in a whole group when rows match directly", () => {
    expect(keys("glow")).toEqual(["glow", "glowColor"]);
  });

  it("falls back to the group name when no row matches directly", () => {
    expect(keys("border & effects")).toEqual(["glow", "glowColor", "blur"]);
  });

  it("matches the key, the group and option labels", () => {
    expect(keys("tempunit")).toEqual(["tempUnit"]);
    expect(keys("thresh")).toEqual(["tempWarn"]);
    expect(keys("fahren")).toEqual(["tempUnit"]);
  });

  it("ignores diacritics on both sides", () => {
    expect(keys("cafe")).toEqual(["cafe"]);
    expect(keys("CAFÉ")).toEqual(["cafe"]);
  });

  it("returns nothing when nothing matches", () => {
    expect(keys("zzz")).toEqual([]);
  });
});

describe("matchesQuery", () => {
  it("folds case and diacritics; blank matches", () => {
    expect(matchesQuery(["Zone frame"], "FRAME")).toBe(true);
    expect(matchesQuery(["Fond d'écran"], "ecran")).toBe(true);
    expect(matchesQuery(["Zone frame"], "glow")).toBe(false);
    expect(matchesQuery([], "")).toBe(true);
  });
});

describe("settingState", () => {
  it("is default when nothing is set", () => {
    expect(settingState("glow", undefined, undefined, "none")).toBe("default");
    expect(settingState("glow", {}, {}, "none")).toBe("default");
  });

  it("is here when only the widget sets it", () => {
    expect(settingState("glow", { glow: "soft" }, undefined, "none")).toBe("here");
  });

  it("is default when the widget's own value is the default", () => {
    expect(settingState("glow", { glow: "none" }, undefined, "none")).toBe("default");
  });

  it("is profile when only the profile style sets it", () => {
    expect(settingState("glow", {}, { glow: "soft" }, "none")).toBe("profile");
  });

  it("is overriding when both set it", () => {
    expect(settingState("glow", { glow: "strong" }, { glow: "soft" }, "none")).toBe("overriding");
    expect(settingState("glow", { glow: "none" }, { glow: "soft" }, "none")).toBe("overriding");
  });

  it("treats false and 0 as set values", () => {
    expect(settingState("tint", { tint: false }, undefined, true)).toBe("here");
    expect(settingState("scale", undefined, { scale: 0 }, 100)).toBe("profile");
  });

  it("tells the dashboard style from the profile style", () => {
    const from = { glow: "dashboard", radius: "profile" } as const;
    expect(settingState("glow", {}, { glow: "soft" }, "none", from)).toBe("dashboard");
    expect(settingState("radius", {}, { radius: "8" }, "auto", from)).toBe("profile");
    expect(settingState("glow", { glow: "strong" }, { glow: "soft" }, "none", from)).toBe("overriding");
  });

  it("does not mark a value from the default layer (a panel's legacy look)", () => {
    const from = { surface: "default" } as const;
    expect(settingState("surface", {}, { surface: "bordered" }, "panel", from)).toBe("default");
    expect(settingState("surface", { surface: "glass" }, { surface: "bordered" }, "panel", from)).toBe("here");
  });

  it("is ignored when a set value is not in effect (the widget follows, or the style is forced)", () => {
    expect(settingState("glow", { glow: "soft" }, undefined, "none", undefined, true)).toBe("ignored");
    expect(settingState("glow", { glow: "soft" }, { glow: "strong" }, "none", undefined, true)).toBe("ignored");
    expect(settingState("tint", { tint: false }, undefined, true, undefined, true)).toBe("ignored");
  });

  it("is not ignored when there is nothing to ignore", () => {
    expect(settingState("glow", undefined, undefined, "none", undefined, true)).toBe("default");
    expect(settingState("glow", { glow: "none" }, undefined, "none", undefined, true)).toBe("default");
    expect(settingState("glow", {}, { glow: "soft" }, "none", { glow: "dashboard" }, true)).toBe("dashboard");
  });

  it("ignores an own default that hides an inherited value", () => {
    expect(settingState("glow", { glow: "none" }, { glow: "soft" }, "none", undefined, true)).toBe("ignored");
  });

  it("ranks the dashboard state under the profile one", () => {
    const def = STANDARD_SETTINGS.find((s) => s.type === "align")!;
    const from = { align: "dashboard", alignSpread: "profile" } as const;
    expect(settingStateOf(def, {}, { align: "tl", alignSpread: true }, from)).toBe("profile");
    expect(settingStateOf(def, {}, { align: "tl" }, from)).toBe("dashboard");
  });
});

describe("dropKeys", () => {
  it("removes the given keys and keeps the rest", () => {
    expect(dropKeys({ a: 1, b: 2, c: 3 }, new Set(["a", "c"]))).toEqual({ b: 2 });
  });

  it("returns undefined when nothing is left", () => {
    expect(dropKeys({ a: 1 }, new Set(["a"]))).toBeUndefined();
    expect(dropKeys(undefined, new Set(["a"]))).toBeUndefined();
  });
});

describe("the alignment picker setting", () => {
  const align = STANDARD_SETTINGS.find((s) => s.type === "align")!;

  it("stores the cell and the spread (config v7: one key for both axes)", () => {
    expect([align.key, align.keyY]).toEqual(["align", "alignSpread"]);
    expect(PROFILE_STYLE_KEYS.has("align")).toBe(true);
    expect(PROFILE_STYLE_KEYS.has("alignSpread")).toBe(true);
    expect(PROFILE_STYLE_KEYS.has("alignX")).toBe(false);
    const mod = { id: "m", title: "M", prefixes: [], render: () => null, settings: [align] };
    expect(effectiveSettings(mod, { alignSpread: true })).toEqual({ align: "auto", alignSpread: true });
    expect(effectiveSettings(mod, {})).toEqual({ align: "auto", alignSpread: false });
  });

  it("is found by the search for either axis", () => {
    for (const q of ["align", "horizontal", "vertical", "spread"])
      expect(filterSettings(STANDARD_SETTINGS, q)).toContain(align);
  });

  it("takes the strongest state of its keys", () => {
    expect(settingStateOf(align, undefined, undefined)).toBe("default");
    expect(settingStateOf(align, { alignSpread: true }, undefined)).toBe("here");
    expect(settingStateOf(align, { alignSpread: true }, { align: "tl" })).toBe("here");
    expect(settingStateOf(align, { align: "br" }, { align: "tl" })).toBe("overriding");
    expect(settingStateOf(align, {}, { alignSpread: true })).toBe("profile");
  });
});

describe("sensor settings search", () => {
  const sensor: ModuleSetting = { key: "src", label: "Source", type: "sensor", default: "" };
  it("answers to sensor, data and bind", () => {
    for (const q of ["sensor", "data", "bind"]) expect(filterSettings([sensor], q)).toEqual([sensor]);
    expect(filterSettings([{ ...sensor, type: "text" }], "bind")).toEqual([]);
  });
});

describe("preset rows", () => {
  const view: ModuleSetting = {
    key: "view",
    label: "Preset",
    type: "preset",
    default: "full",
    options: [
      { value: "full", label: "Full", applies: { a: true, b: true } },
      { value: "now", label: "Now", applies: { a: false, b: true } },
      { value: "same", label: "Same as now", applies: { a: false, b: true } },
    ],
  };

  it("takes the bundled keys' defaults from the default option", () => {
    expect(presetDefaults(view)).toEqual({ a: true, b: true });
  });

  it("reads the stored option while the toggles match it, else the first that matches, else Custom", () => {
    expect(presetChoice(view, "full", { a: true, b: true })).toBe("full");
    expect(presetChoice(view, "same", { a: false, b: true })).toBe("same");
    expect(presetChoice(view, "full", { a: false, b: true })).toBe("now");
    expect(presetChoice(view, "now", { a: true, b: false })).toBe("custom");
  });
});

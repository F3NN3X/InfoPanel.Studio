import { describe, expect, it } from "vitest";
import { modules } from "@/modules";
import {
  CARD_SETTINGS,
  PANEL_SETTINGS,
  PROFILE_STYLE_KEYS,
  STANDARD_KEYS,
  STANDARD_SETTINGS,
} from "@/modules/standard-settings";
import { settingKeys, type ModuleSetting } from "@/modules/types";
import {
  categorize,
  categoryTab,
  categoryTitleOf,
  filterCategories,
  OTHER_TITLE,
  SHARED_SECTIONS,
  sharedSectionOf,
  tabOf,
  TITLE_ONLY_HINT,
  withHeaderMode,
  withShared,
} from "./inspector-categories";

const def = (key: string, group?: string, label = key): ModuleSetting => ({
  key,
  label,
  type: "boolean",
  default: false,
  group,
});
const std = (key: string) => STANDARD_SETTINGS.find((d) => d.key === key)!;
const color = (key: string, group?: string): ModuleSetting => ({ key, label: key, type: "color", default: "", group });

const SHARED_TITLES = new Set(SHARED_SECTIONS.map((c) => c.title));
/** The shared sections only the standard block fills (Motion also holds the audio meters' response). */
const STANDARD_ONLY = new Set(["header", "fit", "skin", "colors", "surface", "type", "spacing", "border", "css"]);

const sheets: [string, ModuleSetting[]][] = [
  ...modules.map((m): [string, ModuleSetting[]] => [m.id, (m.settings ?? []).filter((d) => !d.hidden)]),
  ["cards", CARD_SETTINGS],
  ["panel", PANEL_SETTINGS],
];

describe("shared sections", () => {
  it("keeps the canonical order, unique ids and the spec's tabs", () => {
    expect(SHARED_SECTIONS.map((c) => [c.tab, c.title])).toEqual([
      ["show", "Header"],
      ["show", "Fit"],
      ["style", "Skin & graphics"],
      ["style", "Colors"],
      ["style", "Widget colors"],
      ["style", "Surface"],
      ["style", "Typography"],
      ["style", "Size & spacing"],
      ["style", "Border & glow"],
      ["style", "Custom CSS"],
      ["data", "Units & format"],
      ["behaviour", "Thresholds"],
      ["behaviour", "Dynamic Island"],
      ["behaviour", "Motion"],
    ]);
    expect(new Set(SHARED_SECTIONS.map((c) => c.id)).size).toBe(SHARED_SECTIONS.length);
  });

  it("puts Header and the Behaviour leads before a widget's own sections, Fit, Units, Island and Motion after", () => {
    expect(SHARED_SECTIONS.filter((s) => s.place === "trail").map((s) => s.id)).toEqual(["fit", "format", "island", "motion"]);
  });

  it("files every standard setting by the section it names", () => {
    const ids = new Set(SHARED_SECTIONS.map((s) => s.id));
    for (const d of STANDARD_SETTINGS) {
      expect(d.section, d.key).toBeDefined();
      expect(ids.has(d.section!), d.key).toBe(true);
      expect(categoryTitleOf(d), d.key).toBe(SHARED_SECTIONS.find((s) => s.id === d.section)!.title);
    }
  });

  it("files the standard keys per spec §2.2, with smoothing in Motion", () => {
    const keysOf = (id: string) => STANDARD_SETTINGS.filter((d) => d.section === id).map((d) => d.key);
    expect(keysOf("header")).toEqual(["showTitle", "label", "icon"]);
    expect(keysOf("fit")).toEqual(["compact", "sizeTier"]);
    expect(keysOf("skin").sort()).toEqual(["graph", "meter", "skin", "stroke"]);
    expect(keysOf("colors").sort()).toEqual(["accent", "mutedColor", "preset", "textColor"]);
    expect(keysOf("surface").sort()).toEqual(["background", "backgroundOn", "blur", "surface", "surfaceOpacity"]);
    expect(keysOf("type")).toEqual(["font", "fontWeight", "labelCase"]);
    expect(keysOf("border")).toEqual(["borderWidth", "borderColor", "glow", "glowColor"]);
    expect(keysOf("css")).toEqual(["customCss"]);
    expect(keysOf("motion")).toEqual(["smoothing"]);
  });

  it("puts the spec's More rows behind More", () => {
    const more = STANDARD_SETTINGS.filter((d) => d.more).map((d) => d.key).sort();
    expect(more).toEqual(["background", "backgroundOn", "customCss", "graph", "icon", "meter", "preset", "sizeTier"]);
    expect(STANDARD_SETTINGS.some((d) => d.advanced)).toBe(false);
  });

  it("covers every profile style key", () => {
    for (const key of PROFILE_STYLE_KEYS) {
      const d = STANDARD_SETTINGS.find((s) => settingKeys(s).includes(key));
      expect(d?.section, key).toBeDefined();
    }
  });
});

describe("sharedSectionOf", () => {
  it("files a widget's own rows by the mechanical rules", () => {
    expect(sharedSectionOf({ ...def("x", "Mine"), section: "thresholds" })).toBe("thresholds");
    expect(sharedSectionOf(def("island", "Mine"))).toBe("island");
    expect(sharedSectionOf(def("islandFaders", "Mine"))).toBe("island");
    expect(sharedSectionOf(def("islander", "Mine"))).toBeUndefined();
    expect(sharedSectionOf({ ...def("tint", "Mine"), tab: "style" })).toBe("palette");
    expect(sharedSectionOf(def("warn", "Thresholds"))).toBe("thresholds");
    expect(sharedSectionOf(def("x", "Mine"))).toBeUndefined();
  });
});

describe("categorize", () => {
  it("puts shared sections first in canonical order, then the widget's own as they appear", () => {
    const cats = categorize([
      def("tempWarn", "Thresholds"),
      std("customCss"),
      def("showFans", "Fans"),
      std("label"),
      def("tempCrit", "Thresholds"),
      std("preset"),
      std("smoothing"),
    ]);
    expect(cats.map((c) => [c.title, c.defs.map((d) => d.key)])).toEqual([
      ["Header", ["label"]],
      ["Colors", ["preset"]],
      ["Custom CSS", ["customCss"]],
      ["Thresholds", ["tempWarn", "tempCrit"]],
      ["Motion", ["smoothing"]],
      ["Fans", ["showFans"]],
    ]);
    expect(cats.map((c) => c.general)).toEqual([true, true, true, true, true, false]);
  });

  it("files a group of color pickers, and rows of the Style tab, as Widget colors in schema order", () => {
    const cats = categorize([color("cpuColor", "Device colors"), { ...def("unified", "Device colors"), tab: "style" }, color("gpuColor", "Device colors"), color("dot", "Meter"), def("hold", "Meter")]);
    expect(cats.map((c) => [c.id, c.defs.map((d) => d.key)])).toEqual([
      ["palette", ["cpuColor", "unified", "gpuColor"]],
      ["module:meter", ["dot", "hold"]],
    ]);
  });

  it("files unfiled settings last under Other", () => {
    const cats = categorize([def("x"), def("y", "Own"), std("label")]);
    expect(cats.map((c) => c.title)).toEqual(["Header", "Own", OTHER_TITLE]);
  });

});

describe("every widget's settings", () => {
  it("each setting of every widget is in a known category", () => {
    for (const [id, defs] of sheets) {
      const cats = categorize(defs);
      expect(cats.some((c) => c.title === OTHER_TITLE), id).toBe(false);
      // Nothing lost or duplicated.
      const filed = cats.flatMap((c) => c.defs.flatMap(settingKeys));
      expect(filed.sort(), id).toEqual(defs.flatMap(settingKeys).sort());
      // Own categories never reuse a shared title (a widget's "Thresholds" group is the shared one).
      for (const c of cats.filter((c) => !c.general)) expect(SHARED_TITLES.has(c.title), `${id} ${c.title}`).toBe(false);
      // The look sections hold only standard keys; no standard key lands in a widget's own section.
      for (const c of cats.filter((c) => STANDARD_ONLY.has(c.id))) for (const d of c.defs) expect(STANDARD_KEYS.has(d.key), `${id} ${d.key}`).toBe(true);
      for (const c of cats.filter((c) => !c.general)) for (const d of c.defs) expect(STANDARD_KEYS.has(d.key), `${id} ${d.key}`).toBe(false);
    }
  });
});

describe("filterCategories", () => {
  const cats = categorize([
    { ...std("glow"), label: "Edge glow" },
    { ...std("borderWidth"), label: "Border width" },
    def("tempWarn", "Overheat", "Warning at"),
    def("tempCrit", "Overheat", "Critical at"),
  ]);

  it("keeps everything for a blank query", () => {
    expect(filterCategories(cats, "  ")).toBe(cats);
  });

  it("returns matching rows in their categories", () => {
    const hit = filterCategories(cats, "glow");
    expect(hit.map((c) => [c.title, c.defs.map((d) => d.key)])).toEqual([["Border & glow", ["glow"]]]);
  });

  it("returns a whole category when only its title matches", () => {
    const hit = filterCategories(cats, "overheat");
    expect(hit.map((c) => [c.title, c.defs.length])).toEqual([["Overheat", 2]]);
  });

  it("prefers row matches over a title match", () => {
    const hit = filterCategories(cats, "border");
    expect(hit.flatMap((c) => c.defs.map((d) => d.key))).toEqual(["borderWidth"]);
  });

  it("finds nothing for an unknown query", () => {
    expect(filterCategories(cats, "zzz")).toEqual([]);
  });
});

describe("withShared", () => {
  const cats = categorize([std("customCss"), def("tempWarn", "Overheat")]);

  it("adds the named shared sections at their canonical place", () => {
    const out = withShared(cats, ["header", "border"]);
    expect(out.map((c) => c.title)).toEqual(["Header", "Border & glow", "Custom CSS", "Overheat"]);
    expect(out[0].defs).toEqual([]);
  });

  it("keeps existing ones", () => {
    expect(withShared(cats, ["css"])).toEqual(cats);
  });
});

describe("tabs", () => {
  const own = categorize([def("x", "Own")])[0];

  it("files each shared section in its tab and a widget's own in Show", () => {
    const tabs = Object.fromEntries(categorize(STANDARD_SETTINGS).map((c) => [c.title, categoryTab(c)]));
    expect(tabs).toEqual({
      Header: "show",
      Fit: "show",
      "Skin & graphics": "style",
      Colors: "style",
      Surface: "style",
      Typography: "style",
      "Size & spacing": "style",
      "Border & glow": "style",
      "Custom CSS": "style",
      Motion: "behaviour",
    });
    expect(categoryTab(own)).toBe("show");
  });

  it("lets a widget's own setting name Data or Behaviour", () => {
    expect(tabOf({ ...def("x"), tab: "data" }, own)).toBe("data");
    expect(tabOf({ ...def("x"), tab: "behaviour" }, own)).toBe("behaviour");
    expect(tabOf(def("x"), own)).toBe("show");
  });

  it("keeps a shared section's rows in its own tab", () => {
    const thresholds = categorize([{ ...def("warn", "Thresholds"), tab: "data" }])[0];
    expect(tabOf(thresholds.defs[0], thresholds)).toBe("behaviour");
  });
});

describe("data settings", () => {
  const sensor: ModuleSetting = { key: "sensor", label: "Sensor", type: "sensor", default: "", group: "Value" };
  const device: ModuleSetting = { key: "cpu", label: "CPU", type: "select", default: "", optionsFrom: "cpu", group: "Value" };
  const category = categorize([sensor, device, def("title", "Value")])[0];

  it("default to the Data tab, an explicit tab still wins", () => {
    expect(tabOf(sensor, category)).toBe("data");
    expect(tabOf(device, category)).toBe("data");
    expect(tabOf(def("title", "Value"), category)).toBe("show");
    expect(tabOf({ ...sensor, tab: "show" }, category)).toBe("show");
  });
});

describe("withHeaderMode", () => {
  const defs = [std("compact"), std("showTitle"), std("label"), std("icon"), def("own", "Own")];
  const keys = (list: ModuleSetting[]) => list.map((d) => `${d.key}:${d.section ?? "-"}`);

  it("keeps a header widget's rows", () => {
    expect(withHeaderMode(defs, "yes")).toBe(defs);
    expect(withHeaderMode(defs)).toBe(defs);
  });

  it("drops Show title on a title-only widget and keeps Title visible with a hint", () => {
    const out = withHeaderMode(defs, "title-only");
    expect(keys(out)).toEqual(["compact:fit", "label:header", "icon:header", "own:-"]);
    const title = out.find((d) => d.key === "label")!;
    expect(title.hint).toBe(TITLE_ONLY_HINT);
    expect(title.visibleIf).toBeUndefined();
  });

  it("moves Title and Icon to the end of Fit on a widget without a header that has a summary view", () => {
    expect(keys(withHeaderMode(defs, "none", { card: true, dense: "fallback" }))).toEqual(["compact:fit", "own:-", "label:fit", "icon:fit"]);
    expect(keys(withHeaderMode(defs, "none", { card: false, dense: true }))).toEqual(["compact:fit", "own:-", "label:fit", "icon:fit"]);
  });

  it("drops them when there is no summary view to name", () => {
    expect(keys(withHeaderMode(defs, "none", { card: false, dense: false }))).toEqual(["compact:fit", "own:-"]);
    expect(keys(withHeaderMode(defs, "none"))).toEqual(["compact:fit", "own:-"]);
  });
});

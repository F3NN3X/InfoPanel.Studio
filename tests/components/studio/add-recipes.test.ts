import { describe, expect, it } from "vitest";
import { addCatalog, widgetRows } from "@/components/studio/add-catalog";
import { codeRailWidget, recipeItem, recipeRailWidgets } from "@/components/studio/recipe-item";
import { fixtureRecipe } from "../../widgets/recipe/fixture-files";

// A recipe widget in the Add panel (Phase 5a): one row after the built-in widgets, its presets as further rows (Phase 4 style),
// and every add storing the recipe's version with the placement.
describe("recipes in the Add panel", () => {
  it("come after the built-in widgets", () => {
    const widgets = addCatalog(undefined, {}, undefined, [recipeItem(fixtureRecipe("cpu-card")), recipeItem(fixtureRecipe("weather-places"))]).widget;
    expect(widgets.slice(-2).map((i) => i.id)).toEqual(["recipe:cpu-card", "recipe:weather-places"]);
    expect(addCatalog().widget.some((i) => i.id.startsWith("recipe:"))).toBe(false);
  });

  it("are one row with the default preset's size, the recipe's minimum, and a row per other preset", () => {
    const item = recipeItem(fixtureRecipe("cpu-card"));
    expect(item).toMatchObject({ kind: "widget", name: "CPU card", category: "Hardware", icon: "memory", w: 3, h: 2, mw: 2, mh: 2 });
    expect(item.presets?.map((p) => [p.name, p.w, p.h])).toEqual([["CPU card · Compact", 2, 2], ["CPU card · Ring only", 2, 2], ["CPU card · Cores", 3, 3]]);
    expect(item.tags).toContain("ring only");
  });

  it("store the recipe's version with every add, the preset's options with it", () => {
    const rows = widgetRows([recipeItem(fixtureRecipe("cpu-card"))]);
    expect(rows.map((r) => r.drop)).toEqual([
      { kind: "module", id: "recipe:cpu-card", settings: { recipeVersion: "1.0.0" } },
      { kind: "module", id: "recipe:cpu-card", settings: { recipeVersion: "1.0.0", showClock: false, showHistory: false } },
      { kind: "module", id: "recipe:cpu-card", settings: { recipeVersion: "1.0.0", showValues: false, showHistory: false } },
      { kind: "module", id: "recipe:cpu-card", settings: { recipeVersion: "1.0.0", showHistory: false, showCores: true } },
    ]);
  });
});

// The user's own widgets in a page rail (P6, decision 8): a recipe's rail presets and a code widget's rail offer.
describe("your widgets in the rail", () => {
  it("are a recipe's rail presets, kept out of Add, each storing the recipe's version", () => {
    const r = fixtureRecipe("cpu-card");
    const railed = { ...r, format: 2 as const, presets: r.presets.map((p) => (p.id === r.presets[1].id ? { ...p, size: "rail" as const } : p)) };
    expect(recipeRailWidgets(r)).toEqual([]);
    expect(recipeRailWidgets(railed)).toEqual([{ module: "recipe:cpu-card", name: `CPU card · ${r.presets[1].name}`, settings: { recipeVersion: "1.0.0", ...r.presets[1].settings } }]);
    expect(recipeItem(railed).presets?.map((p) => p.name)).not.toContain(`CPU card · ${r.presets[1].name}`);
  });

  it("are a code widget that offers itself, with its rail settings", () => {
    const def = { name: "Clock", reads: [], defaultSize: [2, 2] as [number, number], render: () => null };
    expect(codeRailWidget("ext:me.clock", def)).toEqual([]);
    expect(codeRailWidget("ext:me.clock", { ...def, rail: { settings: { compact: true } } })).toEqual([{ module: "ext:me.clock", name: "Clock", settings: { compact: true } }]);
    expect(codeRailWidget("ext:me.clock", { ...def, rail: {} })).toEqual([{ module: "ext:me.clock", name: "Clock", settings: {} }]);
  });
});

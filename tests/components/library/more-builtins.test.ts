import { describe, expect, it } from "vitest";
import { defaultConfig } from "@/lib/layout";
import { FONT_CATALOG } from "@/lib/fonts";
import { ISLAND_DEFAULTS, withIsland } from "@/lib/island/config";
import { ISLAND_LOOKS } from "@/lib/island/looks";
import { TEMPLATES } from "@/lib/infopanel/templates/catalog";
import { builtinItems, isBuiltinItem } from "@/lib/my-library/config-items";
import { buildIndex, cardTag, collectionCounts, collectionItems, flagOf, isDraggable } from "@/lib/my-library/model";
import { withIslandLook } from "@/components/library/island-look-actions";

describe("the InfoPanel templates, Island looks and built-in fonts", () => {
  const items = builtinItems({ profileTemplates: TEMPLATES });
  const index = buildIndex(items);

  it("list every catalog entry as a Built-in, never flagged Not used", () => {
    const counts = collectionCounts(index);
    expect(counts.ptemplates).toBe(TEMPLATES.length);
    expect(counts.islands).toBe(ISLAND_LOOKS.length);
    expect(counts.builtinfonts).toBe(FONT_CATALOG.length);
    expect(counts.unused).toBe(0);
    for (const item of items.filter((i) => ["ptemplate", "island", "font"].includes(i.kind))) {
      expect(isBuiltinItem(item)).toBe(true);
      expect(cardTag(item)).toEqual({ text: "Built-in", builtin: true });
      expect(flagOf(item, index)).toBeNull();
    }
  });

  it("keep the built-in fonts out of Fonts, which is the files you added", () => {
    expect(collectionItems("fonts", index)).toEqual([]);
  });

  it("show the InfoPanel templates only once their catalog has loaded", () => {
    expect(builtinItems().some((i) => i.kind === "ptemplate")).toBe(false);
  });

  it("can't be dragged to the canvas, nor can skins and screen templates", () => {
    expect(items.filter((i) => ["ptemplate", "island", "font"].includes(i.kind)).every((i) => !isDraggable(i))).toBe(true);
    expect(isDraggable(items.find((i) => i.kind === "skin")!)).toBe(false);
    expect(isDraggable({ id: "lib_1", kind: "image" })).toBe(true);
    expect(isDraggable({ id: "lib_2", kind: "font" })).toBe(true);
  });
});

describe("applying an Island look", () => {
  const look = ISLAND_LOOKS.find((l) => l.id === "glass")!.look;
  const base = defaultConfig();
  const config = {
    ...base,
    profiles: [
      withIsland(base.profiles[0], { idle: "time-date", rotate: 5, enabled: true }),
      { ...base.profiles[0], id: "other", island: undefined },
    ],
  };

  it("sets the look on one screen, keeps its other settings, and turns the island on", () => {
    const next = withIslandLook(config, look, "other");
    expect(next.profiles[0]).toBe(config.profiles[0]);
    expect(next.profiles[1].island).toMatchObject({ ...look, enabled: true, idle: ISLAND_DEFAULTS.idle });
  });

  it("sets it on every screen, each keeping what it had", () => {
    const next = withIslandLook(config, look, "all");
    expect(next.profiles[0].island).toMatchObject({ ...look, idle: "time-date", rotate: 5, enabled: true });
    expect(next.profiles[1].island?.opacity).toBe(look.opacity);
  });
});

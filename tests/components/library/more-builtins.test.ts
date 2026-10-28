import { describe, expect, it } from "vitest";
import { FONT_CATALOG } from "@/lib/fonts";
import { TEMPLATES } from "@/lib/infopanel/templates/catalog";
import { builtinItems, isBuiltinItem } from "@/lib/my-library/config-items";
import { buildIndex, cardTag, collectionCounts, collectionItems, flagOf, isDraggable } from "@/lib/my-library/model";

describe("the InfoPanel templates and built-in fonts", () => {
  const items = builtinItems({ profileTemplates: TEMPLATES });
  const index = buildIndex(items);

  it("list every catalog entry as a Built-in, never flagged Not used", () => {
    const counts = collectionCounts(index);
    expect(counts.ptemplates).toBe(TEMPLATES.length);
    expect(counts.builtinfonts).toBe(FONT_CATALOG.length);
    expect(counts.unused).toBe(0);
    for (const item of items.filter((i) => ["ptemplate", "font"].includes(i.kind))) {
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

  it("can't be dragged to the canvas, nor can screen templates", () => {
    expect(items.filter((i) => ["ptemplate", "font"].includes(i.kind)).every((i) => !isDraggable(i))).toBe(true);
    expect(isDraggable({ id: "lib_1", kind: "image" })).toBe(true);
    expect(isDraggable({ id: "lib_2", kind: "font" })).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { assetFile } from "@/lib/infopanel/assets/assets.ts";
import { applyElement, badgeOf, shapeNative } from "@/lib/infopanel/elements/apply.ts";
import { backdropLayers, backdropSignature } from "@/lib/infopanel/elements/backdrop.ts";
import { elementSignature, isElementStale, staleElements } from "@/lib/infopanel/elements/bake.ts";
import { newElement } from "@/lib/infopanel/elements/create.ts";
import { normalizeElement, type CardSpec } from "@/lib/infopanel/elements/spec.ts";
import { defaultItem, type DisplayItem } from "@/lib/infopanel/schema.ts";
import { palette, profile } from "./fixture.ts";

const canvas = { width: 800, height: 480 };
const at = (item: DisplayItem, x: number, y: number, w: number, h: number) => ({ ...item, X: x, Y: y, Width: w, Height: h }) as DisplayItem;
const elementOf = (item: DisplayItem) => (item as DisplayItem & { element: CardSpec }).element;

/** A glass card with a blur: an Image (the baked card), as the editor makes it. */
const frosted = (blur = 12) => {
  const card = newElement("card", profile, palette) as DisplayItem & { element: CardSpec };
  return applyElement(at({ ...card, element: { ...card.element, fill: [{ color: "#2AFFFFFF" }], blur } } as unknown as DisplayItem, 100, 100, 200, 120));
};
const glow = () => applyElement(newElement("glow", profile, palette) as DisplayItem);

describe("a blurred card's backdrop", () => {
  it("is a card the export can't draw natively: one Image, badged Approximated, however plain its fill", () => {
    const card = frosted();
    expect(card.kind).toBe("Image");
    expect(badgeOf(card)).toMatchObject({ kind: "approximated" });
    expect(badgeOf(card)!.lost.join(" ")).toMatch(/live values/);
    const plain = elementOf(newElement("card", profile, palette) as DisplayItem);
    expect(shapeNative(plain)).toBe(true);
    expect(shapeNative({ ...plain, blur: 8 })).toBe(false);
  });

  it("holds the background, then each picture drawn before the card in tree order, and nothing after it", () => {
    const wash = at(glow(), 0, 0, 300, 300);
    const rect = { ...at(defaultItem("Shape"), 20, 20, 60, 40), Type: "Rectangle", ShowFill: true, FillColor: "#FF112233", CornerRadius: 6 } as DisplayItem;
    const text = at(defaultItem("Text"), 5, 5, 50, 20);
    const hidden = { ...rect, Hidden: true, X: 1 } as DisplayItem;
    const after = at(glow(), 400, 0, 50, 50);
    const layers = backdropLayers([wash, text, hidden, rect, frosted(), after], "4", "#FF101020", new Map(), canvas);
    expect(layers.map((l) => l.kind)).toEqual(["fill", "svg", "fill"]);
    expect(layers[0]).toMatchObject({ x: 0, y: 0, w: 800, h: 480 });
    expect(layers[2]).toMatchObject({ x: 20, y: 20, w: 60, h: 40, radius: 6 });
  });

  it("includes an image file by its hash, and reaches into a group only up to the card", async () => {
    const file = await assetFile("sky.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 8, 0, 0, 0, 8, 1, 2, 3, 4]), "added");
    const img = { ...at(defaultItem("Image"), 0, 0, 800, 480), FilePath: "sky.png", RelativePath: true } as DisplayItem;
    const group = { ...defaultItem("Group"), DisplayItems: [at(defaultItem("Image"), 0, 0, 10, 10), frosted(), img] } as DisplayItem;
    const layers = backdropLayers([img, group], "1.1", "#FF000000", new Map([["sky.png", file]]), canvas);
    // The sky file comes before the group; the group's first child has no file and the file after the card is above it.
    expect(layers.filter((l) => l.kind === "file")).toEqual([expect.objectContaining({ name: "sky.png", hash: file.hash })]);
    expect(layers).toHaveLength(2);
  });

  it("goes stale when the background, a picture under it or the blur changes, and not otherwise", () => {
    const card = frosted(12);
    const sig = (items: DisplayItem[], bg: string, blur = 12) => backdropSignature(blur, backdropLayers(items, "1", bg, new Map(), canvas));
    const wash = at(glow(), 0, 0, 300, 300);
    const base = sig([wash, card], "#FF000000");
    expect(sig([wash, card], "#FF000000")).toBe(base);
    expect(sig([wash, card], "#FF222222")).not.toBe(base);
    expect(sig([at(wash, 10, 0, 300, 300), card], "#FF000000")).not.toBe(base);
    expect(sig([wash, card], "#FF000000", 20)).not.toBe(base);

    // Baked at one backdrop, the card is fresh for it and stale for another.
    const baked = { ...card, FilePath: "c.png", elementBaked: elementSignature(elementOf(card), 200, 120, base) } as unknown as DisplayItem;
    expect(isElementStale(baked, base)).toBe(false);
    expect(isElementStale(baked, sig([wash, card], "#FF222222"))).toBe(true);
    expect(staleElements([wash, baked], "", (path) => (path === "1" ? base : undefined))).toEqual(["0"]);
  });

  it("keeps blur on the spec only while it is a real radius", () => {
    const card = elementOf(newElement("card", profile, palette) as DisplayItem);
    expect(normalizeElement({ ...card, blur: 400 })).toMatchObject({ blur: 64 });
    expect(normalizeElement({ ...card, blur: 0 })).not.toHaveProperty("blur");
    expect(normalizeElement({ ...card, blur: "wide" })).not.toHaveProperty("blur");
  });
});

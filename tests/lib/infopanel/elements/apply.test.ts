import { describe, expect, it } from "vitest";
import { applyElement, approximations, badgeOf, elementOf, recolour, syncElements } from "@/lib/infopanel/elements/apply.ts";
import { isElementStale } from "@/lib/infopanel/elements/bake.ts";
import { newComposite, newElement } from "@/lib/infopanel/elements/create.ts";
import type { CardSpec, DividerSpec, ElementSpec } from "@/lib/infopanel/elements/spec.ts";
import { bakeSignature, isStale } from "@/lib/infopanel/gauges/frames.ts";
import { newItem } from "@/lib/infopanel/editor/create.ts";
import { moveBy } from "@/lib/infopanel/editor/ops.ts";
import type { DisplayItem, GroupItem } from "@/lib/infopanel/schema.ts";
import { oneOfEach, palette, profile } from "./fixture.ts";

const withSpec = (item: DisplayItem, patch: Partial<ElementSpec>) => applyElement({ ...item, element: { ...elementOf(item)!, ...patch } } as unknown as DisplayItem);
const lab = (item: DisplayItem) => item as DisplayItem & { vector?: { width: number; height: number; segments: number; dot?: unknown; fill: { mode: string } } };

describe("each element as InfoPanel items", () => {
  it("maps to its kind and badge", () => {
    const got = oneOfEach().map((item) => [elementOf(item)!.type, item.kind, badgeOf(item)!.kind]);
    expect(got).toEqual([
      ["ring", "Gauge", "baked"],
      ["ledbar", "Gauge", "baked"],
      ["card", "Shape", "native"],
      ["glow", "Image", "baked"],
      ["divider", "Shape", "native"],
      ["icon", "Image", "baked"],
      ["cores", "Group", "native"],
      ["sparkline", "Graph", "approximated"],
    ]);
  });

  it("gives a ring a vector spec at its box's size, with a gradient and an end dot", () => {
    const ring = lab(oneOfEach()[0]);
    expect(ring.vector).toMatchObject({ width: 120, height: 120, fill: { mode: "gradient" }, dot: { size: 19 } });
    const big = lab(applyElement({ ...ring, Width: 200, Height: 160 } as DisplayItem));
    expect(big.vector).toMatchObject({ width: 200, height: 160 });
  });

  it("gives an LED bar a segmented bar", () => {
    expect(lab(oneOfEach()[1]).vector).toMatchObject({ segments: 16, width: 240, height: 16 });
  });
});

describe("Card's native and baked switch", () => {
  const card = newElement("card", profile, palette);
  const spec = elementOf(card) as CardSpec;

  it("is a Shape while it only has a fill, a stroke and corners", () => {
    const stroked = withSpec(card, { stroke: { color: "#FF333333" }, radius: 20 } as Partial<CardSpec>);
    expect(stroked).toMatchObject({
      kind: "Shape", Type: "Rectangle", CornerRadius: 20, ShowFrame: true, FrameThickness: 1, FrameColor: "#FF333333", ShowGradient: false, FillColor: palette.card,
    });
    expect(badgeOf(stroked)!.kind).toBe("native");
  });

  it("becomes one Image grown by the shadow's margin, and back to the same Shape", () => {
    const shadowed = withSpec({ ...card, X: 100, Y: 50 } as DisplayItem, { shadow: { blur: 10, dx: 0, dy: 4, color: { color: "#80000000" } } } as Partial<CardSpec>);
    const pad = (elementOf(shadowed) as CardSpec).pad;
    expect(pad).toBe(19);
    expect(shadowed).toMatchObject({ kind: "Image", X: 100 - pad, Y: 50 - pad, Width: 220 + 2 * pad, Height: 140 + 2 * pad, RelativePath: true, Type: "FILE" });
    expect(badgeOf(shadowed)).toMatchObject({ kind: "baked", reason: expect.stringContaining("shadow") });
    expect(isElementStale(shadowed)).toBe(true);
    const back = withSpec(shadowed, { shadow: null } as Partial<CardSpec>);
    expect(back).toMatchObject({ kind: "Shape", X: 100, Y: 50, Width: 220, Height: 140 });
    expect(back).not.toHaveProperty("elementBaked");
  });

  it("is baked with a gradient fill", () => {
    const g = withSpec(card, { fill: [...spec.fill, { color: "#FF000000" }] } as Partial<CardSpec>);
    expect(g.kind).toBe("Image");
    expect(badgeOf(g)!.reason).toContain("gradient");
  });
});

describe("Divider's native and baked switch", () => {
  const divider = newElement("divider", profile, palette);

  it("is a 1 px Shape when solid, its thickness across its direction", () => {
    expect(divider).toMatchObject({ kind: "Shape", Width: 200, Height: 1, ShowFrame: false, CornerRadius: 0 });
    const vertical = withSpec({ ...divider, Height: 300 } as DisplayItem, { orientation: "vertical", thickness: 2 } as Partial<DividerSpec>);
    expect(vertical).toMatchObject({ kind: "Shape", Width: 2, Height: 300 });
  });

  it("is one Image when it has a gradient", () => {
    const g = withSpec(divider, { fill: [{ color: "#FFFFFFFF" }, { color: "#00FFFFFF" }] } as Partial<DividerSpec>);
    expect(g).toMatchObject({ kind: "Image", Width: 200, Height: 1 });
    expect(badgeOf(g)!.kind).toBe("baked");
  });
});

describe("Cores", () => {
  it("lays its bound bars out from the group's place, and again after a move and a spec edit", () => {
    const cores = oneOfEach()[6] as GroupItem;
    expect(cores.DisplayItems.map((b) => [b.kind, b.X, (b as { LibreSensorId?: string }).LibreSensorId])).toEqual([
      ["Bar", 300, "/intelcpu/0/load/1"],
      ["Bar", 321, "/intelcpu/0/load/2"],
      ["Bar", 342, "/intelcpu/0/load/3"],
      ["Bar", 362, "/intelcpu/0/load/4"],
    ]);
    const moved = syncElements(moveBy([cores], ["0"], 10, 5))[0] as GroupItem;
    expect(moved.DisplayItems[0]).toMatchObject({ X: 310, Y: 305 });
    const tall = withSpec(cores, { orientation: "vertical", height: 80 } as never) as GroupItem;
    expect(tall.DisplayItems.map((b) => b.Y)).toEqual([300, 321, 342, 362]);
    expect(tall.DisplayItems.every((b) => (b as { Width?: number }).Width === 80)).toBe(true);
  });
});

describe("Sparkline", () => {
  it("is InfoPanel's Graph, and lists what the export loses", () => {
    const s = newElement("sparkline", profile, palette);
    expect(s).toMatchObject({ kind: "Graph", Type: "LINE", Fill: true });
    expect(badgeOf(s)!.lost).toEqual(["the end dot", "the gradient fill (InfoPanel fills one colour)"]);
    expect(approximations([s])).toEqual([{ path: "0", name: "Sparkline", lost: badgeOf(s)!.lost }]);
    expect(badgeOf(withSpec(s, { dot: false, gradient: false } as never))!.kind).toBe("native");
  });
});

describe("recolour (a palette slot changed)", () => {
  const next = { ...palette, accent1: "#FFFF0000", card: "#FF222222" };

  it("recolours every element and styled field following the slot, and marks the baked ones stale", () => {
    const items = oneOfEach();
    // The ring as the export left it: frames recorded as of the old palette.
    const ring = { ...items[0], vectorBaked: bakeSignature(lab(items[0]).vector as never, 0) } as unknown as DisplayItem;
    expect(isStale(ring)).toBe(false);
    const [r, , card, glow, , , cores] = recolour([ring, ...items.slice(1)], next);
    expect(isStale(r)).toBe(true);
    expect(card).toMatchObject({ FillColor: "#FF222222" });
    expect(elementOf(glow)).toMatchObject({ color: { color: "#FFFF0000", slot: "accent1" } });
    expect((cores as GroupItem).DisplayItems[0]).toMatchObject({ Color: "#FFFF0000" });
  });

  it("recolours a styled native item, keeping a slot's alpha, and leaves fixed colours", () => {
    const text = { ...newItem("Text", profile, palette), Color: "#FF00FF00", slots: undefined } as unknown as DisplayItem;
    const [graph, fixed] = recolour([newItem("Graph", profile, palette), text], next);
    expect(graph).toMatchObject({ Color: "#FFFF0000", FillColor: "#40FF0000" });
    expect(fixed).toMatchObject({ Color: "#FF00FF00" });
  });

  it("leaves a fixed ink alone", () => {
    const glow = withSpec(newElement("glow", profile, palette), { color: { color: "#FF00FF00" } } as never);
    expect(elementOf(recolour([glow], next)[0])).toMatchObject({ color: { color: "#FF00FF00" } });
  });
});

describe("a ring's face", () => {
  const face = { pattern: "hex", color: "#FFFFFF", opacity: 0.08, size: 14, fill: "#06090D" } as const;

  it("goes into the vector spec the export bakes, and a changed face makes the frames stale", () => {
    const plain = newElement("ring", profile, palette);
    const faced = withSpec(plain, { face } as Partial<ElementSpec>);
    expect(lab(faced).vector).toMatchObject({ face });
    expect(lab(plain).vector).not.toHaveProperty("face");
    expect(bakeSignature(lab(faced).vector as never, 101)).not.toBe(bakeSignature(lab(plain).vector as never, 101));
    expect(badgeOf(faced)).toMatchObject({ kind: "baked" });
  });

  it("is on a Double ring's inner ring only", () => {
    const made = newComposite("doublering", profile, palette, [], 0, 0);
    const g = applyElement({ ...made, element: { ...elementOf(made)!, face } } as unknown as DisplayItem) as GroupItem;
    const [outer, inner] = g.DisplayItems.map((i) => lab(i).vector);
    expect(outer).not.toHaveProperty("face");
    expect(inner).toMatchObject({ face });
  });
});

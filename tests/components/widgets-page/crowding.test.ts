import { describe, expect, it } from "vitest";
import { addBlock, newRecipe, updateBlock } from "@/components/widgets-page/builder-model";
import { crowdIssues, crowding, type Ink } from "@/components/widgets-page/crowding";

// Crowding on the stage (Phase B2, G19, B11): what each block paints, measured on the stage, read as a cut text, a block past the
// card's edge or two blocks overlapping, and said in the problem list by Layers name at the size shown.

const box = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom });
const CARD = box(0, 0, 200, 100);

describe("crowding", () => {
  it("finds nothing where every block paints inside its own room", () => {
    const inks: Ink[] = [
      { path: "0", boxes: [box(0, 0, 90, 40)] },
      { path: "1", boxes: [box(100, 0, 200, 40)] },
    ];
    expect(crowding(inks, CARD)).toEqual([]);
  });

  it("an overlap is named on the later block, with the earlier; a touch or a sliver is not one", () => {
    const inks: Ink[] = [
      { path: "0", boxes: [box(0, 0, 100, 40)] },
      { path: "1", boxes: [box(90, 10, 150, 30)] },
      { path: "2", boxes: [box(150, 0, 200, 40)] },
      { path: "3", boxes: [box(0, 40, 100, 41.5)] },
    ];
    expect(crowding(inks, CARD)).toEqual([{ path: "1", kind: "overlaps", with: "0" }]);
  });

  it("a cut text and a block past the card are findings of their own, once per block however many Repeat items draw it", () => {
    const inks: Ink[] = [
      { path: "0.1", boxes: [box(0, 0, 50, 20)], cut: true },
      { path: "0.1", boxes: [box(0, 50, 50, 70)], cut: true },
      { path: "1", boxes: [box(150, 90, 210, 99)] },
      { path: "10", boxes: [box(150, 80, 199, 103)] },
    ];
    expect(crowding(inks, CARD)).toEqual([
      { path: "0.1", kind: "cut" },
      { path: "1", kind: "past" },
      { path: "10", kind: "past" },
      { path: "10", kind: "overlaps", with: "1" },
    ]);
  });

  it("an item's text running into the next item's is an overlap of the block with itself", () => {
    const inks: Ink[] = [
      { path: "0.0", boxes: [box(0, 0, 50, 30)] },
      { path: "0.0", boxes: [box(0, 25, 50, 55)] },
    ];
    expect(crowding(inks, CARD)).toEqual([{ path: "0.0", kind: "overlaps", with: "0.0" }]);
  });
});

describe("the warnings the problem list shows", () => {
  it("name each block by its Layers name at the size shown, and select it", () => {
    const ring = addBlock(newRecipe("Crowded", new Set()), [], "ring", "libre.cpu_total");
    const values = addBlock(ring.recipe, [], "row", "libre.cpu_total");
    const r = updateBlock(values.recipe, values.path, { name: "Values" });
    expect(
      crowdIssues(r, [2, 2], [
        { path: "1", kind: "overlaps", with: "0" },
        { path: "0", kind: "cut" },
        { path: "1", kind: "past" },
        { path: "1", kind: "overlaps", with: "1" },
      ]),
    ).toEqual([
      { text: "At 2×2, Values overlaps Ring", tab: "block", path: [1], warn: true },
      { text: "At 2×2, Ring is cut", tab: "block", path: [0], warn: true },
      { text: "At 2×2, Values runs past the card", tab: "block", path: [1], warn: true },
      { text: "At 2×2, Values overlaps the next item's", tab: "block", path: [1], warn: true },
    ]);
  });
});

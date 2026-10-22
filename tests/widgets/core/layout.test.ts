import { describe, expect, it } from "vitest";
import { boxOf, easeHistory, fitGrid, flipFrameTimes, pickBy, shapeOf, summaryShape, tierOf } from "@/widgets/core/layout";

describe("tierOf", () => {
  it("splits at 220×140, 340×210 and 500×320", () => {
    expect(tierOf(219, 400)).toBe("xs");
    expect(tierOf(400, 139)).toBe("xs");
    expect(tierOf(220, 140)).toBe("sm");
    expect(tierOf(339, 400)).toBe("sm");
    expect(tierOf(600, 209)).toBe("sm");
    expect(tierOf(340, 210)).toBe("md");
    expect(tierOf(499, 600)).toBe("md");
    expect(tierOf(600, 319)).toBe("md");
    expect(tierOf(500, 320)).toBe("lg");
  });
});

describe("shapeOf", () => {
  it("detects strips (ratio ≥ 2.6 and under 160 tall: one row of a square grid)", () => {
    expect(shapeOf(260, 100)).toBe("strip");
    expect(shapeOf(259, 100)).toBe("box");
    expect(shapeOf(624, 150)).toBe("strip"); // 4x1 at cell 150
    expect(shapeOf(780, 160)).toBe("box");
    // 4x4 on a 1920×550 profile of 12×12 cells (~156×42 each): wide but four rows tall, not a strip
    expect(shapeOf(635, 178)).toBe("box");
  });
  it("detects tiles under 240×240", () => {
    expect(shapeOf(239, 239)).toBe("tile");
    expect(shapeOf(240, 239)).toBe("box");
  });
});

describe("summaryShape", () => {
  it("auto shows the summary card in tile, strip and column zones only", () => {
    expect(summaryShape("auto", "tile", 110, 110)).toBe("tile");
    expect(summaryShape(undefined, "strip", 400, 110)).toBe("strip");
    expect(summaryShape("auto", "column", 110, 300)).toBe("column");
    expect(summaryShape("auto", "box", 400, 300)).toBeNull();
  });

});

describe("boxOf", () => {
  it("measures the tier and shape on the zoomed size", () => {
    expect(boxOf(600, 400, "auto")).toMatchObject({ size: "lg", shape: "box" });
    expect(boxOf(600, 400, "auto", 2)).toMatchObject({ w: 300, h: 200, size: "sm", shape: "box" });
    expect(boxOf(200, 200, undefined, 0.5)).toMatchObject({ w: 400, h: 400, size: "md" });
  });
});

describe("pickBy", () => {
  it("picks the tier's entry, md otherwise", () => {
    expect(pickBy("xs", { xs: 1, md: 2 })).toBe(1);
    expect(pickBy("lg", { xs: 1, md: 2 })).toBe(2);
  });
});

describe("flipFrameTimes", () => {
  it("puts quick frames high and slow ones low, clamping past the top", () => {
    expect(flipFrameTimes([5, 33, 50], 40)).toEqual([35, 7, 0]);
  });
});

describe("easeHistory", () => {
  it("eases toward each new value", () => {
    expect(easeHistory([0, 0], 100, 48, 0.5)).toEqual([0, 0, 50]);
    expect(easeHistory([0, 0], 100, 48, 1)).toEqual([0, 0, 100]);
  });
  it("ignores non-finite values", () => {
    const h = [1, 2];
    expect(easeHistory(h, NaN)).toBe(h);
  });
});

describe("fitGrid", () => {
  it.each([
    ["three in a wide box: one row", 3, 600, 200, { cols: 3, rows: 1 }],
    ["four in a square: 2×2", 4, 400, 400, { cols: 2, rows: 2 }],
    ["five at 720×640: 3 + 2", 5, 720, 640, { cols: 3, rows: 2 }],
    ["one: 1×1", 1, 300, 200, { cols: 1, rows: 1 }],
    ["tall box stacks them", 3, 100, 600, { cols: 1, rows: 3 }],
  ])("%s", (_name, n, w, h, want) => {
    expect(fitGrid(n, w, h)).toMatchObject(want);
  });
  it("sizes the cell by the tighter side, minus the gaps", () => {
    expect(fitGrid(4, 420, 420, { gap: 20 }).cell).toBe(200);
    expect(fitGrid(1, 300, 100, { aspect: 2 }).cell).toBe(200);
  });
  it("has no grid for no items", () => {
    expect(fitGrid(0, 400, 400)).toEqual({ cols: 0, rows: 0, cell: 0 });
  });
});

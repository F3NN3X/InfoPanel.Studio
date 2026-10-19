import { describe, expect, it } from "vitest";
import {
  canRemove, clampSel, duplicateEdit, isSelected, moveEdit, removeEdit, reordered, replaceAt, resampleEdit, reverseEdit, selectedIndexes, selectFrame, selectOne,
} from "./frame-select";

const sel = (anchor: number, focus = anchor) => ({ anchor, focus });
const frames = (n: number) => Array.from({ length: n }, (_, i) => `f${i}`);

describe("selection", () => {
  it("a click selects one frame, a shift-click extends from the anchor either way", () => {
    expect(selectFrame(sel(2), 5, false)).toEqual(sel(5));
    expect(selectFrame(sel(2), 5, true)).toEqual(sel(2, 5));
    expect(selectedIndexes(selectFrame(sel(4), 1, true), 8)).toEqual([1, 2, 3, 4]);
    expect(selectOne(3)).toEqual(sel(3));
  });

  it("lists the range inside the frame count, and nothing for no frames", () => {
    expect(selectedIndexes(sel(2, 9), 5)).toEqual([2, 3, 4]);
    expect(selectedIndexes(sel(7), 3)).toEqual([2]);
    expect(selectedIndexes(sel(0), 0)).toEqual([]);
    expect(clampSel(sel(-3, 40), 10)).toEqual(sel(0, 9));
    expect([isSelected(sel(4, 2), 1), isSelected(sel(4, 2), 3), isSelected(sel(4, 2), 5)]).toEqual([false, true, false]);
  });
});

describe("tools on the selection", () => {
  it("reverses every frame for one selected, the range for several", () => {
    expect(reverseEdit(5, sel(2)).order).toEqual([4, 3, 2, 1, 0]);
    const range = reverseEdit(6, sel(1, 3));
    expect(range.order).toEqual([0, 3, 2, 1, 4, 5]);
    expect(range.sel).toEqual(sel(1, 3));
  });

  it("resamples every frame to a count, the first and last kept", () => {
    expect(resampleEdit(5, sel(0), 3).order).toEqual([0, 2, 4]);
    expect(resampleEdit(3, sel(1), 5).order).toEqual([0, 1, 1, 2, 2]);
  });

  it("resamples just the selected range, leaving the rest, and selects the result", () => {
    const e = resampleEdit(8, sel(2, 5), 2);
    expect(e.order).toEqual([0, 1, 2, 5, 6, 7]);
    expect(e.sel).toEqual(sel(2, 3));
    expect(resampleEdit(4, sel(1, 2), 0).order).toEqual([0, 3]);
  });

  it("repeats each selected frame once after itself and grows the selection", () => {
    const one = duplicateEdit(4, sel(1));
    expect(one.order).toEqual([0, 1, 1, 2, 3]);
    expect(one.sel).toEqual(sel(1, 2));
    const range = duplicateEdit(5, sel(1, 2));
    expect(range.order).toEqual([0, 1, 1, 2, 2, 3, 4]);
    expect(range.sel).toEqual(sel(1, 4));
    expect(reordered(frames(5), range.order)).toEqual(["f0", "f1", "f1", "f2", "f2", "f3", "f4"]);
    expect(duplicateEdit(0, sel(0)).order).toEqual([]);
  });

  it("removes the selected frames and selects the one that took their place", () => {
    const e = removeEdit(6, sel(2, 3));
    expect(e.order).toEqual([0, 1, 4, 5]);
    expect(e.sel).toEqual(sel(2));
    expect(removeEdit(4, sel(3)).sel).toEqual(sel(2));
    expect(removeEdit(6, sel(4, 1)).order).toEqual([0, 5]);
  });

  it("never removes the last frame", () => {
    expect(canRemove(1, sel(0))).toBe(false);
    expect(canRemove(3, sel(0, 2))).toBe(false);
    expect(canRemove(3, sel(0, 1))).toBe(true);
    expect(removeEdit(3, sel(0, 2)).order).toEqual([0, 1, 2]);
  });
});

describe("applying an order and replacing frames", () => {
  it("builds the frame list in the new order, dropping indexes that are not frames", () => {
    expect(reordered(frames(3), [2, 0, 9, 1])).toEqual(["f2", "f0", "f1"]);
  });

  it("puts picked files into the selected positions in order, ignoring extra files", () => {
    expect(replaceAt(frames(5), [1, 2, 3], ["a", "b"])).toEqual(["f0", "a", "b", "f3", "f4"]);
    expect(replaceAt(frames(3), [1], ["a", "b", "c"])).toEqual(["f0", "a", "f2"]);
  });
});

describe("moveEdit", () => {
  it("moves the selected range past its neighbour and takes the selection along", () => {
    expect(moveEdit(5, sel(1, 2), 1)).toEqual({ order: [0, 3, 1, 2, 4], sel: sel(2, 3) });
    expect(moveEdit(5, sel(2, 1), -1)).toEqual({ order: [1, 2, 0, 3, 4], sel: sel(1, 0) });
  });

  it("does nothing at either end", () => {
    expect(moveEdit(3, sel(0), -1)).toBeNull();
    expect(moveEdit(3, sel(1, 2), 1)).toBeNull();
    expect(moveEdit(0, sel(0), 1)).toBeNull();
  });
});

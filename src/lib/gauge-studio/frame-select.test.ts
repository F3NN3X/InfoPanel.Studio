import { describe, expect, it } from "vitest";
import { canRemove, removeEdit } from "./frame-select";

const sel = (anchor: number, focus = anchor) => ({ anchor, focus });

describe("tools on the selection", () => {
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

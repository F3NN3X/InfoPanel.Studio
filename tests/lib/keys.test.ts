import { describe, expect, it } from "vitest";
import { allKeys, keyGrid, keyMark, keyMore, keyTap, normalizeKeys, type KeySlot } from "@/lib/keys";

// The Keys widget's keys (pinned layer P7): how a level is laid out, what a key's marks and name say, and what a load keeps.

const RUN = { op: "run", command: "calc.exe" } as const;

describe("the keys", () => {
  it("lay out about square in the widget's shape, as few rows as fit them, or in the columns asked for", () => {
    // the fixture's grids: 12 keys in a 3:1 box are 6 x 2, 16 in 4:1 are 8 x 2, 3 in 3:1 one row
    expect(keyGrid(12, 900, 300)).toEqual({ cols: 6, rows: 2 });
    expect(keyGrid(16, 1200, 300)).toEqual({ cols: 8, rows: 2 });
    expect(keyGrid(3, 300, 100)).toEqual({ cols: 3, rows: 1 });
    expect(keyGrid(6, 200, 600)).toEqual({ cols: 2, rows: 3 });
    expect(keyGrid(7, 900, 300, 4)).toEqual({ cols: 4, rows: 2 });
    // never more columns than keys, never zero
    expect(keyGrid(2, 900, 100, 6)).toEqual({ cols: 2, rows: 1 });
    expect(keyGrid(0, 0, 0)).toEqual({ cols: 1, rows: 1 });
  });

  it("mark a hold with one dot and a double tap with two, and say so with a folder to a screen reader", () => {
    const k = (touch?: KeySlot["touch"], keys?: KeySlot[]): KeySlot => ({ id: "k", name: "K", ...(touch ? { touch } : {}), ...(keys ? { keys } : {}) });
    expect(keyMark(k())).toBeUndefined();
    expect(keyMark(k({ hold: RUN }))).toBe("hold");
    expect(keyMark(k({ doubleTap: RUN }))).toBe("double");
    expect(keyMark(k({ hold: RUN, doubleTap: RUN }))).toBe("double");
    expect(keyMore(k({ hold: RUN, doubleTap: RUN }, []))).toBe("opens a folder, hold for more, double tap for more");
    expect(keyMore(k())).toBe("");
    // a folder's tap opens it, whatever its map says
    expect(keyTap(k({ tap: RUN }, []))).toBe("folder");
    expect(keyTap(k({ tap: RUN }))).toEqual(RUN);
    expect(allKeys([k(undefined, [{ id: "in", name: "In" }])]).map((x) => x.id)).toEqual(["k", "in"]);
  });

  it("keep at most 48 on a level and drop a page action whose page is gone, when the pages are known", () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: `k${i}`, name: `K${i}` }));
    expect(normalizeKeys(many)).toHaveLength(48);
    expect(normalizeKeys([{ id: "a", name: "A", touch: { tap: { op: "page", to: "gone" } } }], new Set(["main"]))).toEqual([{ id: "a", name: "A" }]);
  });
});

import { describe, expect, it } from "vitest";
import { DEFAULT_GAUGE, type VectorGauge } from "@/lib/infopanel/gauges/vector";
import { canRedo, canUndo, editCopy, isDirty, markSaved, openCopy, redoCopy, renameCopy, undoCopy } from "./working-copy";

const g = (thickness: number): VectorGauge => ({ ...DEFAULT_GAUGE, thickness });
const origin = { kind: "library", itemId: "a" } as const;

describe("working copy", () => {
  it("undoes and redoes edits, a new edit clearing redo", () => {
    let wc = openCopy("Ring", g(1), origin);
    wc = editCopy(wc, g(2), undefined, 0);
    wc = editCopy(wc, g(3), undefined, 1000);
    expect([canUndo(wc), canRedo(wc)]).toEqual([true, false]);
    wc = undoCopy(wc);
    expect(wc.gauge.thickness).toBe(2);
    wc = undoCopy(wc);
    expect(wc.gauge.thickness).toBe(1);
    expect(undoCopy(wc)).toBe(wc);
    wc = redoCopy(wc);
    expect(wc.gauge.thickness).toBe(2);
    wc = editCopy(wc, g(9), undefined, 5000);
    expect(canRedo(wc)).toBe(false);
    expect(redoCopy(wc)).toBe(wc);
  });

  it("makes a slider drag (one key, close together) one step, and ignores an unchanged spec", () => {
    let wc = openCopy("Ring", g(1), origin);
    for (let i = 2; i <= 6; i++) wc = editCopy(wc, g(i), "thickness", i * 50);
    expect(wc.history.past).toHaveLength(1);
    expect(undoCopy(wc).gauge.thickness).toBe(1);
    expect(editCopy(wc, wc.gauge)).toBe(wc);
    wc = editCopy(wc, g(20), "thickness", 5000);
    expect(wc.history.past).toHaveLength(2);
  });

  it("is dirty when never saved, after an edit or rename, and clean again when undone or saved", () => {
    expect(isDirty(openCopy("Ring copy", g(1)))).toBe(true);
    const clean = openCopy("Ring", g(1), origin);
    expect(isDirty(clean)).toBe(false);
    const edited = editCopy(clean, g(2), undefined, 0);
    expect(isDirty(edited)).toBe(true);
    expect(isDirty(undoCopy(edited))).toBe(false);
    expect(isDirty(editCopy(edited, g(1), undefined, 9000))).toBe(false);
    expect(isDirty(renameCopy(clean, "Other"))).toBe(true);
    expect(renameCopy(clean, "Ring")).toBe(clean);
    const saved = markSaved(openCopy("New", g(1)), origin);
    expect(saved.origin).toEqual(origin);
    expect(isDirty(saved)).toBe(false);
    expect(isDirty(editCopy(saved, g(4), undefined, 0))).toBe(true);
  });
});

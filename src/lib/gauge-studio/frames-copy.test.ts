import { describe, expect, it } from "vitest";
import { DEFAULT_GAUGE } from "@/lib/infopanel/gauges/vector";
import {
  canRedoFrames, canUndoFrames, editFrames, framesData, isFramesDirty, markFramesSaved, openFramesCopy, redoFrames, renameFrames, undoFrames,
  withFrames, withOrder, withSpeed, withVectorSpec,
} from "./frames-copy";
import type { LibraryFrame } from "./model";

const frame = (n: number): LibraryFrame => ({ id: `${String(n).repeat(64)}.png`, name: `f${n}.png` });
const origin = { kind: "library", itemId: "a" } as const;
const open = () => openFramesCopy("Sprites", origin, [frame(1), frame(2), frame(3)], 5);

describe("library frames working copy", () => {
  it("opens clean, at the item's frames and frame rate", () => {
    const fc = open();
    expect(fc.state).toEqual({ frames: [frame(1), frame(2), frame(3)], animationSpeed: 5, vector: null });
    expect(isFramesDirty(fc)).toBe(false);
    expect([canUndoFrames(fc), canRedoFrames(fc)]).toEqual([false, false]);
  });

  it("applies an order to the frames and records each tool as one undo step", () => {
    let fc = open();
    fc = editFrames(fc, withOrder(fc.state, [2, 1, 0]), undefined, 0);
    expect(fc.state.frames.map((f) => f.name)).toEqual(["f3.png", "f2.png", "f1.png"]);
    fc = editFrames(fc, withFrames(fc.state, [frame(9)]), undefined, 1000);
    expect(fc.history.past).toHaveLength(2);
    fc = undoFrames(fc);
    expect(fc.state.frames).toHaveLength(3);
    fc = undoFrames(fc);
    expect(fc.state.frames[0]).toEqual(frame(1));
    expect(undoFrames(fc)).toBe(fc);
    expect(redoFrames(fc).state.frames[0]).toEqual(frame(3));
  });

  it("makes a frame-rate drag one step and ignores an unchanged state", () => {
    let fc = open();
    for (let i = 6; i <= 12; i++) fc = editFrames(fc, withSpeed(fc.state, i), "speed", i * 40);
    expect(fc.history.past).toHaveLength(1);
    expect(undoFrames(fc).state.animationSpeed).toBe(5);
    expect(editFrames(fc, fc.state)).toBe(fc);
    expect(withSpeed(fc.state, fc.state.animationSpeed)).toBe(fc.state);
  });

  it("is dirty after an edit or rename, clean again when undone or saved", () => {
    const clean = open();
    const edited = editFrames(clean, withOrder(clean.state, [1, 0, 2]), undefined, 0);
    expect(isFramesDirty(edited)).toBe(true);
    expect(isFramesDirty(undoFrames(edited))).toBe(false);
    expect(isFramesDirty(editFrames(edited, withOrder(edited.state, [1, 0, 2]), undefined, 9000))).toBe(false);
    expect(isFramesDirty(renameFrames(clean, "Other"))).toBe(true);
    expect(renameFrames(clean, "Sprites")).toBe(clean);
    expect(isFramesDirty(markFramesSaved(edited))).toBe(false);
  });

  it("marking it saved as another item moves its origin there", () => {
    const fc = markFramesSaved(open(), { kind: "library", itemId: "b" });
    expect(fc.origin.itemId).toBe("b");
    expect(markFramesSaved(open()).origin.itemId).toBe("a");
  });

  it("converts to a vector spec in one step that undo takes back", () => {
    const fc = editFrames(open(), withVectorSpec(open().state, DEFAULT_GAUGE), undefined, 0);
    expect(fc.state.vector).toBe(DEFAULT_GAUGE);
    expect(fc.state.frames).toHaveLength(3);
    expect(undoFrames(fc).state.vector).toBeNull();
  });
});

describe("what saving stores", () => {
  it("is the frames and frame rate, the item's range and source kept", () => {
    const fc = editFrames(open(), withSpeed(open().state, 0), undefined, 0);
    const prev = { frames: [frame(7)], min: 10, max: 90, animationSpeed: 5, source: "Rig" };
    expect(framesData(fc, prev)).toEqual({ frames: [frame(1), frame(2), frame(3)], min: 10, max: 90, animationSpeed: 0, source: "Rig" });
  });

  it("adds the spec once converted, and its scale sets the range", () => {
    const scaled = { ...DEFAULT_GAUGE, scale: { min: 5, max: 50, unit: "", decimals: 0 } };
    const fc = editFrames(open(), withVectorSpec(open().state, scaled), undefined, 0);
    expect(framesData(fc, { min: 10, max: 90, animationSpeed: 5 })).toMatchObject({ vector: scaled, min: 5, max: 50, animationSpeed: 5 });
    expect(framesData(fc).frames).toHaveLength(3);
  });
});

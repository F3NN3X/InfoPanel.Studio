// The canvas editor's arrows (Edit v3 SPEC §14): on a page with a grid (an imported profile) they go by cells and Alt
// nudges by the pixel; a free area keeps its 1 px / 10 px nudges.
import { describe, expect, it } from "vitest";
import { canvasKeyAction } from "@/components/infopanel/edit/canvas-keys";
import type { KeyInput } from "@/components/studio/use-studio-shortcuts";

const key = (k: string, mods: Partial<KeyInput> = {}): KeyInput => ({ key: k, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...mods });
const GRID = { typing: false, overlay: false, grid: true };
const AREA = { typing: false, overlay: false };

describe("canvas keys", () => {
  it("on a grid: Arrows move a cell, Shift+Arrows resize a cell, Alt+Arrows nudge 1 px and Alt+Shift 10 px", () => {
    expect(canvasKeyAction(key("ArrowRight"), GRID)).toEqual({ type: "nudge-cell", dx: 1, dy: 0 });
    expect(canvasKeyAction(key("ArrowDown", { shiftKey: true }), GRID)).toEqual({ type: "resize-cell", dx: 0, dy: 1 });
    expect(canvasKeyAction(key("ArrowLeft", { altKey: true }), GRID)).toEqual({ type: "nudge", dx: -1, dy: 0 });
    expect(canvasKeyAction(key("ArrowUp", { altKey: true, shiftKey: true }), GRID)).toEqual({ type: "nudge", dx: 0, dy: -10 });
  });

  it("in a free area: Arrows nudge 1 px, Shift+Arrows 10 px, as before", () => {
    expect(canvasKeyAction(key("ArrowRight"), AREA)).toEqual({ type: "nudge", dx: 1, dy: 0 });
    expect(canvasKeyAction(key("ArrowRight", { shiftKey: true }), AREA)).toEqual({ type: "nudge", dx: 10, dy: 0 });
  });

  it("Ctrl+] brings forward and Ctrl+[ sends backward; nothing while typing", () => {
    expect(canvasKeyAction(key("]", { ctrlKey: true, code: "BracketRight" }), GRID)).toEqual({ type: "forward" });
    expect(canvasKeyAction(key("[", { ctrlKey: true, code: "BracketLeft" }), GRID)).toEqual({ type: "backward" });
    expect(canvasKeyAction(key("ArrowRight"), { ...GRID, typing: true })).toBeNull();
  });
});

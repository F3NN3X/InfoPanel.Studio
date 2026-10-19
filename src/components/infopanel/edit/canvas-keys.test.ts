import { describe, expect, it } from "vitest";
import { canvasKeyAction } from "./canvas-keys";

const key = (k: string, mods: Partial<{ ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean }> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});
const free = { typing: false, overlay: false };

describe("canvasKeyAction", () => {
  it("maps the editor's keys", () => {
    expect(canvasKeyAction(key("d", { ctrlKey: true }), free)).toEqual({ type: "duplicate" });
    expect(canvasKeyAction(key("g", { ctrlKey: true }), free)).toEqual({ type: "group" });
    expect(canvasKeyAction(key("G", { ctrlKey: true, shiftKey: true }), free)).toEqual({ type: "ungroup" });
    expect(canvasKeyAction(key("Delete"), free)).toEqual({ type: "remove" });
    expect(canvasKeyAction(key("Backspace"), free)).toEqual({ type: "remove" });
    expect(canvasKeyAction(key("Escape"), free)).toEqual({ type: "escape" });
  });

  it("nudges 1 px, 10 px with Shift", () => {
    expect(canvasKeyAction(key("ArrowLeft"), free)).toEqual({ type: "nudge", dx: -1, dy: 0 });
    expect(canvasKeyAction(key("ArrowDown", { shiftKey: true }), free)).toEqual({ type: "nudge", dx: 0, dy: 10 });
  });

  it("never fires while typing or with a dialog or menu open", () => {
    expect(canvasKeyAction(key("Delete"), { typing: true, overlay: false })).toBeNull();
    expect(canvasKeyAction(key("d", { ctrlKey: true }), { typing: false, overlay: true })).toBeNull();
  });

  it("lets undo, redo and save through to the studio and holds back its zone shortcuts", () => {
    expect(canvasKeyAction(key("z", { ctrlKey: true }), free)).toBeNull();
    expect(canvasKeyAction(key("z", { ctrlKey: true, shiftKey: true }), free)).toBeNull();
    expect(canvasKeyAction(key("s", { ctrlKey: true }), free)).toBeNull();
    expect(canvasKeyAction(key("a", { ctrlKey: true }), free)).toEqual({ type: "block" });
  });

  it("leaves plain typing keys alone", () => {
    expect(canvasKeyAction(key("x"), free)).toBeNull();
  });
});

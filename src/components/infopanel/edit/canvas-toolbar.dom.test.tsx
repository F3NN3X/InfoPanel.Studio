// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasToolbar } from "./canvas-toolbar";
import type { CanvasEditor } from "./use-canvas-editor";

// happy-dom lays nothing out: the toolbar's room and the width its groups need are set by hand.
let room = 0;
let content = 0;
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => room);
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(() => Math.max(room, content));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function setup(width: number) {
  room = width;
  content = 1000;
  const editor = {
    selection: [],
    committed: [],
    modes: new Map(),
    groups: [],
    sensorMode: "unbound",
    setSensorMode: vi.fn(),
  } as unknown as CanvasEditor;
  const onCompare = vi.fn();
  const history = { canUndo: false, canRedo: false, undo: vi.fn(), redo: vi.fn() };
  render(
    <CanvasToolbar editor={editor} history={history} showModes={false} onShowModes={vi.fn()} compare={false} onCompare={onCompare} remapCount={0} onRemap={vi.fn()} apiUnreachable={false} onDone={vi.fn()} />,
  );
  return { editor, onCompare };
}

describe("the canvas toolbar's overflow", () => {
  it("keeps every group inline when it fits", () => {
    setup(1200);
    expect(screen.queryByRole("button", { name: "More" })).toBeNull();
    expect(screen.getByRole("radiogroup", { name: "Sensors" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Compare/ })).toBeTruthy();
  });

  it("moves Sensors and Compare into a More menu when it does not", () => {
    const { editor, onCompare } = setup(800);
    expect(screen.queryByRole("radiogroup", { name: "Sensors" })).toBeNull();
    expect(screen.getByRole("button", { name: "Undo (Ctrl+Z)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Done" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "Compare" }));
    expect(onCompare).toHaveBeenCalledWith(true);
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Sensors" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Mock" }));
    expect(editor.setSensorMode).toHaveBeenCalledWith("mock");
  });

  it("closes the menu on Escape", () => {
    setup(800);
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });
});

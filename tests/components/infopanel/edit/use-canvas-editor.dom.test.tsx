// @vitest-environment happy-dom
// One undo history in Edit (one-editor SPEC §9): the canvas editor commits into the studio's config history, so an
// item edit, a drag (previewed, then committed once) and a grid edit undo and redo as steps of one list.
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { useCanvasEditor } from "@/components/infopanel/edit/use-canvas-editor";
import { withCanvas } from "@/components/studio/import-actions";
import { useConfigHistory } from "@/hooks/use-config-history";
import { newItem } from "@/lib/infopanel/editor/create";
import { moveBy, updateAt } from "@/lib/infopanel/editor/ops";
import { newWidgetItem, widgetOf, withWidget } from "@/lib/infopanel/native/widget-item";
import { readStored, newStored, type StoredCanvas } from "@/lib/infopanel/import/stored";
import { CANVAS_ID, type DashboardConfig, type Placement } from "@/lib/layout";

const canvas = newStored({ name: "Desk", width: 800, height: 480, now: new Date("2026-10-25T00:00:00Z") });
const zone = { id: "z", module: CANVAS_ID, colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true, canvas } as Placement;
const start = {
  profiles: [
    { id: "p1", name: "Desk", width: 800, height: 480, cols: 2, rows: 1, fit: "fill", pages: [{ id: "pg", name: "Page 1", placements: [zone] }] },
    { id: "p2", name: "Main", width: 1920, height: 1080, cols: 12, rows: 8, fit: "fill", pages: [{ id: "pg2", name: "Page 1", placements: [] }] },
  ],
} as unknown as DashboardConfig;

/** The studio's history and the canvas editor on the Free page's zone, as Edit wires them. */
function useEdit() {
  const [config, setConfig] = useState(start);
  const history = useConfigHistory(config, setConfig);
  const placed = config.profiles[0].pages[0].placements[0] as Placement & { canvas: StoredCanvas };
  const editor = useCanvasEditor(placed, history.set, withCanvas);
  return { config, history, editor };
}

const items = (config: DashboardConfig) => readStored(config.profiles[0].pages[0].placements[0].canvas).items;

describe("one undo history for the grid and the canvas", () => {
  it("undoes an item edit and a drag as one step each, and redoes them", () => {
    const { result } = renderHook(useEdit);
    act(() => void result.current.editor.add(newItem("Text", result.current.editor.open.profile)));
    expect(items(result.current.config)).toHaveLength(1);
    const placedAt = items(result.current.config)[0].X;

    // A drag: previews while the pointer moves, then commits once.
    const base = result.current.editor.committed;
    act(() => result.current.editor.preview(moveBy(base, ["0"], 10, 0)));
    act(() => result.current.editor.preview(moveBy(base, ["0"], 40, 20)));
    expect(items(result.current.config)[0].X).toBe(placedAt);
    act(() => result.current.editor.commit(moveBy(base, ["0"], 40, 20)));
    expect(items(result.current.config)[0].X).toBe(placedAt + 40);

    act(() => result.current.history.undo());
    expect(items(result.current.config)[0].X).toBe(placedAt);
    act(() => result.current.history.undo());
    expect(items(result.current.config)).toHaveLength(0);
    expect(result.current.history.canUndo).toBe(false);

    act(() => result.current.history.redo());
    act(() => result.current.history.redo());
    expect(items(result.current.config)[0].X).toBe(placedAt + 40);
  });

  it("interleaves a grid edit with canvas edits in the same list", () => {
    const { result } = renderHook(useEdit);
    act(() => void result.current.editor.add(newItem("Text", result.current.editor.open.profile)));
    act(() => result.current.history.set((c) => ({ ...c, profiles: c.profiles.map((p) => (p.id === "p2" ? { ...p, name: "Wall" } : p)) })));
    act(() => result.current.editor.setField("0", "Name", "CPU"));
    expect(items(result.current.config)[0].Name).toBe("CPU");

    act(() => result.current.history.undo());
    expect(items(result.current.config)[0].Name).not.toBe("CPU");
    expect(result.current.config.profiles[1].name).toBe("Wall");
    act(() => result.current.history.undo());
    expect(result.current.config.profiles[1].name).toBe("Main");
    expect(items(result.current.config)).toHaveLength(1);
    act(() => result.current.history.undo());
    expect(items(result.current.config)).toHaveLength(0);
  });

  it("adds, moves, resizes and edits a Studio widget item as one step each (one-editor SPEC §9)", () => {
    const { result } = renderHook(useEdit);
    const ed = () => result.current.editor;
    act(() => void ed().add(newWidgetItem({ module: "Weather" }, { x: 0, y: 0, w: 300, h: 150 }, "Weather"), { at: { x: 400, y: 240 } }));
    const added = items(result.current.config)[0];
    expect(widgetOf(added)).toEqual({ module: "Weather" });
    expect(added).toMatchObject({ X: 250, Y: 165, Width: 300, Height: 150 });

    act(() => ed().commit(moveBy(ed().committed, ["0"], 10, 0)));
    act(() => ed().setField("0", "Width", 360));
    act(() => ed().commit(updateAt(ed().committed, "0", (it) => withWidget(it, { module: "Weather", settings: { units: "imperial" }, onInfoPanel: "snapshot" }))));
    expect(widgetOf(items(result.current.config)[0])).toEqual({ module: "Weather", settings: { units: "imperial" }, onInfoPanel: "snapshot" });

    act(() => result.current.history.undo());
    expect(widgetOf(items(result.current.config)[0])).toEqual({ module: "Weather" });
    act(() => result.current.history.undo());
    expect((items(result.current.config)[0] as { Width: number }).Width).toBe(300);
    act(() => result.current.history.undo());
    expect(items(result.current.config)[0].X).toBe(250);
    act(() => result.current.history.undo());
    expect(items(result.current.config)).toHaveLength(0);
    act(() => result.current.history.redo());
    expect(widgetOf(items(result.current.config)[0])).toEqual({ module: "Weather" });
  });
});

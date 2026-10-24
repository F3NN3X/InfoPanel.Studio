// @vitest-environment happy-dom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import CanvasEditorView from "@/components/infopanel/edit/canvas-editor";
import { InfoPanelStart } from "@/components/infopanel/edit/infopanel-start";
import { PALETTE_DRAG, paletteEntryOf } from "@/components/infopanel/edit/add-palette";
import { withCanvas } from "@/components/studio/import-actions";
import { readStored, newStored, type StoredCanvas } from "@/lib/infopanel/import/stored";
import { CANVAS_ID, type DashboardConfig, type Placement } from "@/lib/layout";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
});

const zone = { id: "z", module: CANVAS_ID, colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true, canvas: newStored({ name: "Desk", width: 800, height: 480 }) } as Placement & { canvas: StoredCanvas };
const config = { profiles: [{ id: "p1", name: "Main", pages: [{ id: "pg", name: "Page 1", placements: [zone] }] }] } as unknown as DashboardConfig;
const history = { canUndo: false, canRedo: false, undo: vi.fn(), redo: vi.fn() };

describe("the InfoPanel editor page", () => {
  it("renders the palette, layers and the profile's settings, and a palette click adds the item", () => {
    const setConfig = vi.fn();
    render(
      <ToastProvider>
        <CanvasEditorView zone={zone} setConfig={setConfig} history={history} onDone={vi.fn()} profileId="p1" />
      </ToastProvider>,
    );
    const palette = screen.getByRole("region", { name: "Add" });
    // InfoPanel's 14 kinds, then the 8 studio elements.
    expect(within(palette).getAllByRole("button")).toHaveLength(22);
    expect(within(within(palette).getByRole("group", { name: "Elements" })).getAllByRole("button")).toHaveLength(8);
    expect(screen.getByRole("region", { name: "Layers" })).toBeTruthy();
    expect(screen.getByLabelText("Name")).toHaveProperty("value", "Desk");

    fireEvent.click(within(palette).getByRole("button", { name: "Text" }));
    const [update] = setConfig.mock.calls[0];
    const next = update(withCanvas(config, "z", zone.canvas)) as DashboardConfig;
    const items = readStored(next.profiles[0].pages[0].placements[0].canvas).items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ kind: "Text", Name: "Custom Text", Font: "Segoe UI", Color: "#FFFFFFFF" });
  });

  it("a palette entry drags its kind, and shows the hint line under the canvas", () => {
    render(
      <ToastProvider>
        <CanvasEditorView zone={zone} setConfig={vi.fn()} history={history} onDone={vi.fn()} profileId="p1" />
      </ToastProvider>,
    );
    const setData = vi.fn();
    const bar = within(screen.getByRole("region", { name: "Add" })).getByRole("button", { name: "Bar" });
    expect(bar.getAttribute("draggable")).toBe("true");
    fireEvent.dragStart(bar, { dataTransfer: { setData, effectAllowed: "" } });
    expect(setData).toHaveBeenCalledWith(PALETTE_DRAG, "Bar");
    expect(paletteEntryOf("Bar")).toMatchObject({ kind: "item", entry: { kind: "Bar" } });
    expect(paletteEntryOf("element:ring")).toMatchObject({ kind: "element", entry: { type: "ring" } });
    expect(paletteEntryOf("text/plain")).toBeNull();
    expect(screen.getByText(/Hold Alt to stop snapping/)).toBeTruthy();
  });

  it("lists the dashboard's InfoPanel profiles when nothing is open", () => {
    const onOpen = vi.fn();
    render(<InfoPanelStart config={config} onOpen={onOpen} onNew={vi.fn()} onImport={vi.fn()} />);
    fireEvent.click(screen.getByText("Desk"));
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ profileId: "p1", pageId: "pg", zoneId: "z", width: 800, height: 480 }));
  });
});

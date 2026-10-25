// @vitest-environment happy-dom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import CanvasEditorView from "@/components/infopanel/edit/canvas-editor";
import { openCanvas } from "@/lib/infopanel/canvas";
import { storeItems } from "@/lib/infopanel/canvas-edit";
import { newStored, type StoredCanvas } from "@/lib/infopanel/import/stored";
import { defaultItem } from "@/lib/infopanel/schema";
import { CANVAS_ID, type Placement } from "@/lib/layout";

// happy-dom measures every element as 0 x 0: the canvas area is 1000 x 600.
vi.mock("@/hooks/use-element-size", () => ({ useElementSize: () => ({ ref: { current: null }, w: 1000, h: 600 }) }));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
});

const base = newStored({ name: "Desk", width: 800, height: 480 });
const canvas = storeItems(base, openCanvas(base).profile, [{ ...defaultItem("Text"), Name: "Title", X: 120, Y: 80, Width: 120, Height: 30 }]);
const zone = { id: "z", module: CANVAS_ID, colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true, canvas } as Placement & { canvas: StoredCanvas };
const history = { canUndo: false, canRedo: false, undo: vi.fn(), redo: vi.fn() };

describe("the InfoPanel editor canvas", () => {
  it("keeps the mode and kind off the canvas: the inspector names them; the zoom bar opens the profile settings", () => {
    render(
      <ToastProvider>
        <CanvasEditorView zone={zone} setConfig={vi.fn()} history={history} onDone={vi.fn()} profileId="p1" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getAllByRole("treeitem").find((r) => r.textContent?.includes("Title"))!);
    const layer = document.querySelector("[data-canvas-edit-layer]")!;
    expect(layer.textContent).not.toMatch(/Native|InfoPanel/);
    expect(within(screen.getByRole("complementary", { name: "Item" })).getByText(/(Native|InfoPanel) · Text/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Toggle rulers" }));
    fireEvent.click(screen.getByTitle("Profile size, background and fonts"));
    expect(screen.getByLabelText("Name")).toHaveProperty("value", "Desk");
  });
});

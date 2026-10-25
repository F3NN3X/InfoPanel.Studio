// @vitest-environment happy-dom
import { act, createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import CanvasEditorView from "@/components/infopanel/edit/canvas-editor";
import { withCanvas } from "@/components/studio/import-actions";
import { fitScale, openCanvas } from "@/lib/infopanel/canvas";
import { editItems, storeItems } from "@/lib/infopanel/canvas-edit";
import { profilePoint } from "@/lib/infopanel/editor/arrange";
import { saveComponent } from "@/lib/infopanel/component";
import { newStored, readStored, type StoredCanvas } from "@/lib/infopanel/import/stored";
import { defaultItem, type DisplayItem } from "@/lib/infopanel/schema";
import { CANVAS_ID, type DashboardConfig, type Placement } from "@/lib/layout";
import type { LibraryItem } from "@/lib/library";
import { componentItem } from "@/lib/my-library/canvas-link";
import { LIBRARY_MIME, setActiveLibraryDrag } from "@/lib/my-library/drag";

const api = vi.hoisted(() => ({ createLibraryItem: vi.fn(async () => ({})), recordCopy: vi.fn(async () => undefined) }));
vi.mock("@/lib/library", async (importOriginal) => ({ ...(await importOriginal<object>()), createLibraryItem: api.createLibraryItem }));
vi.mock("@/lib/my-library/copies", () => ({ recordCopy: api.recordCopy }));
// happy-dom measures every element as 0 x 0: the canvas area is 1000 x 600.
vi.mock("@/hooks/use-element-size", () => ({ useElementSize: () => ({ ref: { current: null }, w: 1000, h: 600 }) }));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
});

const base = newStored({ name: "Desk", width: 800, height: 480 });
const items: DisplayItem[] = [
  { ...defaultItem("Shape"), Name: "Card", X: 100, Y: 60, Width: 300, Height: 100 },
  { ...defaultItem("Text"), Name: "Title", X: 120, Y: 80, Width: 120, Height: 30 },
  { ...defaultItem("Shape"), Name: "Elsewhere", X: 600, Y: 400, Width: 50, Height: 50 },
];
const canvas = storeItems(base, openCanvas(base).profile, items);
const zone = { id: "z", module: CANVAS_ID, colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true, canvas } as Placement & { canvas: StoredCanvas };
const config = { profiles: [{ id: "p1", name: "Main", pages: [{ id: "pg", name: "Page 1", placements: [zone] }] }] } as unknown as DashboardConfig;
const history = { canUndo: false, canRedo: false, undo: vi.fn(), redo: vi.fn() };
const mount = (setConfig = vi.fn()) =>
  render(
    <ToastProvider>
      <CanvasEditorView zone={zone} setConfig={setConfig} history={history} onDone={vi.fn()} profileId="p1" />
    </ToastProvider>,
  );
const row = (name: string) => screen.getAllByRole("treeitem").find((r) => r.textContent?.includes(name))!;

describe("Save as component", () => {
  it("saves the selection as a Library component: its meta, size and re-based items", async () => {
    mount();
    fireEvent.click(row("Card"));
    fireEvent.click(row("Title"), { ctrlKey: true });
    fireEvent.keyDown(window, { key: "S", code: "KeyS", ctrlKey: true, shiftKey: true });
    const name = await screen.findByRole("textbox", { name: "Name" });
    fireEvent.change(name, { target: { value: "Title card" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.createLibraryItem).toHaveBeenCalledTimes(1));
    const [made] = api.createLibraryItem.mock.calls[0] as unknown as [{ kind: string; name: string; meta: Record<string, unknown>; data: StoredCanvas }];
    expect(made).toMatchObject({ kind: "canvas", name: "Title card", meta: { component: true, width: 300, height: 100, items: 2, roles: {} } });
    // The Elsewhere shape isn't in it, and the card sits at the origin.
    const read = readStored(JSON.parse(JSON.stringify(made.data)));
    expect(read.items.map((i) => [i.kind, (i as { X: number }).X, (i as { Y: number }).Y])).toEqual([["Shape", 0, 0], ["Text", 20, 20]]);
  });
});

describe("dropping a component on the editor canvas", () => {
  const piece = (() => {
    const s = storeItems(newStored({ name: "Piece", width: 10, height: 10 }), openCanvas(base).profile, items);
    const made = saveComponent({ stored: s, profile: openCanvas(s).profile, items: editItems(openCanvas(s)), selection: ["0", "1"], name: "Title card" })!;
    const input = componentItem(made.stored, "Title card", made.roles);
    return { id: "c1", kind: "canvas", name: input.name, createdAt: "t", updatedAt: "t", files: [], meta: input.meta, copies: [], data: input.data } as LibraryItem;
  })();

  it("merges it at the drop point as one step and counts a copy", async () => {
    const setConfig = vi.fn();
    mount(setConfig);
    const root = document.querySelector("[data-canvas-edit-layer]")!.closest<HTMLElement>(".overflow-hidden")!;
    setActiveLibraryDrag(piece);
    const ev = createEvent.drop(root, { dataTransfer: { getData: (t: string) => (t === LIBRARY_MIME ? JSON.stringify({ libraryItemId: "c1", kind: "canvas" }) : "") } });
    Object.defineProperty(ev, "clientX", { value: 500 });
    Object.defineProperty(ev, "clientY", { value: 300 });
    await act(async () => {
      fireEvent(root, ev);
    });
    await waitFor(() => expect(setConfig).toHaveBeenCalledTimes(1));
    const next = (setConfig.mock.calls[0][0] as (c: DashboardConfig) => DashboardConfig)(withCanvas(config, "z", zone.canvas));
    const placed = readStored(next.profiles[0].pages[0].placements[0].canvas).items;
    expect(placed.map((i) => (i as { Name: string }).Name)).toEqual(["Card", "Title", "Elsewhere", "Card", "Title"]);
    // Centred on the drop point: the component is 300 x 100.
    const at = profilePoint({ x: 500, y: 300 }, { left: 0, top: 0, width: 1000, height: 600 }, openCanvas(base).profile, fitScale(openCanvas(base).profile, 920, 520));
    expect(placed[3]).toMatchObject({ X: Math.round(at.x - 150), Y: Math.round(at.y - 50) });
    expect(placed[4]).toMatchObject({ X: Math.round(at.x - 150) + 20, Y: Math.round(at.y - 50) + 20 });
    expect(api.recordCopy).toHaveBeenCalledWith(piece, expect.objectContaining({ profileId: "p1", zoneId: "z", itemPath: "3" }));
  });
});

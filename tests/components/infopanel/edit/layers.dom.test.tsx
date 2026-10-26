// @vitest-environment happy-dom
import { createEvent, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { HostedEditor } from "@tests/components/infopanel/edit/hosted-editor";
import { withCanvas } from "@/components/studio/import-actions";
import { openCanvas } from "@/lib/infopanel/canvas";
import { storeItems } from "@/lib/infopanel/canvas-edit";
import { newStored, readStored, type StoredCanvas } from "@/lib/infopanel/import/stored";
import { defaultItem, type DisplayItem } from "@/lib/infopanel/schema";
import { CANVAS_ID, type DashboardConfig, type Placement } from "@/lib/layout";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
});

const base = newStored({ name: "Desk", width: 800, height: 480 });
const items: DisplayItem[] = [
  { ...defaultItem("Text"), Name: "Title", X: 10, Y: 10 },
  { ...defaultItem("Group"), Name: "Panel", DisplayItems: [] },
];
const canvas = storeItems(base, openCanvas(base).profile, items);
const zone = { id: "z", module: CANVAS_ID, colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true, canvas } as Placement & { canvas: StoredCanvas };
const config = { profiles: [{ id: "p1", name: "Main", pages: [{ id: "pg", name: "Page 1", placements: [zone] }] }] } as unknown as DashboardConfig;
const history = { canUndo: false, canRedo: false, undo: vi.fn(), redo: vi.fn() };

/** A dragover at a height in the row (happy-dom drops clientY from the init). */
const over = (el: Element, clientY: number) => {
  const ev = createEvent.dragOver(el, { dataTransfer: { setData: vi.fn(), effectAllowed: "", dropEffect: "" } });
  Object.defineProperty(ev, "clientY", { value: clientY });
  fireEvent(el, ev);
};
const row = (name: string) => screen.getAllByRole("treeitem").find((r) => r.textContent?.includes(name))!;

describe("Layers", () => {
  it("drops an item onto a group's middle to move it in, as one step, keeping its place", () => {
    const setConfig = vi.fn();
    render(
      <ToastProvider>
        <HostedEditor tab="layers" zone={zone} setConfig={setConfig} history={history} onDone={vi.fn()} profileId="p1" />
      </ToastProvider>,
    );
    const group = row("Panel");
    group.getBoundingClientRect = () => ({ top: 0, bottom: 30, height: 30, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON: () => ({}) });
    const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(row("Title"), { dataTransfer });
    over(group, 15);
    // The middle of a group row is inside it: the indicator says so.
    expect(group.getAttribute("data-drop")).toBe("inside");
    fireEvent.drop(group, { dataTransfer, clientY: 15 });

    expect(setConfig).toHaveBeenCalledTimes(1);
    const next = setConfig.mock.calls[0][0](withCanvas(config, "z", canvas)) as DashboardConfig;
    const saved = readStored(next.profiles[0].pages[0].placements[0].canvas).items;
    expect(saved).toHaveLength(1);
    const panel = saved[0];
    expect(panel.kind === "Group" && panel.DisplayItems.map((i) => [i.Name, i.X, i.Y])).toEqual([["Title", 10, 10]]);
  });

  it("marks where a drop lands: a line above or below a row, a box inside a group", () => {
    render(
      <ToastProvider>
        <HostedEditor tab="layers" zone={zone} setConfig={vi.fn()} history={history} onDone={vi.fn()} profileId="p1" />
      </ToastProvider>,
    );
    const rect = { top: 0, bottom: 30, height: 30, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON: () => ({}) };
    const group = row("Panel");
    const title = row("Title");
    group.getBoundingClientRect = () => rect;
    title.getBoundingClientRect = () => rect;
    const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(title, { dataTransfer });
    // Edges of a group row: above and below; its middle: inside. The line is drawn at the row's edge.
    over(group, 2);
    expect(group.getAttribute("data-drop")).toBe("above");
    expect(group.querySelector("span.bg-ui-accent")).not.toBeNull();
    over(group, 28);
    expect(group.getAttribute("data-drop")).toBe("below");
    over(group, 15);
    expect(group.getAttribute("data-drop")).toBe("inside");
    expect(group.querySelector("span.bg-ui-accent")).toBeNull();
  });

  it("shows why a drop can't land: a group into itself", () => {
    render(
      <ToastProvider>
        <HostedEditor tab="layers" zone={zone} setConfig={vi.fn()} history={history} onDone={vi.fn()} profileId="p1" />
      </ToastProvider>,
    );
    const group = row("Panel");
    const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(group, { dataTransfer });
    over(group, 15);
    expect(within(screen.getByRole("region", { name: "Layers" })).getByRole("status").textContent).toContain("can’t go into itself");
    expect(group.getAttribute("data-drop")).toBeNull();
  });
});

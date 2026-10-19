// @vitest-environment happy-dom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setViewport } from "@/test/dom-setup";
import { ToastProvider } from "@/components/ui/toast";
import type { Placement } from "@/lib/layout";
import { parseDisplayItemsXml, parseProfileXml } from "@/lib/infopanel/parse";
import { toStored, type StoredCanvas } from "@/lib/infopanel/import/stored";
import CanvasEditorView from "./canvas-editor";

const items = parseDisplayItemsXml(
  '<ArrayOfDisplayItem xmlns:xsi="x"><DisplayItem xsi:type="TextDisplayItem"><Name>one</Name></DisplayItem><DisplayItem xsi:type="TextDisplayItem"><Name>two</Name></DisplayItem></ArrayOfDisplayItem>',
).items;
const profile = parseProfileXml("<Profile><Name>P</Name><Width>800</Width><Height>480</Height></Profile>").profile;
const canvas: StoredCanvas = toStored({
  name: "P", origin: "file", dataApi: null, defaultMode: "infopanel", profile, items, assets: new Map(), keyOf: () => null, fonts: [],
});
const zone = { id: "z", module: "canvas", colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true, canvas } as Placement & { canvas: StoredCanvas };
const history = { canUndo: false, canRedo: false, undo: vi.fn(), redo: vi.fn() };

function setup(hidden = false) {
  const setConfig = vi.fn();
  const view = (h: boolean) => (
    <ToastProvider>
      <CanvasEditorView zone={zone} setConfig={setConfig} history={history} onDone={vi.fn()} hidden={h} initialSelection={["0"]} />
    </ToastProvider>
  );
  const r = render(view(hidden));
  return { setConfig, rerender: (h: boolean) => r.rerender(view(h)) };
}

const selected = () => screen.getAllByRole("treeitem").filter((n) => n.getAttribute("aria-selected") === "true").length;

describe("the canvas editor while the Library covers it", () => {
  // No server: the catalog and sensor reads fail at once instead of hanging until teardown.
  beforeEach(() => void vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline")))));

  it("keeps its selection across a hidden round trip", () => {
    const { rerender } = setup();
    expect(selected()).toBe(1);
    rerender(true);
    expect(selected()).toBe(1);
    rerender(false);
    expect(selected()).toBe(1);
  });

  it("acts on its keys only while shown", () => {
    const { setConfig, rerender } = setup();
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(setConfig).toHaveBeenCalledTimes(1);

    rerender(true);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(setConfig).toHaveBeenCalledTimes(1);

    rerender(false);
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(setConfig).toHaveBeenCalledTimes(2);
  });

  it("starts on the screenshot the canvas kept, and not otherwise", () => {
    const id = `${"a".repeat(64)}.png`;
    const kept = { ...zone, canvas: { ...canvas, screenshot: id } };
    const { container } = render(
      <ToastProvider>
        <CanvasEditorView zone={kept} setConfig={vi.fn()} history={history} onDone={vi.fn()} />
      </ToastProvider>,
    );
    act(() => screen.getAllByRole("button", { name: /Compare/ })[0].click());
    expect(container.querySelector(`img[src="/api/assets/${id}"]`)).not.toBeNull();
    expect(screen.getByText("Change screenshot…")).toBeTruthy();

    // The file is gone (a canvas from another PC): back to choosing one, no broken overlay.
    act(() => void fireEvent.error(container.querySelector("img")!));
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Choose InfoPanel screenshot…")).toBeTruthy();
  });
});

describe("the canvas editor's inspector mode", () => {
  beforeEach(() => void vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline")))));

  // The editor measures a roomy 800 px here, which the old element-based rule would have floated below 1100.
  const kind = () => {
    const aside = screen.queryByRole("complementary", { name: "Item" });
    if (!aside) return "sheet";
    return within(aside).queryByRole("button", { name: "Close" }) ? "floating" : "docked";
  };

  it("switches at the studio's breakpoints, whatever the editor measures", () => {
    setup();
    expect(kind()).toBe("docked");
    act(() => setViewport(1099));
    expect(kind()).toBe("floating");
    act(() => setViewport(639));
    expect(kind()).toBe("sheet");
    act(() => setViewport(640));
    expect(kind()).toBe("floating");
    act(() => setViewport(1100));
    expect(kind()).toBe("docked");
  });

  it("stays docked when the inspector opens or closes", () => {
    act(() => setViewport(1100));
    setup();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryAllByRole("treeitem").filter((n) => n.getAttribute("aria-selected") === "true")).toHaveLength(0);
    expect(kind()).toBe("docked");
  });
});

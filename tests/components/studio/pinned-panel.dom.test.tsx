// @vitest-environment happy-dom
// Unpinning from the pinned layer's list puts the widget back on the page (the owner: an unpinned widget must not vanish);
// only Delete removes it. A rail, which has no page form, can only be deleted, and a page widget that can't be pinned has
// Pin to edge disabled with the reason.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PinnedPanel } from "@/components/studio/pinned/pinned-panel";
import { pinEntries, pinToEdgeEntry } from "@/components/studio/pin-entry";
import type { MonitorProfile } from "@/lib/layout";
import { addPinnedItem, newPinnedItem, PIN_KINDS } from "@/lib/pinned-edit";

afterEach(cleanup);

const kind = (id: string) => PIN_KINDS.find((k) => k.id === id)!;
const status = { ...newPinnedItem(kind("status")), id: "pin-status" };
const rail = { ...newPinnedItem(kind("rail")), id: "pin-rail" };
const page = { id: "a", name: "A", placements: [] };
const profile = [status, rail].reduce(addPinnedItem, { id: "s", name: "S", width: 1024, height: 600, cols: 4, rows: 3, pages: [page] } as unknown as MonitorProfile);

function mount() {
  const actions = { remove: vi.fn(), moveToPage: vi.fn() };
  render(<PinnedPanel profile={profile} page={page} width={280} selectedId={null} onSelect={vi.fn()} onAdd={vi.fn()} onToggleVisible={vi.fn()} onMove={vi.fn()} actions={actions} />);
  return actions;
}

describe("unpinning from the list", () => {
  it("a row's Unpin button puts that widget back on the page and deletes nothing", () => {
    const actions = mount();
    fireEvent.click(screen.getByRole("button", { name: "Unpin" }));
    expect(actions.moveToPage).toHaveBeenCalledExactlyOnceWith("pin-status");
    expect(actions.remove).not.toHaveBeenCalled();
  });

  it("the row's right-click menu: Unpin goes back to the page, Delete removes", () => {
    const actions = mount();
    fireEvent.contextMenu(screen.getByText("Status bar"));
    fireEvent.click(screen.getByRole("menuitem", { name: /Unpin/ }));
    expect(actions.moveToPage).toHaveBeenCalledWith("pin-status");
    expect(actions.remove).not.toHaveBeenCalled();
    fireEvent.contextMenu(screen.getByText("Status bar"));
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete/ }));
    expect(actions.remove).toHaveBeenCalledWith("pin-status");
  });

  it("a rail can't be unpinned to a page, says why, and can be deleted", () => {
    const actions = mount();
    fireEvent.contextMenu(screen.getByText("Page rail"));
    const unpin = screen.getByRole("menuitem", { name: /Unpin/ });
    expect((unpin as HTMLButtonElement).disabled).toBe(true);
    expect(unpin.closest("[title]")?.getAttribute("title")).toMatch(/rail stays/);
    fireEvent.click(unpin);
    expect(actions.moveToPage).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(actions.remove).toHaveBeenCalledExactlyOnceWith("pin-rail");
  });
});

describe("Pin to edge on a page widget's menu", () => {
  const widget = { id: "w", module: "Clock", colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true };

  it("offers the four edges and pins on the one picked", () => {
    const pin = vi.fn();
    const entry = pinToEdgeEntry(widget, pin);
    expect(entry).toMatchObject({ disabled: false });
    const subs = (entry as { submenu: { id: string; onSelect: () => void }[] }).submenu;
    expect(subs.map((s) => s.id)).toEqual(["pin:top", "pin:bottom", "pin:left", "pin:right"]);
    subs[0].onSelect();
    expect(pin).toHaveBeenCalledWith("w", "top");
  });

  it("is disabled, with the reason as its title, for blank space", () => {
    expect(pinToEdgeEntry({ ...widget, module: "blank" }, vi.fn())).toMatchObject({ disabled: true, title: expect.stringMatching(/Blank/) });
  });
});

describe("Pin here on a page widget's menu (config v21)", () => {
  const widget = (id: string, extra: object = {}) => ({ id, module: "Clock", colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true, ...extra });

  it("comes first, then Pin to edge for one widget; a selection of several has Pin here alone, pinning them all", () => {
    const pinHere = vi.fn();
    expect(pinEntries([widget("a")], vi.fn(), pinHere).map((e) => (e as { id: string }).id)).toEqual(["pin-here", "pin-to-edge"]);
    const many = pinEntries([widget("a"), widget("b"), widget("c")], vi.fn(), pinHere);
    expect(many.map((e) => (e as { id: string }).id)).toEqual(["pin-here"]);
    (many[0] as { onSelect: () => void }).onSelect();
    expect(pinHere).toHaveBeenCalledWith(["a", "b", "c"]);
  });

  it("Pin here and Pin to edge have different icons", () => {
    const [here, edge] = pinEntries([widget("a")], vi.fn(), vi.fn()) as { icon: { type: unknown } }[];
    expect(here.icon.type).not.toBe(edge.icon.type);
  });

  it("is disabled, with the reason, when one of them can't be pinned or is placed freely", () => {
    expect(pinEntries([widget("a"), widget("b", { module: "blank" })], vi.fn(), vi.fn())[0]).toMatchObject({ disabled: true, title: expect.stringMatching(/Blank/) });
    expect(pinEntries([widget("a", { px: { x: 0, y: 0, w: 9, h: 9 } })], vi.fn(), vi.fn())[0]).toMatchObject({ disabled: true, title: expect.stringMatching(/placed freely/) });
  });
});

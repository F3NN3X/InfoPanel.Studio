// @vitest-environment happy-dom
// Removing a pinned widget from the pinned layer's list: the row's Unpin button and its right-click menu unpin it (one
// call each), a rail has no Move to page, and a page widget that can't be pinned has Pin to edge disabled with the reason.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PinnedPanel } from "@/components/studio/pinned/pinned-panel";
import { pinToEdgeEntry } from "@/components/studio/pin-entry";
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
  it("a row's Unpin button removes that item alone", () => {
    const actions = mount();
    fireEvent.click(screen.getAllByRole("button", { name: "Unpin" })[0]);
    expect(actions.remove).toHaveBeenCalledExactlyOnceWith("pin-status");
    expect(actions.moveToPage).not.toHaveBeenCalled();
  });

  it("the row's right-click menu has Unpin and Move to page", () => {
    const actions = mount();
    fireEvent.contextMenu(screen.getByText("Status bar"));
    fireEvent.click(screen.getByRole("menuitem", { name: /Move to page/ }));
    expect(actions.moveToPage).toHaveBeenCalledWith("pin-status");
    fireEvent.contextMenu(screen.getByText("Status bar"));
    fireEvent.click(screen.getByRole("menuitem", { name: /Unpin/ }));
    expect(actions.remove).toHaveBeenCalledWith("pin-status");
  });

  it("a rail can be unpinned but not moved to a page, and says why", () => {
    const actions = mount();
    fireEvent.contextMenu(screen.getByText("Page rail"));
    const move = screen.getByRole("menuitem", { name: /Move to page/ });
    expect((move as HTMLButtonElement).disabled).toBe(true);
    expect(move.closest("[title]")?.getAttribute("title")).toMatch(/rail stays/);
    fireEvent.click(move);
    expect(actions.moveToPage).not.toHaveBeenCalled();
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

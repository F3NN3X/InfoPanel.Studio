// @vitest-environment happy-dom
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { canvasPlaces, InfoPanelStart } from "@/components/infopanel/edit/infopanel-start";
import { newStored, type StoredCanvas } from "@/lib/infopanel/import/stored";
import { CANVAS_ID, type DashboardConfig, type Placement } from "@/lib/layout";
import type { LibraryItem } from "@/lib/library";
import { canvasItem } from "@/lib/my-library/canvas-link";

const placed = newStored({ name: "Desk", width: 800, height: 480, now: new Date("2026-10-25T10:00:00Z") });
const spare = newStored({ name: "Spare", width: 1920, height: 480, now: new Date("2026-10-25T11:00:00Z") });
const zone = { id: "z", module: CANVAS_ID, colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true, canvas: placed } as Placement & { canvas: StoredCanvas };
const main = { id: "p1", name: "Main", pages: [{ id: "pg", name: "Page 1", placements: [zone] }] };
const config = { profiles: [main] } as unknown as DashboardConfig;

const item = (id: string, stored: StoredCanvas): LibraryItem => {
  const input = canvasItem(stored, stored.source.name);
  return { id, kind: "canvas", name: input.name, createdAt: "t", updatedAt: "t", files: [], meta: input.meta ?? {}, copies: [] };
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response(JSON.stringify([item("lib-placed", placed), item("lib-spare", spare)]), { status: 200 }))));
});

const props = () => ({
  config,
  setConfig: vi.fn(),
  onContinue: vi.fn(),
  onOpen: vi.fn(),
  onOpenLibrary: vi.fn(),
  onNew: vi.fn(),
  onImport: vi.fn(),
  onRemoveProfile: vi.fn(),
  onUndo: vi.fn(),
  onExport: vi.fn(),
  onShowInScreens: vi.fn(),
});
const labels = () => screen.getAllByRole("menuitem").map((m) => m.textContent);

describe("the InfoPanel home page", () => {
  it("lists the Library profiles that aren't placed here, and opens one", async () => {
    const p = props();
    render(<InfoPanelStart {...p} />);
    expect(await screen.findByRole("heading", { name: "Saved in your Library" })).toBeTruthy();
    // The placed one is on the screens only.
    expect(screen.getAllByText("Desk")).toHaveLength(1);
    fireEvent.click(screen.getByText("Spare"));
    expect(p.onOpenLibrary).toHaveBeenCalledWith(expect.objectContaining({ id: "lib-spare" }));
  });

  it("leads with the open document, has Screens' toolbar, and New opens the New page", async () => {
    const p = props();
    render(<InfoPanelStart {...p} current={canvasPlaces(config)[0]} />);
    await screen.findByRole("heading", { name: "Saved in your Library" });
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Continue editing", "On your screens", "Saved in your Library"]);
    fireEvent.click(within(screen.getByRole("list", { name: "Continue editing" })).getByRole("button", { name: "Continue editing Desk" }));
    expect(p.onContinue).toHaveBeenCalledTimes(1);
    expect(p.onOpen).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "New" }));
    expect(p.onNew).toHaveBeenCalledTimes(1);

    // The search and the Show filter narrow both lists; a search hides Continue editing.
    fireEvent.change(screen.getByRole("searchbox", { name: "Search profiles" }), { target: { value: "1920x480" } });
    expect(screen.queryByText("Desk")).toBeNull();
    expect(screen.getByText("Spare")).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search profiles" }), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Saved" }));
    expect(screen.queryByRole("list", { name: "Your InfoPanel profiles" })).toBeNull();
    expect(screen.queryByRole("list", { name: "Continue editing" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "On screens" }));
    expect(screen.queryByText("Spare")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByText("Spare")).toBeTruthy();
  });

  it("a placed profile's menus list the same actions, and Duplicate is one config change", async () => {
    const p = props();
    render(<InfoPanelStart {...p} />);
    await screen.findByText("Spare");
    const card = within(screen.getByRole("list", { name: "Your InfoPanel profiles" })).getByRole("listitem");
    fireEvent.contextMenu(card, { clientX: 20, clientY: 20 });
    const fromRightClick = labels();
    // Desk is the Library's lib-placed, so its library action updates that item.
    expect(fromRightClick).toEqual(["Open", "Rename", "Duplicate", "Update in Library", "Export as .infopanel…", "Show in Screens", "Delete"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Duplicate" }));
    expect(p.setConfig).toHaveBeenCalledTimes(1);
    const next = p.setConfig.mock.calls[0][0](config) as DashboardConfig;
    expect(next.profiles.map((s) => s.name)).toEqual(["Main", "Desk copy"]);
    const copy = next.profiles[1].pages[0].placements[0].canvas!;
    expect(copy.profile.Name).toBe("Desk copy");
    expect(copy.profile.Guid).not.toBe(placed.profile.Guid);
    expect(p.onOpen).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(within(card).getByRole("button", { name: "Profile actions" }));
    });
    expect(await screen.findAllByRole("menuitem")).toHaveLength(fromRightClick.length);
    expect(labels()).toEqual(fromRightClick);
  });

  it("Delete asks first, then deletes a screen that holds only the profile, with an Undo", async () => {
    const p = props();
    const other = { id: "p2", name: "Other", pages: [{ id: "pg2", name: "Page 1", placements: [] }] };
    render(<InfoPanelStart {...p} config={{ profiles: [main, other] } as unknown as DashboardConfig} />);
    await screen.findByText("Spare");
    fireEvent.click(screen.getByRole("button", { name: "Open Desk" }));
    expect(p.onOpen).toHaveBeenCalledWith(expect.objectContaining({ profileId: "p1", zoneId: "z" }));
    fireEvent.contextMenu(within(screen.getByRole("list", { name: "Your InfoPanel profiles" })).getByRole("listitem"), { clientX: 20, clientY: 20 });
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(p.onRemoveProfile).not.toHaveBeenCalled();
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("A copy saved in the Library stays there.")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Delete screen" }));
    expect(p.onRemoveProfile).toHaveBeenCalledWith("p1");
    expect(p.setConfig).not.toHaveBeenCalled();
  });
});

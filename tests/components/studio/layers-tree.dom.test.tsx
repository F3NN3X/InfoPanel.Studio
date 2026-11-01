// @vitest-environment happy-dom
// Layers (Edit v3 SPEC §8, acceptance 16, 17): every row has the chevron slot, icon tile, name, kind word, the
// placed-freely mark on items only, the status on a screen made for InfoPanel, lock and eye, and never a grid size;
// rename, the layer menu, Collapse all and drops go to the page's host.
import { createEvent, fireEvent, render, screen, within } from "@testing-library/react";
import { Box } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { LayersTree, type LayersHost, type TreeNode } from "@/components/studio/layers-tree";
import { LayerSection } from "@/components/studio/layer-section";

const NODES: TreeNode[] = [
  { id: "overlay", type: "group", name: "Overlay", children: [{ id: "title", type: "part", kind: "item", name: "Title text", free: true }, { id: "glow", type: "part", kind: "element", name: "Accent glow" }] },
  { id: "weather", type: "part", kind: "widget", name: "Weather", locked: true },
  { id: "clock", type: "part", kind: "widget", name: "Clock", hidden: true },
];

function host(over: Partial<LayersHost> = {}): LayersHost {
  return {
    nodes: NODES,
    selectedIds: [],
    isOpen: () => true,
    setOpen: vi.fn(),
    select: vi.fn(),
    rename: vi.fn(),
    setLocked: vi.fn(),
    setHidden: vi.fn(),
    dropBlocked: () => null,
    drop: vi.fn(),
    menu: {
      available: { front: true, forward: true, backward: true, back: true, group: true, ungroup: false, lock: true, hide: true, snap: false, duplicate: true, delete: true },
      groups: [{ id: "overlay", name: "Overlay" }],
      run: vi.fn(),
      moveToGroup: vi.fn(),
    },
    iconOf: () => Box,
    ...over,
  };
}
const row = (name: string) => screen.getAllByTestId("layers-row").find((r) => r.textContent?.includes(name))!;
const RECT = { top: 0, bottom: 28, height: 28, left: 0, right: 200, width: 200, x: 0, y: 0, toJSON: () => ({}) };
const over = (el: Element, clientY: number) => {
  const ev = createEvent.dragOver(el, { dataTransfer: { setData: vi.fn(), effectAllowed: "", dropEffect: "" } });
  Object.defineProperty(ev, "clientY", { value: clientY });
  fireEvent(el, ev);
};

describe("Layers rows", () => {
  it("shows the row anatomy, top first, with the header and footer", () => {
    render(<LayersTree host={host({ selectedIds: ["overlay"], statusIcon: (id) => (id === "title" ? <span aria-label="Approximated" /> : null) })} />);
    const rows = screen.getAllByTestId("layers-row");
    expect(rows.map((r) => [r.dataset.kind, r.dataset.depth])).toEqual([["group", "0"], ["item", "1"], ["element", "1"], ["widget", "0"], ["widget", "0"]]);
    expect(row("Overlay").textContent).toContain("group · 2");
    expect(row("Weather").textContent).toContain("widget");
    // The placed-freely mark on the free item only; the status where the check has one.
    expect(within(row("Title text")).getByLabelText("Placed freely (Alt)")).toBeTruthy();
    expect(within(row("Accent glow")).queryByLabelText("Placed freely (Alt)")).toBeNull();
    expect(within(row("Title text")).getByTestId("layers-row-status")).toBeTruthy();
    expect(within(row("Weather")).queryByTestId("layers-row-status")).toBeNull();
    // Locked shows its lock, hidden dims, the selected group's children tint.
    expect(row("Weather").dataset.locked).toBe("");
    expect(row("Weather").querySelector('[data-row-action="lock"]')!.className).toContain("text-ui-2");
    expect(row("Weather").getAttribute("aria-description")).toBe("Locked");
    expect(row("Clock").getAttribute("aria-description")).toBe("Hidden");
    expect(row("Title text").hasAttribute("aria-description")).toBe(false);
    expect(row("Clock").className).not.toContain("opacity-45");
    expect(row("Clock").querySelector(".opacity-45")).toBeTruthy();
    expect(row("Clock").querySelector('[data-row-action="hide"]')!.getAttribute("title")).toBe("Show");
    expect(row("Title text").className).toContain("bg-ui-accent/7");
    expect(row("Overlay").dataset.selected).toBe("");
    // Never a grid size or a pencil.
    expect(rows.some((r) => /\d×\d/.test(r.textContent ?? ""))).toBe(false);
    const panel = screen.getByRole("region", { name: "Layers" });
    expect(panel.textContent).toContain("top first");
    expect(panel.textContent).toContain("4 parts · 1 group");
    expect(panel.textContent).toContain("Drag to reorder or into a group · right-click for more");
  });

  it("selects by click, Ctrl toggles, Shift a range along the rows shown", () => {
    const h = host();
    render(<LayersTree host={h} />);
    fireEvent.click(row("Weather"));
    fireEvent.click(row("Clock"), { ctrlKey: true });
    fireEvent.click(row("Title text"), { shiftKey: true });
    const visible = ["overlay", "title", "glow", "weather", "clock"];
    expect(vi.mocked(h.select).mock.calls).toEqual([["weather", "only", visible], ["clock", "toggle", visible], ["title", "range", visible]]);
  });

  it("works from the keyboard: the selection is the tab stop, arrows move, Shift extends, Enter and Ctrl+Space select", () => {
    const h = host({ selectedIds: ["title"] });
    render(<LayersTree host={h} />);
    expect(screen.getAllByTestId("layers-row").filter((r) => r.tabIndex === 0)).toEqual([row("Title text")]);
    row("Title text").focus();
    fireEvent.keyDown(row("Title text"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(row("Accent glow"));
    fireEvent.keyDown(row("Accent glow"), { key: "ArrowDown", shiftKey: true });
    expect(document.activeElement).toBe(row("Weather"));
    fireEvent.keyDown(row("Weather"), { key: "Enter" });
    fireEvent.keyDown(row("Weather"), { key: " ", ctrlKey: true });
    const visible = ["overlay", "title", "glow", "weather", "clock"];
    expect(vi.mocked(h.select).mock.calls).toEqual([["weather", "range", visible], ["weather", "only", visible], ["weather", "toggle", visible]]);
  });

  it("keeps buttons out of the treeitem's accessibility tree (APG tree); the pointer icons still work", () => {
    render(<LayersTree host={host()} />);
    for (const r of screen.getAllByTestId("layers-row")) expect(within(r).queryAllByRole("button")).toHaveLength(0);
    for (const el of row("Overlay").querySelectorAll("button")) expect(el.getAttribute("aria-hidden")).toBe("true");
  });

  it("keeps focus on the row when a pointer icon is pressed, names the state, and announces a change", () => {
    const h = host();
    const { rerender } = render(<LayersTree host={h} />);
    for (const el of row("Weather").querySelectorAll("button")) expect(fireEvent.mouseDown(el)).toBe(false);
    expect(row("Weather").getAttribute("aria-keyshortcuts")).toBe("Control+L Control+H");
    expect(row("Weather").querySelector(".sr-only")!.textContent).toBe(", Locked");
    expect(screen.getByTestId("layers-announcement").textContent).toBe("");
    rerender(<LayersTree host={host({ nodes: NODES.map((n) => (n.id === "weather" ? { ...n, locked: false } : n)) })} />);
    expect(screen.getByTestId("layers-announcement").textContent).toBe("Weather: unlocked and shown");
    rerender(<LayersTree host={host({ nodes: NODES.map((n) => (n.id === "weather" ? { ...n, locked: false, hidden: true } : n)) })} />);
    expect(screen.getByTestId("layers-announcement").textContent).toBe("Weather: hidden");
  });

  it("opens and closes a group with Right and Left from the row", () => {
    const h = host({ isOpen: (id) => id !== "overlay" });
    render(<LayersTree host={h} />);
    fireEvent.keyDown(row("Overlay"), { key: "ArrowRight" });
    expect(h.setOpen).toHaveBeenCalledWith(["overlay"], true);
  });

  it("toggles lock and eye, and Collapse all closes every group", () => {
    const h = host();
    render(<LayersTree host={h} />);
    fireEvent.click(row("Accent glow").querySelector('[data-row-action="lock"]')!);
    fireEvent.click(row("Weather").querySelector('[data-row-action="hide"]')!);
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    expect(h.setLocked).toHaveBeenCalledWith("glow", true);
    expect(h.setHidden).toHaveBeenCalledWith("weather", true);
    expect(h.setOpen).toHaveBeenCalledWith(["overlay"], false);
  });

  it("renames inline: Enter commits, Esc cancels", () => {
    const h = host();
    render(<LayersTree host={h} />);
    fireEvent.doubleClick(within(row("Weather")).getByText("Weather"));
    const input = screen.getByRole("textbox", { name: "Rename Weather" });
    fireEvent.change(input, { target: { value: "Forecast" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(h.rename).toHaveBeenCalledWith("weather", "Forecast");
    fireEvent.doubleClick(within(row("Clock")).getByText("Clock"));
    const again = screen.getByRole("textbox", { name: "Rename Clock" });
    fireEvent.change(again, { target: { value: "Nope" } });
    fireEvent.keyDown(again, { key: "Escape" });
    expect(h.rename).toHaveBeenCalledTimes(1);
  });
});

describe("the layer menu", () => {
  it("lists the actions in the SPEC's order, disables what doesn't apply, and runs the one picked", async () => {
    const h = host({ selectedIds: ["weather"] });
    render(<LayersTree host={h} />);
    fireEvent.contextMenu(row("Weather"), { clientX: 10, clientY: 10 });
    // The menu is its own chunk.
    const menu = await screen.findByTestId("layer-menu");
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((i) => i.textContent?.replace(/(Ctrl\+.*|F2|Del)$/, ""))).toEqual([
      "Bring to front", "Bring forward", "Send backward", "Send to back",
      "Group selection", "Ungroup", "Move to group",
      "Snap to grid", "Lock", "Hide",
      "Rename", "Duplicate", "Delete",
    ]);
    expect(items.find((i) => i.textContent?.startsWith("Snap to grid"))).toHaveProperty("disabled", true);
    expect(items.find((i) => i.textContent?.startsWith("Ungroup"))).toHaveProperty("disabled", true);
    expect(menu.style.width).toBe("230px");
    fireEvent.click(items[0]);
    expect(h.menu.run).toHaveBeenCalledWith("front");
  });
});

describe("dragging rows", () => {
  it("draws a line between rows and an outline on a group's middle, and drops into the place it shows", () => {
    const h = host({ selectedIds: ["clock"] });
    render(<LayersTree host={h} />);
    for (const r of screen.getAllByTestId("layers-row")) r.getBoundingClientRect = () => RECT;
    const dataTransfer = { setData: vi.fn(), effectAllowed: "", dropEffect: "" };
    fireEvent.dragStart(row("Clock"), { dataTransfer });
    over(row("Weather"), 3);
    expect(row("Weather").dataset.drop).toBe("above");
    expect(row("Weather").querySelector("span.bg-ui-accent")).not.toBeNull();
    over(row("Overlay"), 14);
    expect(row("Overlay").dataset.drop).toBe("inside");
    expect(row("Overlay").className).toContain("outline-ui-accent");
    fireEvent.drop(row("Overlay"), { dataTransfer, clientY: 14 });
    expect(h.drop).toHaveBeenCalledWith(["clock"], "overlay", 0);
  });

  it("shows no indicator where the drop is refused", () => {
    render(<LayersTree host={host({ selectedIds: ["overlay"], dropBlocked: () => "A group can’t go into itself." })} />);
    for (const r of screen.getAllByTestId("layers-row")) r.getBoundingClientRect = () => RECT;
    fireEvent.dragStart(row("Overlay"), { dataTransfer: { setData: vi.fn(), effectAllowed: "", dropEffect: "" } });
    over(row("Overlay"), 14);
    expect(row("Overlay").dataset.drop).toBeUndefined();
    expect(screen.getByRole("status").textContent).toContain("can’t go into itself");
  });
});

describe("the inspector's LAYER section", () => {
  it("runs the four order actions and moves into a group, out of it, or into a new one", () => {
    const onAction = vi.fn();
    const onInGroup = vi.fn();
    render(<LayerSection onAction={onAction} groups={[{ id: "g1", name: "Gauges" }]} inGroup="g1" onInGroup={onInGroup} />);
    const section = screen.getByTestId("inspector-layer");
    for (const label of ["Bring to front", "Bring forward", "Send backward", "Send to back"]) fireEvent.click(within(section).getByRole("button", { name: label }));
    expect(onAction.mock.calls.map((c) => c[0])).toEqual(["front", "forward", "backward", "back"]);
    const select = within(section).getByRole("combobox", { name: "In group" }) as HTMLSelectElement;
    expect(select.value).toBe("g1");
    expect([...select.options].map((o) => o.text)).toEqual(["None", "Gauges", "New group…"]);
    fireEvent.change(select, { target: { value: "" } });
    fireEvent.change(select, { target: { value: select.options[2].value } });
    expect(onInGroup.mock.calls).toEqual([[null], ["new"]]);
  });
});

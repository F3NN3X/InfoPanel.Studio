// @vitest-environment happy-dom
// The dropdown menu and the right-click menu share one look and Base UI's keyboard: arrows, Escape, disabled rows.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContextMenu, type ContextMenuEntry } from "@/components/ui/context-menu";
import { Menu } from "@/components/ui/menu";

function Demo({ onPick }: { onPick: (id: string) => void }) {
  return (
    <Menu.Root>
      <Menu.Trigger>Actions</Menu.Trigger>
      <Menu.Content>
        <Menu.Item onClick={() => onPick("rename")}>Rename</Menu.Item>
        <Menu.Item disabled onClick={() => onPick("copy")}>
          Copy
        </Menu.Item>
        <Menu.Separator />
        <Menu.Item danger onClick={() => onPick("delete")}>
          Delete
        </Menu.Item>
      </Menu.Content>
    </Menu.Root>
  );
}

const open = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
  });
  return screen.findAllByRole("menuitem");
};

describe("Menu", () => {
  it("opens from its trigger, picks a row and closes", async () => {
    const onPick = vi.fn();
    render(<Demo onPick={onPick} />);
    const items = await open();
    expect(items.map((i) => i.textContent)).toEqual(["Rename", "Copy", "Delete"]);
    await act(async () => {
      fireEvent.click(items[0]);
    });
    expect(onPick).toHaveBeenCalledWith("rename");
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
  });

  it("marks a disabled row, never picks it, and paints a danger row red", async () => {
    const onPick = vi.fn();
    render(<Demo onPick={onPick} />);
    const [, copy, del] = await open();
    expect(copy.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(copy);
    expect(onPick).not.toHaveBeenCalledWith("copy");
    expect(del.className).toContain("text-ui-danger");
    expect(copy.className).toContain("data-disabled:text-ui-hint");
  });

  it("closes on Escape", async () => {
    render(<Demo onPick={vi.fn()} />);
    const [rename] = await open();
    await act(async () => {
      fireEvent.keyDown(rename, { key: "Escape" });
    });
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
  });
});

describe("ContextMenu", () => {
  const entries = (onSelect: () => void): ContextMenuEntry[] => [
    { id: "a", label: "Open", hint: "Enter", onSelect },
    { id: "b", label: "Locked", disabled: true, title: "Why not" },
    "separator",
    { id: "c", label: "Move to", submenu: [{ id: "c1", label: "Page 1" }] },
    { id: "d", label: "Delete", danger: true },
  ];

  it("lists the rows, focuses the first enabled one and keeps its width and test id", async () => {
    render(<ContextMenu x={40} y={60} entries={entries(vi.fn())} onClose={vi.fn()} width={230} testId="ctx" />);
    const menu = await screen.findByTestId("ctx");
    expect(menu.style.width).toBe("230px");
    const items = screen.getAllByRole("menuitem");
    expect(items.map((i) => i.textContent)).toEqual(["OpenEnter", "Locked", "Move to", "Delete"]);
    await waitFor(() => expect(document.activeElement).toBe(items[0]));
    expect(items[1].getAttribute("aria-disabled")).toBe("true");
    expect(items[1].getAttribute("title")).toBe("Why not");
  });

  it("closes first, then runs the pick; a disabled row does neither", async () => {
    const order: string[] = [];
    const onClose = vi.fn(() => void order.push("close"));
    render(<ContextMenu x={0} y={0} entries={entries(() => order.push("select"))} onClose={onClose} />);
    const items = await screen.findAllByRole("menuitem");
    fireEvent.click(items[1]);
    expect(order).toEqual([]);
    fireEvent.click(items[0]);
    expect(order).toEqual(["close", "select"]);
  });

  it("closes on Escape", async () => {
    const onClose = vi.fn();
    render(<ContextMenu x={0} y={0} entries={entries(vi.fn())} onClose={onClose} />);
    const [first] = await screen.findAllByRole("menuitem");
    fireEvent.keyDown(first, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("moves between rows with the arrow keys", async () => {
    render(<ContextMenu x={0} y={0} entries={entries(vi.fn())} onClose={vi.fn()} />);
    const items = await screen.findAllByRole("menuitem");
    await waitFor(() => expect(document.activeElement).toBe(items[0]));
    await act(async () => {
      fireEvent.keyDown(items[0], { key: "ArrowDown" });
    });
    expect(document.activeElement).toBe(items[1]);
    await act(async () => {
      fireEvent.keyDown(items[1], { key: "ArrowUp" });
    });
    expect(document.activeElement).toBe(items[0]);
  });

  it("opens a flyout with its own rows", async () => {
    const onSelect = vi.fn();
    render(
      <ContextMenu x={0} y={0} entries={[{ id: "m", label: "Move to", submenu: [{ id: "p", label: "Page 1", onSelect }] }]} onClose={vi.fn()} />,
    );
    const [trigger] = await screen.findAllByRole("menuitem");
    await act(async () => {
      fireEvent.click(trigger);
    });
    const sub = await screen.findByRole("menuitem", { name: "Page 1" });
    fireEvent.click(sub);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
});

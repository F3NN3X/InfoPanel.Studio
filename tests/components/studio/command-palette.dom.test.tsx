// @vitest-environment happy-dom
// The command palette's input is an APG combobox over its listbox: aria-activedescendant follows the highlighted option.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommandPalette } from "@/components/studio/command-palette";
import type { Command } from "@/components/studio/commands";

const commands = [
  { id: "a", label: "Alpha", group: "G", run: vi.fn() },
  { id: "b", label: "Beta", group: "G", run: vi.fn() },
] as unknown as Command[];

describe("CommandPalette", () => {
  it("is a combobox owning the listbox, with the highlighted option as the active descendant", () => {
    const onRun = vi.fn();
    render(<CommandPalette open onOpenChange={() => {}} commands={commands} onRun={onRun} />);
    const input = screen.getByRole("combobox", { name: "Command" });
    expect(input.getAttribute("aria-expanded")).toBe("true");
    const list = screen.getByRole("listbox", { name: "Commands" });
    expect(input.getAttribute("aria-controls")).toBe(list.id);
    const options = screen.getAllByRole("option");
    expect(input.getAttribute("aria-activedescendant")).toBe(options[0].id);
    expect(options.map((o) => o.getAttribute("aria-selected"))).toEqual(["true", "false"]);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(options[1].id);
    expect(options[1].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onRun).toHaveBeenCalledWith(commands[1]);
  });

  it("is not expanded and has no active descendant when nothing matches", () => {
    render(<CommandPalette open onOpenChange={() => {}} commands={commands} onRun={vi.fn()} />);
    const input = screen.getByRole("combobox", { name: "Command" });
    fireEvent.change(input, { target: { value: "zzzz" } });
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.hasAttribute("aria-activedescendant")).toBe(false);
    expect(screen.getByRole("status").textContent).toBe("No commands match");
  });

  it("closes on Escape", () => {
    const onOpenChange = vi.fn();
    render(<CommandPalette open onOpenChange={onOpenChange} commands={commands} onRun={vi.fn()} />);
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Command" }), { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
  });
});

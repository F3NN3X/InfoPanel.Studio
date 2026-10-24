// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MultiInspector } from "@/components/infopanel/edit/multi-inspector";
import type { CanvasEditor } from "@/components/infopanel/edit/use-canvas-editor";
import { newItem } from "@/lib/infopanel/editor/create";
import { readStored, newStored } from "@/lib/infopanel/import/stored";

const profile = readStored(newStored({ name: "Desk", width: 800, height: 480 })).profile;
const items = [
  { ...newItem("Text", profile), X: 10 },
  { ...newItem("Sensor", profile), X: 40 },
];

function editorOf(over: Partial<CanvasEditor> = {}): CanvasEditor {
  return {
    committed: items,
    selection: ["0", "1"],
    boxes: { "0": { x: 10, y: 100, width: 50, height: 20 }, "1": { x: 40, y: 100, width: 60, height: 20 } },
    align: vi.fn(),
    distribute: vi.fn(),
    setFields: vi.fn(),
    ...over,
  } as unknown as CanvasEditor;
}

describe("the inspector for several items", () => {
  it("aligns them, and sets a shared field on all of them as InfoPanel takes it", () => {
    const editor = editorOf();
    render(<MultiInspector editor={editor} />);
    expect(screen.getByText("2 items selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Align left" }));
    expect(editor.align).toHaveBeenCalledWith("left");
    // Distribute needs three.
    expect(screen.getByRole("button", { name: "Distribute across" })).toHaveProperty("disabled", true);

    const x = screen.getByLabelText("X") as HTMLInputElement;
    expect(x.placeholder).toBe("Mixed");
    fireEvent.change(x, { target: { value: "25" } });
    fireEvent.keyDown(x, { key: "Enter" });
    expect(editor.setFields).toHaveBeenCalledWith(new Map([["0", 25], ["1", 25]]), "X");

    const color = screen.getByLabelText("Color") as HTMLInputElement;
    expect(color.value).toBe("#FFFFFFFF");
    fireEvent.change(color, { target: { value: "red" } });
    fireEvent.blur(color);
    expect(screen.getByText(/InfoPanel needs Color as a colour/)).toBeTruthy();
    expect(editor.setFields).toHaveBeenCalledTimes(1);
  });
});

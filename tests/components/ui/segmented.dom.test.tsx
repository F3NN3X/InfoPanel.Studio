// @vitest-environment happy-dom
// The Layers | Add switch is a radiogroup on Segmented: one tab stop (the checked radio), arrows move and select.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Segmented } from "@/components/ui/segmented";

describe("Segmented", () => {
  it("has one tab stop, the checked radio, and an arrow key moves to the other and selects it", () => {
    const onChange = vi.fn();
    render(
      <Segmented
        label="Left panel"
        value="add"
        onChange={onChange}
        options={[
          { value: "layers", label: "Layers" },
          { value: "add", label: "Add" },
        ]}
      />
    );
    const radios = screen.getAllByRole("radio");
    expect(radios.filter((r) => r.tabIndex === 0).map((r) => r.textContent)).toEqual(["Add"]);
    radios[1].focus();
    fireEvent.keyDown(radios[1], { key: "ArrowLeft" });
    expect(document.activeElement).toBe(radios[0]);
    expect(onChange).toHaveBeenCalledWith("layers");
  });
});

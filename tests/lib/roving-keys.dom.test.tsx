// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { onRovingKeyDown } from "@/lib/roving";

function Group({ onPick }: { onPick: (v: string) => void }) {
  return (
    <div role="radiogroup" onKeyDown={(e) => onRovingKeyDown(e, '[role="radio"]')}>
      {["a", "b", "c", "d"].map((v) => (
        <button key={v} role="radio" aria-checked={false} disabled={v === "c"} onClick={() => onPick(v)}>
          {v}
        </button>
      ))}
    </div>
  );
}

const setup = () => {
  const pick = vi.fn();
  render(<Group onPick={pick} />);
  return { pick, radio: (n: string) => screen.getByRole("radio", { name: n }) };
};

describe("onRovingKeyDown", () => {
  it("moves focus with the arrow and selects it", () => {
    const { pick, radio } = setup();
    radio("a").focus();
    fireEvent.keyDown(radio("a"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(radio("b"));
    expect(pick).toHaveBeenLastCalledWith("b");
  });

  it("skips a disabled item", () => {
    const { radio } = setup();
    radio("b").focus();
    fireEvent.keyDown(radio("b"), { key: "ArrowRight" });
    expect(document.activeElement).toBe(radio("d"));
  });

  it("wraps at both ends", () => {
    const { radio } = setup();
    radio("d").focus();
    fireEvent.keyDown(radio("d"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(radio("a"));
    fireEvent.keyDown(radio("a"), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(radio("d"));
  });

  it("jumps to the ends with Home and End", () => {
    const { radio } = setup();
    radio("b").focus();
    fireEvent.keyDown(radio("b"), { key: "End" });
    expect(document.activeElement).toBe(radio("d"));
    fireEvent.keyDown(radio("d"), { key: "Home" });
    expect(document.activeElement).toBe(radio("a"));
  });

  it("leaves a modified arrow alone", () => {
    const { pick, radio } = setup();
    radio("a").focus();
    fireEvent.keyDown(radio("a"), { key: "ArrowRight", altKey: true });
    expect(document.activeElement).toBe(radio("a"));
    expect(pick).not.toHaveBeenCalled();
  });
});

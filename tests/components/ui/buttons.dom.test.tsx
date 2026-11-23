// @vitest-environment happy-dom
// The button primitives' states: hover, focus ring, disabled and selected each reach the DOM, and a disabled control does nothing.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button, FOCUS_RING } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Segmented } from "@/components/ui/segmented";
import { Toggle } from "@/components/ui/toggle";

const ring = (el: HTMLElement) => FOCUS_RING.split(" ").every((c) => el.className.split(" ").includes(c));

describe("Button", () => {
  it("has a hover, the focus ring and a disabled look, and primary is off-white, never blue", () => {
    render(
      <>
        <Button variant="primary">Go</Button>
        <Button disabled>Off</Button>
      </>
    );
    const primary = screen.getByRole("button", { name: "Go" });
    expect(ring(primary)).toBe(true);
    expect(primary.className).toContain("hover:bg-white");
    expect(primary.className).toContain("bg-ui-inverse");
    expect(primary.className).not.toContain("bg-ui-blue");
    expect(primary.className).not.toContain("bg-ui-accent");
    expect(screen.getByRole("button", { name: "Off" }).className).toContain("disabled:opacity-40");
  });

  it("does not click when disabled, and passes a ref", () => {
    const onClick = vi.fn();
    const ref = { current: null as HTMLButtonElement | null };
    render(<Button ref={ref} disabled onClick={onClick}>Off</Button>);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).not.toHaveBeenCalled();
    expect(ref.current).toBe(screen.getByRole("button"));
  });
});

describe("IconButton", () => {
  it("is named by its label, rings on focus, and shows the selected look when active", () => {
    render(<IconButton label="Pin" active aria-pressed><i /></IconButton>);
    const b = screen.getByRole("button", { name: "Pin" });
    expect(b.title).toBe("Pin");
    expect(ring(b)).toBe(true);
    expect(b.getAttribute("aria-pressed")).toBe("true");
    expect(b.className).toContain("bg-ui-active");
  });

  it("takes a border, a danger hover, and ignores clicks when disabled", () => {
    const onClick = vi.fn();
    render(<IconButton label="Delete" bordered danger disabled onClick={onClick}><i /></IconButton>);
    const b = screen.getByRole("button", { name: "Delete" });
    expect(b.className).toContain("border-ui-default");
    expect(b.className).toContain("hover:text-ui-danger");
    expect(b.className).toContain("disabled:pointer-events-none");
    fireEvent.click(b);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Toggle", () => {
  it("is a switch that flips on click and rings on focus", () => {
    const onChange = vi.fn();
    render(<Toggle label="Grid" checked={false} onChange={onChange} />);
    const t = screen.getByRole("switch", { name: "Grid" });
    expect(t.getAttribute("aria-checked")).toBe("false");
    expect(ring(t)).toBe(true);
    expect(t.className).toContain("hover:bg-ui-hover-edge");
    fireEvent.click(t);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("does nothing when disabled", () => {
    const onChange = vi.fn();
    render(<Toggle label="Grid" checked onChange={onChange} disabled />);
    const t = screen.getByRole("switch");
    expect(t.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(t);
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("Segmented states", () => {
  const options = [
    { value: "a", label: "A" },
    { value: "b", label: "B", disabled: true },
    { value: "c", label: "C" },
  ];

  it("marks the selected segment, and arrows skip a disabled one", () => {
    const onChange = vi.fn();
    render(<Segmented label="Pick" value="a" onChange={onChange} options={options} />);
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-checked"))).toEqual(["true", "false", "false"]);
    expect(radios[0].className).toContain("bg-ui-active");
    expect((radios[1] as HTMLButtonElement).disabled).toBe(true);
    radios[0].focus();
    fireEvent.keyDown(radios[0], { key: "ArrowRight" });
    expect(document.activeElement).toBe(radios[2]);
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("holds the tab stop on the first segment while nothing is chosen", () => {
    render(<Segmented label="Pick" value={null} onChange={() => {}} options={options} />);
    expect(screen.getAllByRole("radio").map((r) => r.tabIndex)).toEqual([0, -1, -1]);
  });
});

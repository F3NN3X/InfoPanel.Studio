// @vitest-environment happy-dom
// Popover, tabs, toast card and slider: the keyboard and the states each one must keep.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Popover, PopoverParts } from "@/components/ui/popover";
import { Slider, SliderField } from "@/components/ui/slider-field";
import { Tabs } from "@/components/ui/tabs";
import { ToastCard } from "@/components/ui/toast-provider";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";

describe("Popover", () => {
  it("opens from its trigger and closes on Escape", async () => {
    render(
      <Popover trigger="Options" triggerLabel="Options">
        <p>Panel body</p>
      </Popover>,
    );
    expect(screen.queryByText("Panel body")).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Options" }));
    });
    expect(await screen.findByText("Panel body")).toBeTruthy();
    await act(async () => {
      fireEvent.keyDown(screen.getByText("Panel body"), { key: "Escape" });
    });
    expect(screen.queryByText("Panel body")).toBeNull();
  });

  it("can be controlled, with its own trigger and a Close part", async () => {
    const onOpenChange = vi.fn();
    render(
      <PopoverParts.Root open onOpenChange={onOpenChange}>
        <PopoverParts.Trigger>Open</PopoverParts.Trigger>
        <PopoverParts.Content aria-label="Presets" className="w-40">
          <PopoverParts.Title>Title</PopoverParts.Title>
          <PopoverParts.Close>Done</PopoverParts.Close>
        </PopoverParts.Content>
      </PopoverParts.Root>,
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog.className).toContain("w-40");
    expect(dialog.className).toContain("bg-ui-raised");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Done" }));
    });
    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything());
  });
});

describe("Tooltip", () => {
  it("wraps its child and adds no popup while disabled", () => {
    render(
      <TooltipProvider>
        <Tooltip label="Layers" disabled>
          <button type="button">L</button>
        </Tooltip>
      </TooltipProvider>,
    );
    expect(screen.getByRole("button", { name: "L" })).toBeTruthy();
    expect(screen.queryByText("Layers")).toBeNull();
  });
});

describe("Tabs variants", () => {
  const tabs = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta", disabled: true, title: "Nothing here" },
    { value: "c", label: "Gamma" },
  ] as const;

  it("skips a disabled tab with the arrow keys, dims it and shows why", () => {
    const onChange = vi.fn();
    render(<Tabs variant="pill" label="Sections" value="a" onChange={onChange} tabs={tabs} />);
    const [alpha, beta, gamma] = screen.getAllByRole("tab");
    expect(beta.hasAttribute("disabled")).toBe(true);
    expect(beta.getAttribute("title")).toBe("Nothing here");
    alpha.focus();
    fireEvent.keyDown(alpha, { key: "ArrowRight" });
    expect(document.activeElement).toBe(gamma);
    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("marks the selected tab in both variants and keeps one tab stop", () => {
    for (const variant of ["underline", "pill"] as const) {
      const { unmount } = render(<Tabs variant={variant} label={variant} value="c" onChange={() => {}} tabs={tabs} />);
      const [alpha, , gamma] = screen.getAllByRole("tab");
      expect(gamma.getAttribute("aria-selected")).toBe("true");
      expect([alpha.tabIndex, gamma.tabIndex]).toEqual([-1, 0]);
      unmount();
    }
  });

  it("Home and End go to the first and last enabled tab", () => {
    const onChange = vi.fn();
    render(<Tabs label="Sections" value="a" onChange={onChange} tabs={tabs} />);
    const [alpha, , gamma] = screen.getAllByRole("tab");
    alpha.focus();
    fireEvent.keyDown(alpha, { key: "End" });
    expect(document.activeElement).toBe(gamma);
    fireEvent.keyDown(gamma, { key: "Home" });
    expect(document.activeElement).toBe(alpha);
  });
});

describe("ToastCard", () => {
  it("shows the message, runs an action and dismisses", () => {
    const onUndo = vi.fn();
    const onDismiss = vi.fn();
    render(
      <ToastCard icon={<i data-testid="icon" />} actions={[{ label: "Undo", onClick: onUndo }, { label: "Reset", onClick: () => {}, accent: true }]} onDismiss={onDismiss}>
        Deleted A
      </ToastCard>,
    );
    expect(screen.getByText("Deleted A")).toBeTruthy();
    expect(screen.getByTestId("icon")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reset" }).className).toContain("text-ui-accent");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("has no dismiss button unless it is given one", () => {
    render(<ToastCard>Saved</ToastCard>);
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
  });
});

describe("Slider", () => {
  it("reports a number, names itself and takes a spoken value", () => {
    const onChange = vi.fn();
    render(<Slider label="Corners" valueText="8 px" min={0} max={24} value={4} onChange={onChange} />);
    const range = screen.getByRole("slider", { name: "Corners" }) as HTMLInputElement;
    expect(range.getAttribute("aria-valuetext")).toBe("8 px");
    fireEvent.change(range, { target: { value: "12" } });
    expect(onChange).toHaveBeenCalledWith(12);
  });

  it("is inert and dimmed when disabled, and shows a focus ring on keyboard focus", () => {
    render(<Slider label="Dim" value={0} onChange={() => {}} disabled />);
    const range = screen.getByRole("slider", { name: "Dim" }) as HTMLInputElement;
    expect(range.disabled).toBe(true);
    expect(range.className).toContain("disabled:opacity-40");
    expect(range.className).toContain("focus-visible:outline-ui-accent");
  });

  it("passes pointer and key events through for callers that commit on release", () => {
    const onPointerUp = vi.fn();
    render(<Slider label="Thickness" value={2} onChange={() => {}} onPointerUp={onPointerUp} />);
    fireEvent.pointerUp(screen.getByRole("slider"));
    expect(onPointerUp).toHaveBeenCalled();
  });

  it("SliderField snaps a typed value to the step grid", () => {
    const onChange = vi.fn();
    render(<SliderField label="Opacity" min={0} max={10} step={2} value={4} onChange={onChange} />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Opacity value" }), { target: { value: "7" } });
    expect(onChange).toHaveBeenCalledWith(8);
  });
});

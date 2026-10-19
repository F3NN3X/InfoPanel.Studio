// @vitest-environment happy-dom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { setViewport } from "@/test/dom-setup";
import { useViewportBelow } from "@/hooks/use-viewport-below";
import { PaneSheet } from "./pane-sheet";
import { NARROW_PAGE_WIDTH } from "./studio-layout";

/** The page pattern: the detail is a sheet below the breakpoint, a side pane above it. */
function Page({ onClose = () => {} }: { onClose?: () => void }) {
  const narrow = useViewportBelow(NARROW_PAGE_WIDTH);
  const detail = <p>Gauge detail</p>;
  return narrow ? <PaneSheet label="Gauge details" onClose={onClose}>{detail}</PaneSheet> : <aside aria-label="Side pane">{detail}</aside>;
}

describe("stacked versus side-by-side", () => {
  it("renders the wide form from the breakpoint up and the sheet just below it", () => {
    setViewport(NARROW_PAGE_WIDTH);
    render(<Page />);
    expect(screen.getByRole("complementary", { name: "Side pane" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Gauge details" })).toBeNull();

    act(() => setViewport(NARROW_PAGE_WIDTH - 1));
    expect(screen.getByRole("region", { name: "Gauge details" })).toBeTruthy();
    expect(screen.queryByRole("complementary", { name: "Side pane" })).toBeNull();
    expect(screen.getByText("Gauge detail")).toBeTruthy();

    act(() => setViewport(1280));
    expect(screen.getByRole("complementary", { name: "Side pane" })).toBeTruthy();
  });

  it("starts narrow when the viewport already is", () => {
    setViewport(390);
    render(<Page />);
    expect(screen.getByRole("region", { name: "Gauge details" })).toBeTruthy();
  });
});

describe("PaneSheet", () => {
  it("opens at half height and the handle toggles it to a peek and back", async () => {
    const user = userEvent.setup();
    const { container } = render(<PaneSheet label="Details" onClose={() => {}}>content</PaneSheet>);
    const sheet = () => container.querySelector("[data-bottom-sheet]")!;
    expect(sheet().getAttribute("data-bottom-sheet")).toBe("half");

    await user.click(screen.getByRole("button", { name: "Collapse the settings sheet" }));
    expect(sheet().getAttribute("data-bottom-sheet")).toBe("peek");

    await user.click(screen.getByRole("button", { name: "Expand the settings sheet" }));
    expect(sheet().getAttribute("data-bottom-sheet")).toBe("half");
  });

  it("the handle takes Enter and Space from the keyboard", async () => {
    const user = userEvent.setup();
    const { container } = render(<PaneSheet label="Details" onClose={() => {}}>content</PaneSheet>);
    screen.getByRole("button", { name: "Collapse the settings sheet" }).focus();
    await user.keyboard("{Enter}");
    expect(container.querySelector("[data-bottom-sheet]")!.getAttribute("data-bottom-sheet")).toBe("peek");
    await user.keyboard(" ");
    expect(container.querySelector("[data-bottom-sheet]")!.getAttribute("data-bottom-sheet")).toBe("half");
  });

  it("closes from the Close button", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<PaneSheet label="Details" onClose={onClose}>content</PaneSheet>);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on Escape: it is a pane over its page, not a modal dialog", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<PaneSheet label="Details" onClose={onClose}>content</PaneSheet>);
    screen.getByRole("button", { name: "Close" }).focus();
    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("is mounted and unmounted by its owner's state", async () => {
    const user = userEvent.setup();
    function Owner() {
      const [open, setOpen] = useState(true);
      return open ? <PaneSheet label="Details" onClose={() => setOpen(false)}>x</PaneSheet> : <p>closed</p>;
    }
    render(<Owner />);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("region", { name: "Details" })).toBeNull();
    expect(screen.getByText("closed")).toBeTruthy();
  });
});

// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { createPortal } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { PaneSheet } from "@/components/studio/pane-sheet";

describe("PaneSheet Escape", () => {
  it("closes on Escape from inside, but not from a popup portalled out of it", () => {
    const onClose = vi.fn();
    render(
      <PaneSheet label="Detail" onClose={onClose}>
        <button>inside</button>
        {createPortal(<button>popup</button>, document.body)}
      </PaneSheet>
    );
    fireEvent.keyDown(screen.getByText("popup"), { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("region", { name: "Detail" }), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

// @vitest-environment happy-dom
// Apply to other screens… sits beside Save in Theme's header (L47): open, tick a screen, Apply.
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ThemeApplyScreens } from "@/components/studio/theme-look-card";

describe("Apply to other screens… in the header", () => {
  it("applies the screen's theme to the ticked screens in three clicks and closes", async () => {
    const onApply = vi.fn();
    const screens = [
      { id: "side", name: "Side", size: "800×480" },
      { id: "strip", name: "Strip", size: "1920×480" },
    ];
    render(<ThemeApplyScreens name="My Desk" screens={screens} onApply={onApply} />);
    fireEvent.click(screen.getByRole("button", { name: /Apply to other screens/ }));
    fireEvent.click(await screen.findByRole("checkbox", { name: /Strip/ }));
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));
    expect(onApply).toHaveBeenCalledWith(["strip"]);
    await waitFor(() => expect(screen.queryByRole("group", { name: "Other screens" })).toBeNull());
  });
});

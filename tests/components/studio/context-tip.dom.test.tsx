// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ContextTip } from "@/components/studio/context-tip";
import { TIPS, TIPS_KEY } from "@/components/studio/quick-tips";

describe("a contextual tip", () => {
  beforeEach(() => localStorage.clear());

  it("shows its line, with a lone ? as a keycap", () => {
    render(<ContextTip text={TIPS.menu} />);
    expect(screen.getByTestId("context-tip").textContent).toContain("Right-click for more");
    expect(screen.getByText("?").tagName).toBe("KBD");
  });

  it("is dismissed once, remembered, and hides every tip on the next mount", () => {
    const { unmount } = render(<ContextTip text={TIPS.move} />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss tip" }));
    expect(screen.queryByTestId("context-tip")).toBeNull();
    expect(localStorage.getItem(TIPS_KEY)).toBe("1");
    unmount();
    render(<ContextTip text={TIPS.menu} />);
    expect(screen.queryByTestId("context-tip")).toBeNull();
  });
});

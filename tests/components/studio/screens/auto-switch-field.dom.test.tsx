// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AutoSwitchField } from "@/components/studio/screens/auto-switch-field";

afterEach(cleanup);

describe("a screen's auto-switch programs", () => {
  it("commit once on Enter, cleaned, and an empty list turns the rule off", () => {
    const onCommit = vi.fn();
    const { rerender } = render(<AutoSwitchField value={undefined} onCommit={onCommit} />);
    const input = screen.getByRole("textbox", { name: "Programs" }) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Code.exe, obs64, Code.exe, " } });
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenLastCalledWith({ exe: ["Code.exe", "obs64"] });
    rerender(<AutoSwitchField value={{ exe: ["Code.exe", "obs64"] }} onCommit={onCommit} />);
    expect(input.value).toBe("Code.exe, obs64");
    fireEvent.change(input, { target: { value: " " } });
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenLastCalledWith(undefined);
  });

  it("keeps a name still being typed when the drawer closes", () => {
    const onCommit = vi.fn();
    const { unmount } = render(<AutoSwitchField value={undefined} onCommit={onCommit} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Programs" }), { target: { value: "Teams.exe" } });
    unmount();
    expect(onCommit).toHaveBeenCalledWith({ exe: ["Teams.exe"] });
  });
});

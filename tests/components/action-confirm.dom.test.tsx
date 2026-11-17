// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ActionLayer, { confirmCopy, NOTE_MS } from "@/components/action-confirm";
import { HOLD_MS } from "@/components/hold-button";
import type { TouchAction } from "@/lib/pinned";

// The kiosk's hold-to-confirm card (pinned layer P7): the whole command shows, Cancel goes back, and the action runs only
// after the hold, from a finger or the keyboard; a lift before it runs nothing. A run's note goes after a while.

const ROOM = { left: 84, right: 0, top: 0, bottom: 0 };
const LONG = `powershell.exe -NoProfile -Command "${"Get-Process | Sort-Object CPU -Descending | Select-Object -First 5; ".repeat(4)}"`;
const RUN: TouchAction = { op: "run", command: LONG, confirm: true };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const draw = (go = vi.fn(), onCancel = vi.fn(), note: string | null = null, onNoteDone = vi.fn()) =>
  render(<ActionLayer confirm={{ action: RUN, go }} note={note} room={ROOM} onCancel={onCancel} onNoteDone={onNoteDone} />);

describe("the hold-to-confirm card", () => {
  it("shows the whole command, never cut, centred on the page area", () => {
    const { container } = draw();
    expect(screen.getByRole("dialog", { name: "Run this command?" })).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "The command" }) as HTMLTextAreaElement).value).toBe(LONG);
    const area = container.firstElementChild as HTMLElement;
    expect(area.style.left).toBe("84px");
  });

  it("runs the action only after a full hold, and nothing on an early lift or Cancel", () => {
    const go = vi.fn();
    const onCancel = vi.fn();
    draw(go, onCancel);
    const hold = screen.getByRole("button", { name: /^Hold to run/ });
    fireEvent.pointerDown(hold);
    act(() => vi.advanceTimersByTime(HOLD_MS / 2));
    fireEvent.pointerUp(hold);
    act(() => vi.advanceTimersByTime(HOLD_MS));
    expect(go).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
    fireEvent.pointerDown(hold);
    act(() => vi.advanceTimersByTime(HOLD_MS + 50));
    expect(go).toHaveBeenCalledOnce();
  });

  it("takes the hold from the keyboard too: Space kept down for the hold", () => {
    const go = vi.fn();
    draw(go);
    const hold = screen.getByRole("button", { name: /^Hold to run/ });
    fireEvent.keyDown(hold, { key: " " });
    act(() => vi.advanceTimersByTime(HOLD_MS + 50));
    expect(go).toHaveBeenCalledOnce();
  });

  it("asks OBS's go live in words, and lets a note go after a while", () => {
    expect(confirmCopy({ op: "obs", body: { op: "stream", state: "toggle" } }).hold).toBe("Hold to go live");
    expect(confirmCopy({ op: "obs", body: { op: "stream", state: "stop" } }).title).toBe("Stop the stream in OBS?");
    const done = vi.fn();
    render(<ActionLayer confirm={null} note="Test mode: would run calc.exe" room={ROOM} onCancel={vi.fn()} onNoteDone={done} />);
    expect(screen.getByRole("status").textContent).toBe("Test mode: would run calc.exe");
    act(() => vi.advanceTimersByTime(NOTE_MS));
    expect(done).toHaveBeenCalledOnce();
  });
});

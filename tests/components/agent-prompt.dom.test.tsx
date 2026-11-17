// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AgentPrompt, { commandRows, promptHeight } from "@/components/agent-prompt";
import { HOLD_MS } from "@/components/hold-button";
import { resetAgentRequests, type AgentRequest } from "@/lib/agent-requests";

// The kiosk's agent prompt (pinned layer P8): the whole command shows, Deny is a tap, Allow is a full hold from a finger or
// the keyboard, an early lift answers nothing, and nothing answers by itself when the wait runs out.

const ROOM = { left: 84, right: 0, top: 0, bottom: 0 };
const LONG = `npm run build && npm run verify -- --feature dev-fixtures ${"&& echo again ".repeat(20)}`;
const REQUEST: AgentRequest = { id: "r1", agent: "claude", session: "abc", project: "InfoPanel.Studio", tool: "Bash", text: LONG, until: 25_000 };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"] });
  vi.setSystemTime(0);
  fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  resetAgentRequests();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const answers = () => fetchMock.mock.calls.map(([url, init]) => [url, JSON.parse(String((init as RequestInit).body))]);

describe("the agent prompt", () => {
  it("shows the whole command, never cut, at the top of the page area beside the pinned items", () => {
    const { container } = render(<AgentPrompt requests={[REQUEST]} room={ROOM} />);
    expect(screen.getByRole("status").textContent).toBe("Claude Code wants to run a command");
    expect((screen.getByRole("textbox", { name: "The command" }) as HTMLTextAreaElement).value).toBe(LONG);
    expect(commandRows(LONG)).toBe(4);
    const area = container.firstElementChild as HTMLElement;
    expect(area.style.left).toBe("84px");
    expect(area.style.top).toBe("12px");
    expect((area.firstElementChild as HTMLElement).style.height).toBe(`${promptHeight(4)}px`);
    expect(screen.getByText("Answer here for 25 s, then in the terminal.")).toBeTruthy();
  });

  it("denies on a tap of Deny", async () => {
    render(<AgentPrompt requests={[REQUEST]} room={ROOM} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Deny" }));
    });
    expect(answers()).toEqual([["/api/agents/answer", { id: "r1", behavior: "deny" }]]);
  });

  it("allows only after a full hold, from a finger or the keyboard", async () => {
    render(<AgentPrompt requests={[REQUEST]} room={ROOM} />);
    const hold = screen.getByRole("button", { name: /^Hold to allow/ });
    fireEvent.pointerDown(hold);
    act(() => vi.advanceTimersByTime(HOLD_MS / 2));
    fireEvent.pointerUp(hold);
    act(() => vi.advanceTimersByTime(HOLD_MS));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.keyDown(hold, { key: "Enter" });
    await act(async () => {
      vi.advanceTimersByTime(HOLD_MS + 50);
    });
    expect(answers()).toEqual([["/api/agents/answer", { id: "r1", behavior: "allow" }]]);
  });

  it("counts down, and when the wait is over sends you to the terminal without answering", () => {
    render(<AgentPrompt requests={[REQUEST]} room={ROOM} />);
    act(() => vi.advanceTimersByTime(7_000));
    expect(screen.getByText("Answer here for 18 s, then in the terminal.")).toBeTruthy();
    act(() => vi.advanceTimersByTime(20_000));
    expect(screen.getByText("Answer in the terminal.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stands aside for a request whose session card on the page has the answers", () => {
    const card = document.createElement("div");
    card.setAttribute("data-agent-card", "abc");
    card.setAttribute("data-answers", "");
    document.body.append(card);
    const { container } = render(<AgentPrompt requests={[REQUEST]} room={ROOM} />);
    expect(container.innerHTML).toBe("");
    card.remove();
  });

  it("names a tool that isn't a shell", () => {
    render(<AgentPrompt requests={[{ ...REQUEST, agent: "codex", tool: "apply_patch", text: "src/a.ts" }]} room={ROOM} />);
    expect(screen.getByRole("status").textContent).toBe("Codex wants to use apply_patch");
  });
});

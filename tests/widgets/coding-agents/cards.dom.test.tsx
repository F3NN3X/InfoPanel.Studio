// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HOLD_MS } from "@/components/hold-button";
import { resetAgentRequests } from "@/lib/agent-requests";
import type { AgentSession } from "@/lib/agents";
import { doingLine, SessionCards, stateLine } from "@/widgets/coding-agents/cards";

// Coding Agents' Sessions view (pinned layer P8, owner Q7): a card per session, and on this PC's kiosk the answers for the
// one whose permission request it holds. Elsewhere a waiting card offers nothing.

const WAITING: AgentSession = { key: "abc", agent: "claude", project: "InfoPanel.Studio", state: "waiting", since: 0, tool: "Bash" };
const WORKING: AgentSession = { key: "def", agent: "codex", project: "InfoPanel.Studio", state: "working", since: 0, tool: "apply_patch" };
const REQUESTS = { requests: [{ id: "r1", agent: "claude", session: "abc", project: "InfoPanel.Studio", tool: "Bash", text: "npm run build", left: 20_000 }] };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });
  fetchMock = vi.fn(async (url: string) => new Response(url === "/api/agents/requests" ? JSON.stringify(REQUESTS) : "{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  resetAgentRequests();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.history.replaceState(null, "", "/");
});

describe("the session cards", () => {
  it("say what each session is doing", () => {
    expect(stateLine({ ...WORKING, state: "idle" })).toBe("idle");
    expect(doingLine(WAITING, undefined)).toBe("Wants to use Bash");
    expect(doingLine(WORKING, undefined)).toBe("Using apply_patch");
    expect(doingLine({ ...WORKING, state: "error" }, undefined)).toBe("Stopped with an error");
  });

  it("answer the waiting session's request on the kiosk: Deny on a tap, Allow on a full hold", async () => {
    window.history.replaceState(null, "", "/?kiosk=1");
    render(<SessionCards sessions={[WAITING, WORKING]} rows={3} w={900} />);
    await act(async () => {});
    expect(screen.getByText("One needs you")).toBeTruthy();
    expect((screen.getByRole("textbox", { name: "The command" }) as HTMLInputElement).value).toBe("npm run build");
    // only the waiting card has the answers
    expect(screen.getAllByRole("button", { name: "Deny" })).toHaveLength(1);
    const hold = screen.getByRole("button", { name: /^Hold to allow/ });
    fireEvent.pointerDown(hold);
    await act(async () => {
      vi.advanceTimersByTime(HOLD_MS + 50);
    });
    const answer = fetchMock.mock.calls.find(([url]) => url === "/api/agents/answer") ?? [];
    expect(JSON.parse(String((answer[1] as RequestInit | undefined)?.body))).toEqual({ id: "r1", behavior: "allow" });
  });

  it("offer nothing off the kiosk, and ask the server nothing there", async () => {
    render(<SessionCards sessions={[WAITING]} rows={3} w={400} />);
    await act(async () => {});
    expect(screen.queryByRole("button", { name: "Deny" })).toBeNull();
    expect(screen.getByText("Wants to use Bash")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

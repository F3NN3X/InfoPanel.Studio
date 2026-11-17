// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANSWER_ELSEWHERE } from "@/lib/agent-requests";
import type { AgentSession } from "@/lib/agents";
import { doingLine, SessionCards, stateLine } from "@/widgets/coding-agents/cards";

// Coding Agents' Sessions view (pinned layer P8, owner Q7): a card per session. A card never answers a permission request
// (security review: it can't show everything the tool would get, and widget code runs on its page); a waiting card says
// where to answer.

const WAITING: AgentSession = { key: "abc", agent: "claude", project: "InfoPanel.Studio", state: "waiting", since: 0, tool: "Bash" };
const WORKING: AgentSession = { key: "def", agent: "codex", project: "InfoPanel.Studio", state: "working", since: 0, tool: "apply_patch" };

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

describe("the session cards", () => {
  it("say what each session is doing", () => {
    expect(stateLine({ ...WORKING, state: "idle" })).toBe("idle");
    expect(doingLine(WAITING)).toBe("Wants to use Bash");
    expect(doingLine(WORKING)).toBe("Using apply_patch");
    expect(doingLine({ ...WORKING, state: "error" })).toBe("Stopped with an error");
  });

  it("offer no answer, even on the kiosk: a waiting card sends you to the prompt or the terminal", () => {
    window.history.replaceState(null, "", "/?kiosk=1");
    render(<SessionCards sessions={[WAITING, WORKING]} rows={3} />);
    expect(screen.getByText("One needs you")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getAllByText(ANSWER_ELSEWHERE)).toHaveLength(1);
    // and nothing is asked of the server for it
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

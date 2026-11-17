import { describe, expect, it } from "vitest";
import { parseRequests, requestTitle, secondsLeft } from "@/lib/agent-requests";

// What the prompt, the cards and Settings share about an agent's permission request (pinned layer P8).

const ONE = { requests: [{ id: "r1", agent: "claude", session: "abc", project: "p", tool: "Bash", text: "ls\n  -la", left: 20_000 }] };

describe("parseRequests", () => {
  it("keeps well-formed requests, text as it came, and stamps when each one's wait ends", () => {
    const got = parseRequests({ requests: [...ONE.requests, { id: 5 }, { id: "x", agent: "gemini" }, null] }, 1_000);
    expect(got).toEqual([{ id: "r1", agent: "claude", session: "abc", project: "p", tool: "Bash", text: "ls\n  -la", until: 21_000 }]);
    expect(secondsLeft(got[0], 1_000)).toBe(20);
    expect(secondsLeft(got[0], 30_000)).toBe(0);
    expect(parseRequests(null, 0)).toEqual([]);
    expect(parseRequests({ requests: [{ ...ONE.requests[0], left: "soon" }] }, 5)[0].until).toBe(5);
  });
});

describe("requestTitle", () => {
  it("says a shell runs a command and names any other tool", () => {
    expect(requestTitle("Claude Code", { tool: "Bash" })).toBe("Claude Code wants to run a command");
    expect(requestTitle("Codex", { tool: "Edit" })).toBe("Codex wants to use Edit");
  });
});

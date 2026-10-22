import { describe, expect, it } from "vitest";
import type { AgentSession } from "@/lib/agents";
import { limitRows, statusWord } from "@/widgets/CodingAgents/summary";

const session = (over: Partial<AgentSession>): AgentSession => ({ key: "k", agent: "claude", project: "repo", state: "working", since: 0, ...over });

describe("statusWord", () => {
  it.each([
    [{ state: "working" }, "busy"],
    [{ state: "working", tool: "Bash" }, "shell"],
    [{ state: "working", tool: "Edit" }, "edit"],
    [{ state: "waiting", tool: "Bash" }, "waiting"],
    [{ state: "done" }, "done"],
    [{ state: "idle" }, "idle"],
  ] as const)("%j is %s", (over, word) => {
    expect(statusWord(session({ ...over }))).toBe(word);
  });
});

describe("limitRows", () => {
  const claude = { fiveHour: { used: 19 }, sevenDay: { used: 40 }, extra: [{ name: "opus", used: 55 }], at: 1 };
  it("labels the windows, one row per extra, without an agent prefix for one agent", () => {
    expect(limitRows([["claude", claude]], 1).map((r) => r.label)).toEqual(["Session (5h)", "Weekly", "Opus weekly"]);
  });
  it("prefixes the agent when two show", () => {
    const rows = limitRows([["claude", claude], ["codex", { fiveHour: { used: 1 }, at: 1 }]], 1);
    expect(rows.map((r) => r.label)).toContain("Codex · Session (5h)");
    expect(rows[0].label).toBe("Claude · Session (5h)");
  });
});

import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EMPTY_AGENTS, type Agents } from "@/lib/agents";
import CodingAgents, { CodingAgentsView, costText, resetText, shownAgents } from "./CodingAgents";

/** The markup without React's text separators, so "82<!-- -->%" reads as "82%". */
const text = (el: Parameters<typeof renderToString>[0]) => renderToString(el).replace(/<!-- -->/g, "");

const now = Date.now();
const AGENTS: Agents = {
  sessions: [
    { key: "a", agent: "claude", project: "InfoPanel.Dashboard", state: "working", since: now - 60_000, turnStart: now - 180_000, tool: "Bash", context: 37 },
    { key: "b", agent: "codex", project: "api", state: "waiting", since: now - 5000, tool: "shell" },
  ],
  plan: { claude: { fiveHour: { used: 82, resetsAt: now + 3_600_000 }, sevenDay: { used: 40 }, at: now } },
  usage: { claude: { today: 146_000_000, history: 4e9, days: [{ day: "2026-10-14", input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 4e8 }, { day: "2026-10-15", input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 1.46e8 }] } },
};

describe("Coding Agents", () => {
  it("shows the plan, the sessions (waiting first) and today's tokens", () => {
    const html = text(<CodingAgentsView data={{}} all={AGENTS} />);
    expect(html).toContain(">82%<");
    expect(html).toContain("40%");
    expect(html.indexOf("api")).toBeLessThan(html.indexOf("InfoPanel.Dashboard"));
    expect(html).toContain("needs you · shell");
    expect(html).toContain("Bash · 3m");
    expect(html).toContain("37% ctx");
    expect(html).toContain("146M");
    expect(html).toContain("island-pulse");
  });

  it("keeps to one agent and hides what is switched off", () => {
    const html = text(<CodingAgentsView data={{}} all={AGENTS} agents="codex" showPlan={false} showUsage={false} />);
    expect(html).toContain("api");
    expect(html).not.toContain("InfoPanel.Dashboard");
    expect(html).not.toContain(">82%<");
    expect(html).not.toContain("tokens");
  });

  it("says no agent is connected before any data", () => {
    expect(renderToString(<CodingAgents data={{}} />)).toContain("No agent connected yet");
    expect(shownAgents(EMPTY_AGENTS, "both")).toEqual([]);
    expect(shownAgents(AGENTS, "both")).toEqual(["claude", "codex"]);
  });

  it("writes a reset later today as a time and a later one with its day", () => {
    const base = new Date(2026, 9, 15, 10, 0).getTime();
    expect(resetText(base + 5 * 3_600_000, base)).toMatch(/^\d{2}[:.]\d{2}/);
    expect(resetText(base + 3 * 86_400_000, base)).toMatch(/^\D+ \d{2}[:.]\d{2}/);
  });

  it("formats a session's cost", () => {
    expect(costText(0.42)).toBe("$0.42");
    expect(costText(3.1)).toBe("$3.10");
    expect(costText(12.4)).toBe("$12");
    expect(costText(9.996)).toBe("$10");
    expect(costText(0.004)).toBe("");
    expect(costText(-1)).toBe("");
    expect(costText(0)).toBe("");
    expect(costText(undefined)).toBe("");
  });

  it("shows a session's model and cost by the width it has", () => {
    // Unmeasured: 400 wide, so the cost shows and the model (from 420) does not.
    const priced = { ...AGENTS, sessions: [{ ...AGENTS.sessions[0], cost: 3.1, model: "opus-5-5" }] };
    const html = text(<CodingAgentsView data={{}} all={priced} />);
    expect(html).toContain("37% ctx");
    expect(html).not.toContain(">Opus 5.5<");
    expect(html).toContain("$3.10");
    const none = text(<CodingAgentsView data={{}} all={{ ...priced, sessions: [{ ...priced.sessions[0], cost: 0 }] }} />);
    expect(none).not.toContain("$");
  });
});

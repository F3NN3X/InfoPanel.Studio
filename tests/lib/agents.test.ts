import { describe, expect, it } from "vitest";
import { bySalience, EMPTY_AGENTS, FIVE_HOUR_MS, modelLabel, paceHit, parseAgents, planView, SEVEN_DAY_MS, sessionStatus, shortDuration, shortTokens, type AgentSession } from "@/lib/agents";
import { parseExtras } from "@/lib/extras";
import { AGENT_DONE_MIN_MS, agentsUpdate } from "@/lib/island/dashboard-notices";

const session = (over: Partial<AgentSession> = {}): AgentSession => ({ key: "k1", agent: "claude", project: "repo", state: "working", since: 0, ...over });

describe("parseAgents", () => {
  it("reads a plan's extra windows and version, ignoring malformed ones", () => {
    const a = parseAgents({ plan: { claude: { fiveHour: { used: 5 }, extra: [{ name: "opus", used: 40, resetsAt: 9 }, { name: "x", used: "no" }, { used: 3 }, "junk"], version: "2.1.220", at: 1 }, codex: { fiveHour: { used: 1 }, extra: "no", version: 7 } } });
    expect(a.plan.claude).toEqual({ fiveHour: { used: 5 }, extra: [{ name: "opus", used: 40, resetsAt: 9 }], version: "2.1.220", at: 1 });
    expect(a.plan.codex).toEqual({ fiveHour: { used: 1 }, at: 0 });
  });

  it("keeps well-formed sessions, plans and usage and drops the rest", () => {
    const a = parseAgents({
      sessions: [
        { key: "k1", agent: "claude", project: "repo", state: "working", since: 5, turnStart: 4, tool: "Bash", context: 40, prompt: "secret" },
        { key: "k2", agent: "gemini", state: "working", since: 1 },
        { key: "k3", agent: "codex", state: "thinking", since: 1 },
        "junk",
      ],
      plan: { claude: { fiveHour: { used: 182, resetsAt: 9 }, at: 1 }, codex: { fiveHour: { used: "x" } } },
      usage: { claude: { today: 10, history: 30, days: [{ day: "2026-10-15", total: 10 }, { total: 3 }] } },
    });
    expect(a.sessions).toEqual([{ key: "k1", agent: "claude", project: "repo", state: "working", since: 5, turnStart: 4, tool: "Bash", context: 40 }]);
    expect(a.plan).toEqual({ claude: { fiveHour: { used: 100, resetsAt: 9 }, at: 1 } });
    expect(a.usage.claude?.days).toEqual([{ day: "2026-10-15", input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 10 }]);
    expect(parseAgents(null)).toEqual(EMPTY_AGENTS);
    expect(parseExtras({}).agents).toEqual(EMPTY_AGENTS);
  });

  it("reads the usage breakdown tolerantly and caps its lists", () => {
    const split = {
      projects: [...Array.from({ length: 8 }, (_, i) => ({ name: `p${i}`, total: 10 - i })), { name: "", total: 1 }, { name: "bad", total: "x" }, "junk"],
      models: [{ name: "opus-5-5", total: 9 }],
    };
    const a = parseAgents({ usage: { claude: { today: 1, history: 1, days: [], breakdown: { today: split, week: { projects: "no", models: [] } } } } });
    expect(a.usage.claude?.breakdown?.today?.projects).toHaveLength(5);
    expect(a.usage.claude?.breakdown?.today?.models).toEqual([{ name: "opus-5-5", total: 9 }]);
    expect(a.usage.claude?.breakdown?.week).toBeUndefined();
    expect(parseAgents({ usage: { claude: { today: 1, history: 1, days: [], breakdown: 5 } } }).usage.claude?.breakdown).toBeUndefined();
  });

  it("labels models for display", () => {
    expect(["opus-5-5", "sonnet-5", "haiku-5-5", "fable-5-1", "gpt-5.5", "Opus 5.5"].map(modelLabel)).toEqual(["Opus 5.5", "Sonnet 5", "Haiku 5.5", "Fable 5.1", "gpt-5.5", "Opus 5.5"]);
  });

  it("formats durations, token counts and a session's status", () => {
    expect([shortDuration(45_000), shortDuration(180_000), shortDuration(3_900_000), shortDuration(7_200_000)]).toEqual(["45s", "3m", "1h 5m", "2h"]);
    expect([shortTokens(512), shortTokens(830_000), shortTokens(1_234_567), shortTokens(4_380_000_000)]).toEqual(["512", "830k", "1.2M", "4.4B"]);
    expect(sessionStatus(session({ tool: "Bash", turnStart: 0 }), 180_000)).toBe("Bash · 3m");
    expect(sessionStatus(session({ state: "waiting", tool: "Edit" }), 0)).toBe("needs you · Edit");
    expect(sessionStatus(session({ state: "done", lastTurnMs: 240_000 }), 0)).toBe("done in 4m");
  });

  it("orders sessions waiting first, then working, newest first", () => {
    const list = [session({ key: "a", state: "done", since: 9 }), session({ key: "b", state: "working", since: 1 }), session({ key: "c", state: "waiting", since: 0 }), session({ key: "d", state: "working", since: 5 })];
    expect(list.sort(bySalience).map((s) => s.key)).toEqual(["c", "d", "b", "a"]);
  });
});

describe("agentsUpdate", () => {
  const agents = (sessions: AgentSession[], plan = {}) => ({ sessions, plan, usage: {} });

  it("shows the most urgent session beside the time, pulsing while it works, with its plan as progress", () => {
    const u = agentsUpdate(null, agents([session({ tool: "Bash", turnStart: 0 }), session({ key: "k2", agent: "codex", project: "api", state: "waiting" })], { codex: { fiveHour: { used: 40 }, at: 0 } }), 60_000);
    expect(u.activity).toMatchObject({ title: "Codex · api +1", subtitle: "needs you", pulse: false, priority: 3, progress: 0.4 });
    expect(u.waiting).toEqual([{ id: "k2", severity: "warning", title: "Codex needs you", body: "api", badge: true, ttl: 10_000 }]);
    // Nothing is announced on the first state (it is the baseline).
    expect(u.notices).toEqual([]);
    expect(agentsUpdate(null, agents([session()]), 0).activity).toMatchObject({ title: "Claude · repo", pulse: true, priority: 1 });
    expect(agentsUpdate(null, agents([session({ state: "done" })]), 0).activity).toBeNull();
  });

  it("announces a long turn finishing and a failure, not a short reply", () => {
    const before = agents([session()]);
    const long = agentsUpdate(before, agents([session({ state: "done", since: 5, lastTurnMs: AGENT_DONE_MIN_MS })]), 10);
    expect(long.notices).toEqual([{ id: "done:k1:5", severity: "info", title: "Claude finished", body: "repo · in 20s", ttl: 5000 }]);
    expect(agentsUpdate(before, agents([session({ state: "done", lastTurnMs: 3000 })]), 10).notices).toEqual([]);
    expect(agentsUpdate(before, agents([session({ state: "error", since: 7 })]), 10).notices?.[0]).toMatchObject({ severity: "warning", title: "Claude stopped with an error" });
  });

  it("warns once when a plan window passes 80 % and again at 95 %", () => {
    const at = (used: number) => agents([], { claude: { fiveHour: { used }, at: 0 } });
    expect(agentsUpdate(at(70), at(82), 0).notices?.[0]).toMatchObject({ title: "Claude plan at 82%", body: "5-hour limit" });
    expect(agentsUpdate(at(82), at(90), 0).notices).toEqual([]);
    expect(agentsUpdate(at(70), at(96), 0).notices).toHaveLength(1);
    expect(agentsUpdate(at(70), at(96), 0).notices?.[0].id).toContain(":95:");
  });
});

describe("modelLabel", () => {
  it("drops a trailing parenthetical", () => {
    expect(modelLabel("Opus 5.5 (1M context)")).toBe("Opus 5.5");
    expect(modelLabel("opus-5-5 (1M)")).toBe("Opus 5.5");
  });
});

describe("planView", () => {
  const now = 1_000_000_000;
  it("reads a fresh window as it is", () => {
    expect(planView({ used: 40, resetsAt: now + 60_000 }, now - 60_000, now)).toEqual({ used: 40, reset: false, stale: false, age: 60_000 });
  });
  it("zeroes a window whose reset time has passed", () => {
    expect(planView({ used: 90, resetsAt: now - 1 }, now - 60_000, now)).toMatchObject({ used: 0, reset: true });
    expect(planView({ used: 90, resetsAt: now }, now - 60_000, now)).toMatchObject({ used: 0, reset: true });
    expect(planView({ used: 90 }, now - 60_000, now)).toMatchObject({ used: 90, reset: false });
  });
  it("does not call a report with no time stale", () => {
    expect(planView({ used: 40 }, 0, now)).toMatchObject({ stale: false, age: 0 });
  });
  it("marks a report older than ten minutes stale", () => {
    expect(planView({ used: 40 }, now - 10 * 60_000, now).stale).toBe(false);
    expect(planView({ used: 40 }, now - 12 * 60_000, now)).toMatchObject({ stale: true, age: 12 * 60_000 });
  });
});

describe("paceHit", () => {
  const at = 1_000_000_000;
  const resetsAt = at + 3 * 3_600_000; // two hours into the five
  it("projects the window's average rate to 100 %", () => {
    expect(paceHit({ used: 50, resetsAt }, at, FIVE_HOUR_MS)).toBe(at + 2 * 3_600_000);
  });
  it("gives nothing when it would not run out before the reset", () => {
    expect(paceHit({ used: 40, resetsAt }, at, FIVE_HOUR_MS)).toBeNull();
    expect(paceHit({ used: 20, resetsAt }, at, FIVE_HOUR_MS)).toBeNull();
  });
  it("gives nothing without a reset time, too early, with little use or when full", () => {
    expect(paceHit({ used: 50 }, at, FIVE_HOUR_MS)).toBeNull();
    expect(paceHit({ used: 50, resetsAt: at + FIVE_HOUR_MS - 10 * 60_000 }, at, FIVE_HOUR_MS)).toBeNull();
    expect(paceHit({ used: 4, resetsAt }, at, FIVE_HOUR_MS)).toBeNull();
    expect(paceHit({ used: 100, resetsAt }, at, FIVE_HOUR_MS)).toBeNull();
  });
  it("waits six hours into the week", () => {
    expect(paceHit({ used: 30, resetsAt: at + SEVEN_DAY_MS - 5 * 3_600_000 }, at, SEVEN_DAY_MS)).toBeNull();
    expect(paceHit({ used: 80, resetsAt: at + SEVEN_DAY_MS - 12 * 3_600_000 }, at, SEVEN_DAY_MS)).toBe(at + 3 * 3_600_000);
  });
});

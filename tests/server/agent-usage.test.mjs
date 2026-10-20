import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { claudeLine, codexContext, codexLine, createAgentUsage, dayKey, modelOf } from "../../server/agent-usage.mjs";

const assistant = (requestId, timestamp, usage) =>
  JSON.stringify({ type: "assistant", requestId, timestamp, message: { model: "m", content: [{ type: "text", text: "secret" }], usage } });
const tokenCount = (timestamp, total, rate_limits = null) =>
  JSON.stringify({ timestamp, type: "event_msg", payload: { type: "token_count", info: total ? { total_token_usage: total } : null, rate_limits } });

describe("transcript lines", () => {
  it("reads an assistant line's tokens and request id, and skips everything else", () => {
    const u = claudeLine(assistant("r1", "2026-10-15T10:00:00Z", { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 20 }));
    expect(u).toEqual({ id: "r1", at: Date.parse("2026-10-15T10:00:00Z"), input: 10, output: 5, cacheRead: 100, cacheWrite: 20, project: "", model: "m" });
    expect(claudeLine(JSON.stringify({ type: "user", timestamp: "2026-10-15T10:00:00Z", message: { content: "hi" } }))).toBeNull();
    expect(claudeLine("{not json")).toBeNull();
  });

  it("reads a Codex token count's cumulative tokens (cached split out) and its limits", () => {
    const c = codexLine(tokenCount("2026-10-15T10:00:00Z", { input_tokens: 100, cached_input_tokens: 60, output_tokens: 7, total_tokens: 107 }, { primary: { used_percent: 3 } }));
    expect(c).toEqual({ at: Date.parse("2026-10-15T10:00:00Z"), total: { input: 40, output: 7, cacheRead: 60, cacheWrite: 0 }, limits: { primary: { used_percent: 3 } } });
    expect(codexLine(JSON.stringify({ type: "event_msg", payload: { type: "agent_message" } }))).toBeNull();
  });
});

describe("project and model", () => {
  it("shortens model ids", () => {
    expect([modelOf("claude-opus-5-5"), modelOf("claude-sonnet-5-5-20260901"), modelOf("gpt-5.5"), modelOf("<synthetic>"), modelOf(undefined)]).toEqual(["opus-5-5", "sonnet-5-5", "gpt-5.5", "", ""]);
    expect(modelOf("x".repeat(60))).toHaveLength(40);
  });

  it("reads a Claude line's project folder and model, never the path", () => {
    const line = JSON.stringify({ type: "assistant", cwd: "E:\\GitHub\\repo-a", requestId: "r", timestamp: "2026-10-15T10:00:00Z", message: { model: "claude-opus-5-5", usage: { input_tokens: 1 } } });
    expect(claudeLine(line)).toMatchObject({ project: "repo-a", model: "opus-5-5" });
    expect(JSON.stringify(claudeLine(line))).not.toContain("GitHub");
  });

  it("reads a Codex rollout's context lines", () => {
    expect(codexContext(JSON.stringify({ type: "session_meta", payload: { cwd: "C:\\work\\proj" } }))).toEqual({ project: "proj", model: "" });
    expect(codexContext(JSON.stringify({ type: "turn_context", payload: { cwd: "/home/me/proj", model: "gpt-5.5" } }))).toEqual({ project: "proj", model: "gpt-5.5" });
    expect(codexContext(JSON.stringify({ type: "event_msg", payload: {} }))).toBeNull();
    expect(codexContext("{nope")).toBeNull();
  });
});

describe("createAgentUsage", () => {
  let home;
  afterEach(() => home && fs.rmSync(home, { recursive: true, force: true }));

  it("sums tokens per day across sessions, counts a repeated request once, and reads appended lines only", async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "agent-usage-"));
    const now = Date.parse("2026-10-15T12:00:00");
    const today = new Date(now).toISOString();
    const yesterday = new Date(now - 86_400_000).toISOString();
    const dir = path.join(home, ".claude", "projects", "E--repo");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "s1.jsonl");
    const u = { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 3, cache_creation_input_tokens: 4 };
    fs.writeFileSync(file, [assistant("a", yesterday, u), assistant("b", today, u), assistant("b", today, u), ""].join("\n"));
    const codexDir = path.join(home, ".codex", "sessions", "2026", "10", "15");
    fs.mkdirSync(codexDir, { recursive: true });
    fs.writeFileSync(
      path.join(codexDir, "rollout-1.jsonl"),
      [tokenCount(today, { input_tokens: 10, output_tokens: 1 }), tokenCount(today, { input_tokens: 30, output_tokens: 4 }, { primary: { used_percent: 9, window_minutes: 300 } }), ""].join("\n")
    );

    const usage = createAgentUsage({ home, now: () => now });
    await usage.scan();
    expect(usage.totals().claude).toEqual({
      today: 10,
      history: 20,
      breakdown: {
        today: { projects: [], models: [{ name: "m", total: 10 }] },
        week: { projects: [], models: [{ name: "m", total: 20 }] },
      },
      days: [
        { day: dayKey(now - 86_400_000), input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 },
        { day: dayKey(now), input: 1, output: 2, cacheRead: 3, cacheWrite: 4, total: 10 },
      ],
    });
    // Codex's totals are cumulative: the day gets the last one (30 + 4), not their sum.
    expect(usage.totals().codex?.today).toBe(34);
    expect(usage.codexLimits()).toEqual({ primary: { used_percent: 9, window_minutes: 300 } });
    expect(usage.codexLimitsAt()).toBe(Date.parse(today));

    // A line appended later counts; one without its newline yet waits.
    fs.appendFileSync(file, assistant("c", today, u) + "\n" + assistant("d", today, u));
    await usage.scan();
    expect(usage.totals().claude?.today).toBe(20);
  });

  it("splits tokens by project and model for today and the week, sorted and capped, without paths", async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "agent-usage-"));
    const now = Date.parse("2026-10-15T12:00:00");
    const at = (daysAgo) => new Date(now - daysAgo * 86_400_000).toISOString();
    const line = (id, ts, cwd, model, tokens) =>
      JSON.stringify({ type: "assistant", requestId: id, timestamp: ts, cwd, message: { model, usage: { input_tokens: tokens } } });
    const dir = path.join(home, ".claude", "projects", "x");
    fs.mkdirSync(dir, { recursive: true });
    const rows = [
      line("1", at(0), "E:\\GitHub\\alpha", "claude-opus-5-5", 100),
      line("2", at(0), "E:\\GitHub\\beta", "claude-sonnet-5-5-20260901", 30),
      line("3", at(3), "E:\\GitHub\\beta", "claude-sonnet-5-5", 50),
      line("4", at(10), "E:\\GitHub\\alpha", "claude-opus-5-5", 999),
      line("5", at(0), "E:\\GitHub\\gone", "<synthetic>", 7),
      line("6", at(0), "", "claude-opus-5-5", 5),
      ...["p1", "p2", "p3", "p4", "p5"].map((p, i) => line(`m${i}`, at(0), `/w/${p}`, "claude-haiku-5", 1)),
    ];
    // A session per row: a session's project is its first cwd.
    rows.forEach((r, i) => fs.writeFileSync(path.join(dir, `s${i}.jsonl`), r + "\n"));
    const codexDir = path.join(home, ".codex", "sessions", "2026", "10", "15");
    fs.mkdirSync(codexDir, { recursive: true });
    const meta = JSON.stringify({ type: "session_meta", payload: { cwd: "C:\\work\\cx" } });
    const turn = JSON.stringify({ type: "turn_context", payload: { cwd: "C:\\work\\cx", model: "gpt-5.5" } });
    fs.writeFileSync(path.join(codexDir, "rollout-1.jsonl"), [meta, turn, tokenCount(at(0), { input_tokens: 20, output_tokens: 0 }), tokenCount(at(0), { input_tokens: 50, output_tokens: 0 }), ""].join("\n"));

    const usage = createAgentUsage({ home, now: () => now });
    await usage.scan();
    const { claude, codex } = usage.totals();
    expect(claude.breakdown.today.projects).toEqual([
      { name: "alpha", total: 100 },
      { name: "beta", total: 30 },
      { name: "gone", total: 7 },
      { name: "p1", total: 1 },
      { name: "p2", total: 1 },
    ]);
    expect(claude.breakdown.today.models).toEqual([
      { name: "opus-5-5", total: 105 },
      { name: "sonnet-5-5", total: 30 },
      { name: "haiku-5", total: 5 },
    ]);
    expect(claude.breakdown.week.projects.slice(0, 2)).toEqual([{ name: "alpha", total: 100 }, { name: "beta", total: 80 }]);
    expect(claude.breakdown.week.projects).toHaveLength(5);
    expect(claude.breakdown.week.models[0]).toEqual({ name: "opus-5-5", total: 105 });
    expect(codex.breakdown.today).toEqual({ projects: [{ name: "cx", total: 50 }], models: [{ name: "gpt-5.5", total: 50 }] });
    const out = JSON.stringify(usage.totals());
    for (const leak of ["GitHub", "work", "/w/", '""']) expect(out).not.toContain(leak);
  });

  it("keeps a session under its first cwd, and a worktree under its repo", async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "agent-usage-"));
    const now = Date.parse("2026-10-15T12:00:00");
    const ts = new Date(now).toISOString();
    const line = (id, cwd) => JSON.stringify({ type: "assistant", requestId: id, timestamp: ts, cwd, message: { model: "claude-opus-5-5", usage: { input_tokens: 10 } } });
    const dir = path.join(home, ".claude", "projects", "x");
    fs.mkdirSync(path.join(dir, "s1", "subagents"), { recursive: true });
    fs.writeFileSync(path.join(dir, "s1.jsonl"), [line("1", "E:\\GitHub\\repo"), line("2", "E:\\GitHub\\repo\\src-tauri"), ""].join("\n"));
    fs.writeFileSync(path.join(dir, "s1", "subagents", "agent-a1.jsonl"), [line("3", "E:\\GitHub\\repo\\.claude\\worktrees\\agent-a1"), ""].join("\n"));
    const usage = createAgentUsage({ home, now: () => now });
    await usage.scan();
    expect(usage.totals().claude.breakdown.today.projects).toEqual([{ name: "repo", total: 30 }]);
  });

  it("calls onScan after each scan, with the new totals in place", async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "agent-usage-"));
    const now = Date.parse("2026-10-15T12:00:00");
    const dir = path.join(home, ".claude", "projects", "x");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "s.jsonl"), assistant("r1", new Date(now).toISOString(), { input_tokens: 7 }) + "\n");
    const seen = [];
    const usage = createAgentUsage({ home, now: () => now, onScan: () => seen.push(usage.totals().claude?.today) });
    await usage.scan();
    expect(seen).toEqual([7]);
  });

  it("is empty without any agent folders", async () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "agent-usage-"));
    const usage = createAgentUsage({ home });
    await usage.scan();
    expect(usage.totals()).toEqual({});
    expect(usage.codexLimits()).toBeNull();
  });
});

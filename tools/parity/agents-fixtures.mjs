// Parity cases for the coding agents (tests/fixtures/parity/{agents,agent-usage,claude-sessions}.json): the hook reducer,
// the statusline and Codex plan, the Claude session merge, the public form, the transcript lines and the scan to totals,
// and the session-file parser. The scans read a temp home the generator builds (never the real one) and run in
// Europe/Oslo, the zone the Rust side pins for the local day.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAgentUsage, claudeLine, codexContext, codexLine, dayKey, modelOf, rootOf } from "../../server/agent-usage.mjs";
import { codexPlan, emptyAgents, expireAgents, mergeClaudeSessions, projectOf, publicAgents, reduceAgents, reduceStatusline, toolOf } from "../../server/agents.mjs";
import { parseClaudeSession, readClaudeSessions } from "../../server/claude-sessions.mjs";

const wire = (v) => JSON.parse(JSON.stringify(v ?? null));
/** A reducer's answer: whether it handed the state back untouched, and the state after. */
const step = (next, state) => ({ same: next === state, state: wire(next) });

function inZone(zone, build) {
  const before = process.env.TZ;
  process.env.TZ = zone;
  try {
    return build();
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
}

/* ---------------- agents ---------------- */

/** One shared empty state: a reducer that ignores its input hands back this very object. */
const EMPTY = emptyAgents();

const ev = (hook_event_name, more = {}) => ({ hook_event_name, session_id: "s1", cwd: "E:\\GitHub\\MyRepos\\InfoPanel.Dashboard", transcript_path: "C:\\secret\\t.jsonl", prompt: "secret prompt", ...more });

/** Applies events in order, recording each as a case from the state before it. */
function scenario(cases, agent, events, start = EMPTY) {
  let state = start;
  for (const [event, now] of events) {
    const next = reduceAgents(state, agent, event, now);
    cases.push({ input: { fn: "reduceAgents", state: wire(state), agent, event, now }, output: step(next, state) });
    state = next;
  }
  return state;
}

function hookCases(cases) {
  const claude = scenario(cases, "claude", [
    [ev("SessionStart"), 1000], [ev("UserPromptSubmit"), 2000], [ev("PreToolUse", { tool_name: "Bash" }), 3000], [ev("PreToolUse", { tool_name: "mcp__plugin_x__browser_click" }), 3500],
    [ev("PermissionRequest", { tool_name: "Edit" }), 4000], [ev("PermissionRequest"), 4500], [ev("PostToolUse"), 5000], 
    [ev("Notification", { notification_type: "idle_prompt" }), 5200], [ev("PostToolUse"), 5300], [ev("Notification", { notification_type: "auth_success" }), 5400], [ev("Notification", { notification_type: "permission_prompt" }), 5500],
    [ev("SubagentStart"), 5600], [ev("SubagentStart"), 5700], [ev("SubagentStop"), 5800], [ev("SubagentStop"), 5900],
    [ev("UnknownEvent", { cwd: "/srv/other" }), 6000], [ev("Stop"), 61_000], [ev("PostToolUse"), 63_000], [ev("StopFailure"), 64_000], [ev("Interrupt"), 65_000], [ev("SessionEnd"), 66_000],
  ]);
  scenario(cases, "codex", [[ev("UserPromptSubmit", { cwd: "/home/me/proj" }), 0], [ev("PreToolUse", { tool_name: "shell" }), 1], [ev("Interrupt"), 5], [ev("Stop"), 9]]);
  // Odd inputs: the junk is ignored; the limits of each cut.
  const base = scenario([], "claude", [[ev("UserPromptSubmit"), 0]]);
  for (const agent of ["gemini", "", "Claude", "claude "]) cases.push({ input: { fn: "reduceAgents", state: wire(EMPTY), agent, event: ev("Stop"), now: 9 }, output: step(reduceAgents(EMPTY, agent, ev("Stop"), 9), EMPTY) });
  const events = [
    null, 5, "x", [], [1], true, {}, { hook_event_name: "Stop" }, { session_id: "x" }, { hook_event_name: 4, session_id: "x" }, { hook_event_name: "Stop", session_id: 7 }, { hook_event_name: "", session_id: "x" }, { hook_event_name: "Stop", session_id: "" },
    ev("Stop", { cwd: undefined }), ev("Stop", { cwd: 5 }), ev("Stop", { cwd: "" }), ev("Stop", { cwd: "C:\\a\\b\\\\" }), ev("Stop", { cwd: "///" }), ev("Stop", { cwd: `/w/${"é".repeat(80)}` }), ev("Stop", { cwd: `/${"p".repeat(1200)}` }),
    ev("PreToolUse", { tool_name: "t".repeat(300) }), ev("PreToolUse", { tool_name: "mcp__a__b__c" }), ev("PreToolUse", { tool_name: "mcp__" }), ev("PreToolUse", { tool_name: "mcp____x" }), ev("PreToolUse", { tool_name: "mcp__a__b\nc__d" }), ev("PreToolUse", { tool_name: "mcp__a\nb__c" }), ev("PreToolUse", { tool_name: 5 }),
    ev("Notification", { notification_type: ["idle_prompt"] }), ev("Stop", { hook_event_name: "X".repeat(60) }), ev("UserPromptSubmit", { session_id: "i".repeat(150) }), ev("UserPromptSubmit", { session_id: "😀".repeat(60) }),
  ];
  for (const event of events) cases.push({ input: { fn: "reduceAgents", state: wire(EMPTY), agent: "claude", event, now: 9 }, output: step(reduceAgents(EMPTY, "claude", event, 9), EMPTY) });
  for (const event of events.slice(0, 3)) cases.push({ input: { fn: "reduceAgents", state: wire(base), agent: "claude", event, now: 9 }, output: step(reduceAgents(base, "claude", event, 9), base) });
  void claude;
  // More than twelve sessions keeps the newest; equal times keep their order.
  let many = EMPTY;
  for (let i = 0; i < 14; i += 1) many = reduceAgents(many, i % 2 ? "codex" : "claude", ev("UserPromptSubmit", { session_id: `m${i}`, cwd: `/w/p${i}` }), i < 6 ? 100 : 100 + i);
  cases.push({ input: { fn: "reduceAgents", state: wire(many), agent: "claude", event: ev("Stop", { session_id: "m0" }), now: 500 }, output: step(reduceAgents(many, "claude", ev("Stop", { session_id: "m0" }), 500), many) });
}

function textCases(cases) {
  for (const value of ["C:\\Users\\me\\repo\\", "/srv/app", 42, "", "/", "\\", "a", "a/b/", "a//b", "a\\/b", undefined, null, `/x/${"y".repeat(100)}`, "x/é😀é😀é😀é😀é😀é😀é😀é😀é😀é😀é😀é😀é😀é😀é😀é😀é😀é😀é😀é😀é😀é😀é😀é😀é😀é😀é😀é😀é😀é😀"]) {
    cases.push({ input: { fn: "projectOf", value: value === undefined ? null : value }, output: projectOf(value) });
  }
  for (const value of ["Bash", "mcp__codegraph__codegraph_explore", "mcp__plugin_x__a__b", "mcp__nodoublepair", "mcp__", "mcp__a__", "xmcp__a__b", "", 5, "t".repeat(300), "mcp__a\rb__c", "mcp__a\u2028b__c", "mcp__é__😀"]) {
    cases.push({ input: { fn: "toolOf", value }, output: toolOf(value) });
  }
}

const live = (over = {}) => ({ id: "f1", pid: 9, project: "repo", state: "working", updatedAt: 500, ...over });

function mergeCases(cases) {
  const hooked = reduceAgents(EMPTY, "claude", { hook_event_name: "Stop", session_id: "f1", cwd: "/x/repo" }, 10);
  const unhooked = mergeClaudeSessions(EMPTY, [live()], 1000);
  const codex = reduceAgents(hooked, "codex", ev("UserPromptSubmit", { session_id: "c1" }), 11);
  const lists = [
    [EMPTY, [live()], 1000], [EMPTY, [live({ state: "idle", updatedAt: null })], 1000], [EMPTY, [live({ updatedAt: 0 })], 1000], [EMPTY, [live({ state: "waiting" })], 1000], [EMPTY, [], 1000],
    [EMPTY, [live({ alive: false })], 99], [EMPTY, [live({ alive: true }), live({ id: "f2", project: "" })], 5], [unhooked, [live()], 1000], [unhooked, [live()], 2000], [unhooked, [live({ state: "waiting" })], 3000], [unhooked, [live({ state: "idle" })], 3000],
    [unhooked, [live({ project: "renamed" })], 3000], [unhooked, [live({ project: "" })], 3000], [unhooked, [], 2000], [unhooked, [live({ alive: false })], 2000],
    [hooked, [live({ state: "working" })], 99], [hooked, [], 99], [hooked, [live({ alive: false })], 99], [codex, [], 99], [codex, [live()], 99],
    [mergeClaudeSessions(unhooked, [live({ state: "working" })], 1500), [live({ state: "idle" })], 1600],
  ];
  for (const [state, liveList, now] of lists) cases.push({ input: { fn: "mergeClaudeSessions", state: wire(state), live: liveList, now }, output: step(mergeClaudeSessions(state, liveList, now), state) });
  // The state with 12 live sessions and a 13th arriving.
  const crowd = Array.from({ length: 13 }, (_, i) => live({ id: `l${i}`, project: `p${i}` }));
  cases.push({ input: { fn: "mergeClaudeSessions", state: wire(EMPTY), live: crowd, now: 7 }, output: step(mergeClaudeSessions(EMPTY, crowd, 7), EMPTY) });
  const working = reduceAgents(EMPTY, "claude", ev("UserPromptSubmit"), 0);
  const done = reduceAgents(EMPTY, "claude", ev("Stop"), 0);
  const mixed = reduceAgents(reduceAgents(working, "claude", ev("Stop", { session_id: "d" }), 0), "codex", ev("PermissionRequest", { session_id: "w" }), 0);
  for (const [state, now] of [[working, 1_799_999], [working, 1_800_000], [done, 899_999], [done, 900_000], [mixed, 899_999], [mixed, 900_000], [EMPTY, 5]]) {
    cases.push({ input: { fn: "expireAgents", state: wire(state), now }, output: step(expireAgents(state, now), state) });
  }
}

function planCases(cases) {
  const s1 = reduceAgents(EMPTY, "claude", ev("UserPromptSubmit"), 0);
  const win = (used, resets) => ({ used_percentage: used, ...(resets !== undefined ? { resets_at: resets } : {}) });
  const payloads = [
    { session_id: "s1", model: { display_name: "Opus" }, rate_limits: { five_hour: win(82, 1_760_000_000), seven_day: win(40) }, context_window: { used_percentage: 37 }, cost: { total_cost_usd: 1.25 } },
    { session_id: "s1" }, { session_id: "nope", context_window: { used_percentage: 5 } }, {}, null, 5, "x", [], [1],
    { version: "2.1.220", rate_limits: { five_hour: win(10), seven_day_opus: win(55, 1_760_000_000), seven_day_sonnet: "junk", seven_day_x: {}, other: win(5) } },
    { version: "2.1.220" }, { version: "v".repeat(40) }, { version: 5 }, { version: "" },
    { rate_limits: { five_hour: win(250), seven_day: win(-5) } }, { rate_limits: { five_hour: win("5") } }, { rate_limits: { five_hour: { used_percent: 33 } } }, { rate_limits: { five_hour: { used_percentage: null, used_percent: 44 } } }, { rate_limits: { five_hour: { used_percentage: "9", used_percent: 44 } } },
    { rate_limits: { five_hour: win(1, "2026-10-15T10:00:00Z") } }, { rate_limits: { five_hour: win(1, "2026-10-15T10:00:00.5+02:00") } }, { rate_limits: { five_hour: win(1, "garbage") } }, { rate_limits: { five_hour: win(1, 999_999_999_999) } },
    { rate_limits: { five_hour: win(1, 1_000_000_000_000) } }, { rate_limits: { five_hour: win(1, -5) } }, { rate_limits: { five_hour: win(1, null) } }, { rate_limits: { five_hour: win(1, [5]) } }, { rate_limits: { five_hour: win(1, 0.5) } },
    { rate_limits: { seven_day_: win(5), seven_day_a: win(6), [`seven_day_${"n".repeat(40)}`]: win(7) } }, { rate_limits: "x" }, { rate_limits: [1] }, { rate_limits: null }, { rate_limits: { five_hour: [] } }, { rate_limits: { five_hour: null, seven_day: win(2) } },
    { session_id: "s1", context_window: { used_percentage: 250 }, cost: { total_cost_usd: -3 }, model: { id: "claude-x" } }, { session_id: "s1", context_window: "x", cost: 5, model: { display_name: 7, id: "fallback" } },
    { session_id: "s1", model: { display_name: "M".repeat(60) } }, { session_id: "s1", model: { display_name: null, id: "viaid" } }, { session_id: "s1", cost: { total_cost_usd: "1" } }, { session_id: "x".repeat(200) },
  ];
  const withClaudePlan = reduceStatusline(s1, payloads[0], 9);
  const withVersion = reduceStatusline(withClaudePlan, { version: "2.1.1" }, 20);
  const withCodex = codexPlan(withClaudePlan, { primary: { used_percent: 1, window_minutes: 300 } }, 12);
  for (const state of [EMPTY, s1, withClaudePlan, withVersion, withCodex]) {
    for (const payload of payloads) {
      // The full cross product is large; the busy states take a few of each.
      const i = payloads.indexOf(payload);
      if (state === s1 && !payload?.session_id && i % 4 !== 0) continue;
      if (state !== EMPTY && state !== s1 && (state === withCodex || i % 8 !== 0)) continue;
      cases.push({ input: { fn: "reduceStatusline", state: wire(state), payload, now: 30 }, output: step(reduceStatusline(state, payload, 30), state) });
    }
  }
  const limits = [
    { primary: { used_percent: 12.5, window_minutes: 300, resets_at: 1_760_000_000 }, secondary: { used_percent: 3, window_minutes: 10080 } },
    { primary: { used_percent: 3, window_minutes: 10080 }, secondary: null }, { primary: { used_percent: 3 }, secondary: { used_percent: 4 } }, { secondary: { used_percent: 8, window_minutes: 100 } },
    { primary: { used_percent: 1, window_minutes: 360 }, secondary: { used_percent: 2, window_minutes: 361 } }, { primary: { used_percent: 1, window_minutes: 10080 }, secondary: { used_percent: 2, window_minutes: 300 } },
    { primary: { used_percent: 1, window_minutes: "300" }, secondary: { used_percent: 2, window_minutes: 10080 } }, { primary: { used_percent: "x", window_minutes: 300 }, secondary: { used_percent: 2, window_minutes: 10080 } },
    { primary: { window_minutes: 300 } }, { primary: [] }, { primary: 5, secondary: "x" }, {}, null, 5, "x", [], { primary: { used_percent: 250, resets_at: "2026-10-15T10:00:00Z" } }, { primary: { used_percent: -2, window_minutes: 10080, resets_at: 1_760_000_000_000 } },
    { primary: { used_percent: 1, window_minutes: 300 }, secondary: { used_percent: 2, window_minutes: 300 } },
  ];
  for (const state of [EMPTY, withClaudePlan]) for (const l of state === EMPTY ? limits : limits.slice(0, 1)) cases.push({ input: { fn: "codexPlan", state: wire(state), limits: l, now: 40 }, output: step(codexPlan(state, l, 40), state) });
  for (const state of [EMPTY, s1, withClaudePlan, withCodex]) cases.push({ input: { fn: "publicAgents", state: wire(state) }, output: wire(publicAgents(state)) });
  const withUsage = { ...withClaudePlan, usage: { claude: { today: 5, history: 5, days: [] } } };
  cases.push({ input: { fn: "publicAgents", state: wire(withUsage) }, output: wire(publicAgents(withUsage)) });
}

export function agentsCases() {
  const cases = [];
  textCases(cases);
  hookCases(cases);
  mergeCases(cases);
  planCases(cases);
  return cases;
}

/* ---------------- claude-sessions ---------------- */

export function claudeSessionsCases() {
  const cases = [];
  const texts = [
    '{"pid":4242,"sessionId":"abc","cwd":"E:\\\\GitHub\\\\repo\\\\","status":"busy","updatedAt":1760000000000,"name":"x"}', '{"pid":1,"sessionId":"s","status":"waiting"}', '{"pid":1,"sessionId":"s","status":"idle"}', '{"pid":1,"sessionId":"s","status":"other"}',
    '{"pid":1,"sessionId":"s","status":null}', '{"pid":1,"sessionId":"s","status":5}', '{"pid":1,"sessionId":"s","status":["busy"]}', '{"pid":1,"sessionId":"s","status":{"a":1}}', `{"pid":1,"sessionId":"${"x".repeat(150)}"}`, `{"pid":1,"sessionId":"${"é😀".repeat(80)}"}`,
    '{"pid":5.0,"sessionId":"s"}', '{"pid":1.5,"sessionId":"s"}', '{"pid":0,"sessionId":"s"}', '{"pid":-3,"sessionId":"s"}', '{"pid":"7","sessionId":"s"}', '{"pid":7}', '{"pid":7,"sessionId":""}', '{"pid":7,"sessionId":9}', '{"sessionId":"s"}', '{"pid":1e3,"sessionId":"s"}',
    '{"pid":1,"sessionId":"s","updatedAt":"now"}', '{"pid":1,"sessionId":"s","updatedAt":1.5}', '{"pid":1,"sessionId":"s","updatedAt":-1}', '{"pid":1,"sessionId":"s","updatedAt":null}', '{"pid":1,"sessionId":"s","cwd":5}', '{"pid":1,"sessionId":"s","cwd":"/w/a b/"}',
    "", "{", "null", "[]", "5", '"x"', "true", "\ufeff{\"pid\":1,\"sessionId\":\"s\"}", '{"pid":1,"sessionId":"s"} trailing', '[{"pid":1,"sessionId":"s"}]',
  ];
  for (const text of texts) cases.push({ input: { fn: "parseClaudeSession", text }, output: wire(parseClaudeSession(text)) });
  // A sessions folder: only the .json names, with the process check stubbed; compared by id.
  const files = {
    "1.json": '{"pid":11,"sessionId":"live","cwd":"/w/a","status":"busy","updatedAt":5}', "2.json": '{"pid":22,"sessionId":"dead","cwd":"/w/b"}', "3.json": "not json", "4.txt": '{"pid":44,"sessionId":"txt"}', "5.JSON": '{"pid":55,"sessionId":"upper"}', "dir.json/": null, "no-extension": '{"pid":66,"sessionId":"plain"}',
  };
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "parity-claude-sessions-"));
  try {
    const dir = path.join(home, ".claude", "sessions");
    fs.mkdirSync(dir, { recursive: true });
    for (const [name, text] of Object.entries(files)) {
      if (text === null) fs.mkdirSync(path.join(dir, name.replace("/", "")));
      else fs.writeFileSync(path.join(dir, name), text);
    }
    const aliveSet = [11];
    const found = readClaudeSessions({ home, alive: (pid) => aliveSet.includes(pid) }).sort((a, b) => a.id.localeCompare(b.id));
    cases.push({ input: { fn: "readClaudeSessions", files, alive: aliveSet }, output: wire(found) });
    cases.push({ input: { fn: "readClaudeSessions", files: {}, alive: [] }, output: wire(readClaudeSessions({ home: path.join(home, "nowhere"), alive: () => true })) });
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
  return cases;
}

/* ---------------- agent-usage ---------------- */

const NOW = Date.parse("2026-10-15T10:00:00Z");
const DAY = 86_400_000;
const at = (daysAgo, extra = 0) => new Date(NOW - daysAgo * DAY + extra).toISOString();
const assistant = (requestId, timestamp, usage, more = {}) => JSON.stringify({ type: "assistant", requestId, timestamp, message: { model: "m", content: [{ type: "text", text: "secret" }], usage }, ...more });
const claudeAt = (id, ts, cwd, model, tokens) => JSON.stringify({ type: "assistant", requestId: id, timestamp: ts, cwd, message: { model, usage: { input_tokens: tokens } } });
const tokenCount = (timestamp, total, rate_limits = null) => JSON.stringify({ timestamp, type: "event_msg", payload: { type: "token_count", info: total ? { total_token_usage: total } : null, rate_limits } });

function lineCases(cases) {
  const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100, cache_creation_input_tokens: 20 };
  const lines = [
    assistant("r1", "2026-10-15T10:00:00Z", usage), assistant("r1", "2026-10-15T10:00:00.123Z", usage, { cwd: "E:\\GitHub\\repo\\.claude\\worktrees\\agent-a1" }), assistant(undefined, "2026-10-15T10:00:00Z", usage), assistant("r", "2026-10-15T10:00:00Z", { input_tokens: -3, output_tokens: "9", cache_read_input_tokens: 1.5, cache_creation_input_tokens: null }),
    assistant("r", "2026-10-15T10:00:00Z", {}), assistant("r", "2026-10-15T10:00:00Z", []), assistant("r", "not a date", usage), assistant("r", "2026-10-15", usage), assistant("r", "2026-10-15T10:00", usage), assistant("r", "2026-10-15T10:00:00+02:00", usage), assistant("r", undefined, usage),
    JSON.stringify({ type: "assistant", timestamp: "2026-10-15T10:00:00Z", message: { id: "m1", usage } }), JSON.stringify({ type: "assistant", requestId: 5, timestamp: "2026-10-15T10:00:00Z", message: { id: 6, usage } }),
    JSON.stringify({ type: "assistant", timestamp: "2026-10-15T10:00:00Z", message: { usage: null } }), JSON.stringify({ type: "assistant", timestamp: "2026-10-15T10:00:00Z", message: "x" }), JSON.stringify({ type: "assistant", timestamp: "2026-10-15T10:00:00Z" }),
    JSON.stringify({ type: "user", timestamp: "2026-10-15T10:00:00Z", message: { content: "hi", usage } }), "{not json", "", "null", "5", "[]",
    claudeAt("r", "2026-10-15T10:00:00Z", "E:\\GitHub\\repo-a", "claude-opus-5-5", 1), claudeAt("r", "2026-10-15T10:00:00Z", "/w/repo/.claude/worktrees/x/y", "claude-sonnet-5-5-20260901", 1), claudeAt("r", "2026-10-15T10:00:00Z", 5, "<synthetic>", 1), claudeAt("r", "2026-10-15T10:00:00Z", "/w/a/.claude/worktrees", "gpt-5.5", 1),
    claudeAt("r", "2026-10-15T10:00:00Z", "/w/a/.claude/worktrees/x\ny", "x".repeat(60), 1), claudeAt("r", "2026-10-15T10:00:00Z", "/w/a\\.claude/worktrees\\z", "claude-", 1), claudeAt("r", "2026-10-15T10:00:00Z", "/w/.claude/worktrees/a/.claude/worktrees/b", "claude-x-12345678", 1), claudeAt("r", "2026-10-15T10:00:00Z", "/w/.claude/Worktrees/a", "claude-x-1234567", 1),
  ];
  inZone("Europe/Oslo", () => {
    for (const line of lines) cases.push({ input: { fn: "claudeLine", line }, output: wire(claudeLine(line)) });
    const codex = [
      tokenCount("2026-10-15T10:00:00Z", { input_tokens: 100, cached_input_tokens: 60, output_tokens: 7, total_tokens: 107 }, { primary: { used_percent: 3 } }), tokenCount("2026-10-15T10:00:00Z", { input_tokens: 5, cached_input_tokens: 60, output_tokens: 7, cache_write_input_tokens: 9 }), tokenCount("2026-10-15T10:00:00Z", null), tokenCount("2026-10-15T10:00:00Z", 5),
      tokenCount("2026-10-15T10:00:00Z", {}), tokenCount("bad", { input_tokens: 1 }), tokenCount("2026-10-15T10:00:00Z", { input_tokens: 1 }, 0), tokenCount("2026-10-15T10:00:00Z", { input_tokens: 1 }, "x"), tokenCount("2026-10-15T10:00:00Z", { input_tokens: 1 }, []),
      JSON.stringify({ type: "event_msg", payload: { type: "agent_message" } }), JSON.stringify({ type: "event_msg" }), JSON.stringify({ type: "other", payload: { type: "token_count" } }), "{nope", "",
    ];
    for (const line of codex) cases.push({ input: { fn: "codexLine", line }, output: wire(codexLine(line)) });
    const contexts = [
      JSON.stringify({ type: "session_meta", payload: { cwd: "C:\\work\\proj" } }), JSON.stringify({ type: "turn_context", payload: { cwd: "/home/me/proj", model: "gpt-5.5" } }), JSON.stringify({ type: "turn_context", payload: { cwd: "/w/r/.claude/worktrees/x", model: "claude-opus-5-5" } }), JSON.stringify({ type: "turn_context", payload: "x" }),
      JSON.stringify({ type: "turn_context" }), JSON.stringify({ type: "session_meta", payload: { cwd: 5, model: "m" } }), JSON.stringify({ type: "event_msg", payload: {} }), "{nope", "null",
    ];
    for (const line of contexts) cases.push({ input: { fn: "codexContext", line }, output: wire(codexContext(line)) });
    for (const ms of [0, NOW, Date.parse("2026-10-14T22:30:00Z"), Date.parse("2026-10-14T21:59:59.999Z"), Date.parse("2026-03-29T00:30:00Z"), Date.parse("2026-10-25T00:30:00Z"), Date.parse("2026-12-31T23:30:00Z"), Date.parse("2027-01-01T00:00:00Z")]) cases.push({ input: { fn: "dayKey", ms }, output: dayKey(ms) });
  });
  for (const value of ["claude-opus-5-5", "claude-sonnet-5-5-20260901", "gpt-5.5", "<synthetic>", null, 5, "", "claude-", "claude-claude-x", "x-12345678", "-12345678", "x-1234567", "x-123456789", "claude-x-12345678-12345678", "x-1234567a", "x".repeat(60), "claude-" + "y".repeat(60), "é".repeat(50), "x-١٢٣٤٥٦٧٨"]) cases.push({ input: { fn: "modelOf", value }, output: modelOf(value) });
  for (const value of ["E:\\GitHub\\repo\\.claude\\worktrees\\agent-a1", "/w/repo/.claude/worktrees/x/y", "/w/repo/.claude/worktrees", "/w/repo/.claude/worktrees/", "/.claude/worktrees/a", "x/.claude/worktrees/a\nb", "a\nb/.claude/worktrees/c", 5, null, ""]) cases.push({ input: { fn: "rootOf", value }, output: rootOf(value) ?? null });
}

/** Runs `steps` ({files, append}) on a fresh temp home and records the totals and Codex limits after each. */
async function scanCase(label, steps) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "parity-agent-usage-"));
  try {
    const usage = createAgentUsage({ home, now: () => NOW });
    const results = [];
    for (const { files, append } of steps) {
      for (const [rel, content] of Object.entries(files)) {
        const file = path.join(home, ...rel.split("/"));
        fs.mkdirSync(path.dirname(file), { recursive: true });
        (append ? fs.appendFileSync : fs.writeFileSync)(file, content);
      }
      await usage.scan();
      results.push({ totals: wire(usage.totals()), limits: wire(usage.codexLimits()), limitsAt: usage.codexLimitsAt() });
    }
    return { input: { fn: "scan", label, now: NOW, steps }, output: results };
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

async function scanCases() {
  const u = { input_tokens: 1, output_tokens: 2, cache_read_input_tokens: 3, cache_creation_input_tokens: 4 };
  const rows = [
    claudeAt("1", at(0), "E:\\GitHub\\alpha", "claude-opus-5-5", 100), claudeAt("2", at(0), "E:\\GitHub\\beta", "claude-sonnet-5-5-20260901", 30), claudeAt("3", at(3), "E:\\GitHub\\beta", "claude-sonnet-5-5", 50), claudeAt("4", at(10), "E:\\GitHub\\alpha", "claude-opus-5-5", 999),
    claudeAt("5", at(0), "E:\\GitHub\\gone", "<synthetic>", 7), claudeAt("6", at(0), "", "claude-opus-5-5", 5), claudeAt("7", at(0), "/w/Zed", "claude-haiku-5", 100), claudeAt("8", at(0), "/w/alpha2", "claude-haiku-5", 100), claudeAt("9", at(0), "/w/_under", "claude-haiku-5", 100), claudeAt("10", at(0), "/w/1num", "claude-haiku-5", 100), claudeAt("11", at(0), "/w/Alpha", "claude-haiku-5", 100),
    ...["p1", "p2", "p3", "p4", "p5"].map((p, i) => claudeAt(`m${i}`, at(0), `/w/${p}`, "claude-haiku-5", 1)),
  ];
  const sessionFiles = Object.fromEntries(rows.map((r, i) => [`.claude/projects/x/s${i}.jsonl`, `${r}\n`]));
  const meta = JSON.stringify({ type: "session_meta", payload: { cwd: "C:\\work\\cx" } });
  const turn = JSON.stringify({ type: "turn_context", payload: { cwd: "C:\\work\\cx", model: "gpt-5.5" } });
  const day35 = (d) => new Date(Date.parse(`2026-10-15T12:00:00+02:00`) - d * DAY).toISOString();
  const cases = [];
  const run = async (label, steps) => cases.push(await scanCase(label, steps));
  await run("the Node test: days, a request once, appends", [
    { files: { ".claude/projects/E--repo/s1.jsonl": [assistant("a", at(1), u), assistant("b", at(0), u), assistant("b", at(0), u), ""].join("\n"), ".codex/sessions/2026/10/15/rollout-1.jsonl": [tokenCount(at(0), { input_tokens: 10, output_tokens: 1 }), tokenCount(at(0), { input_tokens: 30, output_tokens: 4 }, { primary: { used_percent: 9, window_minutes: 300 } }), ""].join("\n") } },
    { append: true, files: { ".claude/projects/E--repo/s1.jsonl": `${assistant("c", at(0), u)}\n${assistant("d", at(0), u)}` } },
    { append: true, files: { ".claude/projects/E--repo/s1.jsonl": "\n" } },
  ]);
  await run("split by project and model, ranked and capped", [{ files: { ...sessionFiles, ".codex/sessions/2026/10/15/rollout-1.jsonl": [meta, turn, tokenCount(at(0), { input_tokens: 20 }), tokenCount(at(0), { input_tokens: 50 }), ""].join("\n") } }]);
  await run("first cwd and worktree", [{ files: { ".claude/projects/x/s1.jsonl": [claudeAt("1", at(0), "E:\\GitHub\\repo", "claude-opus-5-5", 10), claudeAt("2", at(0), "E:\\GitHub\\repo\\src-tauri", "claude-opus-5-5", 10), ""].join("\n"), ".claude/projects/x/s1/subagents/agent-a1.jsonl": `${claudeAt("3", at(0), "E:\\GitHub\\repo\\.claude\\worktrees\\agent-a1", "claude-opus-5-5", 10)}\n` } }]);
  await run("the history window and local days", [{ files: { ".claude/projects/x/edge.jsonl": [claudeAt("a", day35(34), "/w/a", "m", 1), claudeAt("b", day35(35), "/w/a", "m", 10), claudeAt("c", day35(36), "/w/a", "m", 100), claudeAt("d", at(0, 0), "/w/a", "m", 1000), claudeAt("e", "2026-10-14T21:59:59Z", "/w/a", "m", 5), claudeAt("f", "2026-10-14T22:00:00Z", "/w/a", "m", 7), ""].join("\n") } }]);
  await run("codex cumulative totals", [
    { files: { ".codex/sessions/2026/10/15/rollout-a.jsonl": [meta, tokenCount(at(0, -3000), { input_tokens: 100, cached_input_tokens: 30, output_tokens: 10 }), tokenCount(at(0, -2000), { input_tokens: 50, cached_input_tokens: 10, output_tokens: 20 }), tokenCount(at(0, -1000), { input_tokens: 400, cached_input_tokens: 500, output_tokens: 20 }), ""].join("\n"), ".codex/sessions/2026/10/14/rollout-b.jsonl": [turn, tokenCount(at(1), { input_tokens: 7 }, { primary: { used_percent: 1, window_minutes: 300 } }), tokenCount(at(0, -9_000_000), { input_tokens: 17 }, { primary: { used_percent: 2, window_minutes: 300 } }), ""].join("\n") } },
    { append: true, files: { ".codex/sessions/2026/10/15/rollout-a.jsonl": `${tokenCount(at(0), { input_tokens: 500, cached_input_tokens: 100, output_tokens: 30 }, { secondary: { used_percent: 4, window_minutes: 10080 } })}\n` } },
  ]);
  await run("junk lines, CRLF and multi-byte text", [{ files: { ".claude/projects/x/odd.jsonl": [`${assistant("a", at(0), u, { cwd: "/w/é😀" })}\r`, "{bad", "", assistant("b", at(0), u, { cwd: "/w/second" }), "[]", `${assistant("", at(0), u)}`, `${assistant("", at(0), u)}`, ""].join("\n"), ".claude/projects/x/notes.txt": "ignored\n", ".claude/projects/x/y/z/deep/er/too.jsonl": `${assistant("t", at(0), u)}\n` } }]);
  await run("a file that shrank restarts", [{ files: { ".claude/projects/x/s.jsonl": [assistant("a", at(0), u), assistant("b", at(0), u), assistant("c", at(0), u), ""].join("\n") } }, { files: { ".claude/projects/x/s.jsonl": `${assistant("z", at(0), u)}\n` } }]);
  await run("no agent folders", [{ files: {} }]);
  return cases;
}

export async function agentUsageCases() {
  const cases = [];
  lineCases(cases);
  const before = process.env.TZ;
  process.env.TZ = "Europe/Oslo";
  try {
    cases.push(...(await scanCases()));
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
  return cases;
}

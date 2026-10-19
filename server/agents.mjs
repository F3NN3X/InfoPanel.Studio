// Coding agents (Claude Code, Codex) for the island and the Agents widget. Their hooks post each
// lifecycle event here (scripts/agent-status.mjs forwards a hook's stdin), their statusline posts
// the plan and context use, and the server reads the transcripts' token counts (agent-usage.mjs)
// and Claude Code's live session files (claude-sessions.mjs), which cover sessions without hooks.
//
// Only metadata reaches the kiosks: the agent, the project folder's name, the state, the tool's
// name, times and numbers. Prompts, replies, tool inputs and paths stay here.
//
// Node built-ins only. `reduceAgents`, `mergeClaudeSessions` and `publicAgents` are pure.

import { createHash } from "node:crypto";

export const AGENTS = ["claude", "codex"];
/** A working or waiting session not heard from for this long is dropped (a missed SessionEnd), ms. */
export const STALE_MS = 30 * 60_000;
/** A finished session stays listed this long, ms. */
export const DONE_KEEP_MS = 15 * 60_000;
const MAX_SESSIONS = 12;

/** What a session is doing: "working" (a turn runs), "waiting" (needs you), "done", "error", "idle". */
export const emptyAgents = () => ({ sessions: {}, plan: {}, usage: {} });

const str = (v, max = 80) => (typeof v === "string" ? v.slice(0, max) : "");
/** The project folder's name from a cwd (both slash kinds), never the path. */
export const projectOf = (cwd) => str(cwd, 1000).replace(/[\\/]+$/, "").split(/[\\/]/).pop()?.slice(0, 60) ?? "";

/** A tool's display name: an MCP tool (`mcp__<server>__<tool>`) keeps only its own name. */
export const toolOf = (v) => str(str(v, 200).replace(/^mcp__.*__/, ""), 60);

/** The hook events that put a session into a state; anything else only refreshes it. */
const NEEDS_YOU = new Set(["permission_prompt", "idle_prompt", "elicitation_dialog", "agent_needs_input"]);

/**
 * One hook event into the sessions. `event` is the hook's JSON (`hook_event_name`, `session_id`,
 * `cwd`, `tool_name`, `notification_type`); `agent` is "claude" or "codex"; `now` is ms.
 */
export function reduceAgents(state, agent, event, now) {
  if (!AGENTS.includes(agent) || typeof event !== "object" || event === null) return state;
  const name = str(event.hook_event_name, 40);
  const id = str(event.session_id, 100);
  if (!name || !id) return state;
  const key = `${agent}:${id}`;
  const sessions = { ...state.sessions };
  if (name === "SessionEnd") {
    delete sessions[key];
    return { ...state, sessions };
  }
  const prev = sessions[key] ?? { agent, id, project: "", state: "idle", since: now, turnStart: null, tool: "", subagents: 0, lastTurnMs: null };
  const next = { ...prev, project: projectOf(event.cwd) || prev.project, lastSeen: now, hooked: true };
  const to = (s) => {
    if (next.state !== s) next.since = now;
    next.state = s;
  };
  switch (name) {
    case "SessionStart":
      to("idle");
      next.tool = "";
      break;
    case "UserPromptSubmit":
      to("working");
      next.turnStart = now;
      next.tool = "";
      break;
    case "PreToolUse":
      to("working");
      next.turnStart ??= now;
      next.tool = toolOf(event.tool_name);
      break;
    case "PostToolUse":
    case "PostToolUseFailure":
      to("working");
      next.turnStart ??= now;
      break;
    case "PermissionRequest":
      to("waiting");
      next.tool = toolOf(event.tool_name) || next.tool;
      break;
    case "Notification":
      if (NEEDS_YOU.has(str(event.notification_type, 40))) to("waiting");
      break;
    case "SubagentStart":
      next.subagents = Math.min(prev.subagents + 1, 50);
      break;
    case "SubagentStop":
      next.subagents = Math.max(prev.subagents - 1, 0);
      break;
    case "Stop":
      to("done");
      next.lastTurnMs = next.turnStart !== null ? now - next.turnStart : null;
      next.turnStart = null;
      next.tool = "";
      next.subagents = 0;
      break;
    case "Interrupt":
      // Codex: the turn was stopped by hand.
      to("idle");
      next.turnStart = null;
      next.tool = "";
      next.subagents = 0;
      break;
    case "StopFailure":
      to("error");
      next.turnStart = null;
      next.tool = "";
      break;
    default:
      break;
  }
  sessions[key] = next;
  return { ...state, sessions: trim(sessions) };
}

/** The newest sessions only. */
function trim(sessions) {
  const all = Object.entries(sessions);
  if (all.length <= MAX_SESSIONS) return sessions;
  return Object.fromEntries(all.sort((a, b) => b[1].lastSeen - a[1].lastSeen).slice(0, MAX_SESSIONS));
}

/**
 * Claude Code's session files (`live`, from readClaudeSessions) into the sessions: a live session
 * without hooks is added and follows its file; a live one is not expired; one whose file shows its
 * process ended (a crash), or an unhooked one whose file is gone, is dropped. Hooked sessions
 * without a file are left to `expireAgents`.
 */
export function mergeClaudeSessions(state, live, now) {
  const sessions = { ...state.sessions };
  let changed = false;
  const liveKeys = new Set();
  for (const l of live) {
    const key = `claude:${l.id}`;
    if (l.alive === false) {
      if (sessions[key]) {
        delete sessions[key];
        changed = true;
      }
      continue;
    }
    liveKeys.add(key);
    const prev = sessions[key];
    if (!prev) {
      sessions[key] = {
        agent: "claude",
        id: l.id,
        project: l.project,
        state: l.state,
        since: l.updatedAt ?? now,
        turnStart: l.state === "working" ? (l.updatedAt ?? now) : null,
        tool: "",
        subagents: 0,
        lastTurnMs: null,
        lastSeen: now,
      };
      changed = true;
      continue;
    }
    const next = { ...prev, lastSeen: now };
    if (!prev.hooked) {
      next.project = l.project || prev.project;
      if (prev.state !== l.state) {
        next.state = l.state;
        next.since = now;
        next.turnStart = l.state === "working" ? (prev.turnStart ?? now) : null;
      }
    }
    if (JSON.stringify(next) !== JSON.stringify(prev)) {
      sessions[key] = next;
      changed = true;
    }
  }
  for (const [key, s] of Object.entries(sessions)) {
    if (s.agent === "claude" && !s.hooked && !liveKeys.has(key)) {
      delete sessions[key];
      changed = true;
    }
  }
  return changed ? { ...state, sessions: trim(sessions) } : state;
}

/** Drop sessions gone quiet (working or waiting past `STALE_MS`, finished past `DONE_KEEP_MS`). */
export function expireAgents(state, now) {
  const keep = Object.entries(state.sessions).filter(([, s]) => {
    const quiet = now - (s.lastSeen ?? s.since);
    return s.state === "working" || s.state === "waiting" ? quiet < STALE_MS : quiet < DONE_KEEP_MS;
  });
  return keep.length === Object.keys(state.sessions).length ? state : { ...state, sessions: Object.fromEntries(keep) };
}

const pct = (v) => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(100, v)) : undefined);
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
/** Unix seconds or ms, or an ISO string, as ms. */
function msOf(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v < 1e12 ? v * 1000 : v;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : undefined;
  }
  return undefined;
}
const window_ = (w) => {
  if (typeof w !== "object" || w === null) return undefined;
  const used = pct(w.used_percentage ?? w.used_percent);
  if (used === undefined) return undefined;
  const resetsAt = msOf(w.resets_at);
  return { used, ...(resetsAt !== undefined ? { resetsAt } : {}) };
};

/**
 * A Claude Code statusline payload into the plan and the session's context and cost:
 * `rate_limits.five_hour` / `seven_day`, `context_window.used_percentage`, `cost.total_cost_usd`.
 */
export function reduceStatusline(state, payload, now) {
  if (typeof payload !== "object" || payload === null) return state;
  const rl = payload.rate_limits ?? {};
  const fiveHour = window_(rl.five_hour);
  const sevenDay = window_(rl.seven_day);
  const plan = fiveHour || sevenDay ? { ...state.plan, claude: { ...(fiveHour ? { fiveHour } : {}), ...(sevenDay ? { sevenDay } : {}), at: now } } : state.plan;
  const id = str(payload.session_id, 100);
  const key = `claude:${id}`;
  const prev = id ? state.sessions[key] : undefined;
  const context = pct(payload.context_window?.used_percentage);
  const cost = num(payload.cost?.total_cost_usd);
  const model = str(payload.model?.display_name ?? payload.model?.id, 40);
  const sessions = prev
    ? { ...state.sessions, [key]: { ...prev, ...(context !== undefined ? { context } : {}), ...(cost !== undefined ? { cost } : {}), ...(model ? { model } : {}) } }
    : state.sessions;
  return plan === state.plan && sessions === state.sessions ? state : { ...state, plan, sessions };
}

/**
 * Codex's rate limits as its session files report them (`primary`, `secondary`). Which is the 5-hour
 * and which the weekly window goes by `window_minutes` (a free plan's primary is the weekly one).
 */
export function codexPlan(state, limits, now) {
  if (typeof limits !== "object" || limits === null) return state;
  const windows = [limits.primary, limits.secondary].filter((w) => typeof w === "object" && w !== null);
  const short = windows.find((w) => typeof w.window_minutes !== "number" || w.window_minutes <= 360);
  const long = windows.find((w) => w !== short);
  const fiveHour = window_(short && { used_percent: short.used_percent, resets_at: short.resets_at });
  const sevenDay = window_(long && { used_percent: long.used_percent, resets_at: long.resets_at });
  if (!fiveHour && !sevenDay) return state;
  return { ...state, plan: { ...state.plan, codex: { ...(fiveHour ? { fiveHour } : {}), ...(sevenDay ? { sevenDay } : {}), at: now } } };
}

/** What the kiosks get: sessions newest first, each keyed by a short hash (not the agent's session id). */
export function publicAgents(state) {
  const sessions = Object.entries(state.sessions)
    .sort((a, b) => b[1].lastSeen - a[1].lastSeen)
    .map(([key, s]) => ({
      key: createHash("sha256").update(key).digest("hex").slice(0, 12),
      agent: s.agent,
      project: s.project,
      state: s.state,
      since: s.since,
      ...(s.turnStart !== null ? { turnStart: s.turnStart } : {}),
      ...(s.tool ? { tool: s.tool } : {}),
      ...(s.subagents ? { subagents: s.subagents } : {}),
      ...(s.lastTurnMs !== null ? { lastTurnMs: s.lastTurnMs } : {}),
      ...(s.context !== undefined ? { context: s.context } : {}),
      ...(s.cost !== undefined ? { cost: s.cost } : {}),
      ...(s.model ? { model: s.model } : {}),
    }));
  return { sessions, plan: state.plan, usage: state.usage };
}

/**
 * The live agents: hook events and statusline payloads in, a change callback out (throttled so a
 * burst of tool calls is one publish). `usage()` supplies the token totals (agent-usage.mjs);
 * `codexLimits()` Codex's latest rate limits from its session files (reported at `codexLimitsAt()`); `claudeSessions()` the live
 * Claude Code sessions (claude-sessions.mjs).
 */
export function createAgents({ onChange, usage = () => ({}), codexLimits = () => null, codexLimitsAt = () => null, claudeSessions = () => [], now = () => Date.now(), throttleMs = 250 }) {
  let state = emptyAgents();
  let timer = null;
  const changed = () => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      onChange();
    }, throttleMs);
    timer.unref?.();
  };
  const refresh = () => {
    const t = now();
    let next = mergeClaudeSessions(state, claudeSessions(), t);
    next = expireAgents(next, t);
    // Stamped with when Codex reported them, so the widget can tell old numbers from fresh ones.
    next = codexPlan(next, codexLimits(), codexLimitsAt() ?? t);
    next = { ...next, usage: usage() };
    // Only what the kiosks get decides a publish: a live session's `lastSeen` moves on every sweep.
    const publish = JSON.stringify(publicAgents(next)) !== JSON.stringify(publicAgents(state));
    state = next;
    if (publish) changed();
  };
  refresh();
  const sweep = setInterval(refresh, 30_000);
  sweep.unref?.();
  return {
    event(agent, payload) {
      const next = reduceAgents(state, agent, payload, now());
      if (next !== state) {
        state = next;
        changed();
      }
    },
    statusline(payload) {
      const next = reduceStatusline(state, payload, now());
      if (next !== state) {
        state = next;
        changed();
      }
    },
    refresh,
    state: () => publicAgents(state),
    stop() {
      clearInterval(sweep);
      if (timer) clearTimeout(timer);
    },
  };
}

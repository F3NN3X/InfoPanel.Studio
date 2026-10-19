/**
 * Coding agents (Claude Code, Codex) as the dashboard server reports them (server/agents.mjs), in the
 * extras stream: their sessions, plan use and token history. Metadata only: no prompts or paths.
 */

export type AgentId = "claude" | "codex";
export const AGENT_IDS: readonly AgentId[] = ["claude", "codex"];
export type AgentState = "working" | "waiting" | "done" | "error" | "idle";
const STATES: readonly AgentState[] = ["working", "waiting", "done", "error", "idle"];

export interface AgentSession {
  /** A short hash, stable per session. */
  key: string;
  agent: AgentId;
  /** The project folder's name. */
  project: string;
  state: AgentState;
  /** When it entered `state`, ms. */
  since: number;
  /** When the running turn started, ms. */
  turnStart?: number;
  /** The tool running or waiting for permission ("Bash", "Edit"). */
  tool?: string;
  subagents?: number;
  /** The last finished turn's length, ms. */
  lastTurnMs?: number;
  /** Context window used, percent (Claude, from the statusline). */
  context?: number;
  /** The session's cost so far, USD (Claude, from the statusline). */
  cost?: number;
  model?: string;
}

export interface PlanWindow {
  /** Percent used. */
  used: number;
  resetsAt?: number;
}

export interface AgentPlan {
  fiveHour?: PlanWindow;
  sevenDay?: PlanWindow;
  at: number;
}

export interface UsageDay {
  day: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
}

/** Tokens by project folder and by model (short id), largest first. */
export interface UsageSplit {
  projects: { name: string; total: number }[];
  models: { name: string; total: number }[];
}

export interface AgentUsage {
  today: number;
  /** Over the history the server keeps (35 days). */
  history: number;
  days: UsageDay[];
  /** Today's and the last 7 days' split, when there is one. */
  breakdown?: { today?: UsageSplit; week?: UsageSplit };
}

export interface Agents {
  sessions: AgentSession[];
  plan: Partial<Record<AgentId, AgentPlan>>;
  usage: Partial<Record<AgentId, AgentUsage>>;
}

export const EMPTY_AGENTS: Agents = { sessions: [], plan: {}, usage: {} };

export const AGENT_NAMES: Record<AgentId, string> = { claude: "Claude", codex: "Codex" };
/** Each agent's colour on the island and the widget. */
export const AGENT_COLORS: Record<AgentId, string> = { claude: "#d97757", codex: "#10a37f" };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const text = (v: unknown, max = 80): string | undefined => (typeof v === "string" && v ? v.slice(0, max) : undefined);
const agentOf = (v: unknown): AgentId | undefined => (v === "claude" || v === "codex" ? v : undefined);

function windowOf(v: unknown): PlanWindow | undefined {
  if (!isObject(v)) return undefined;
  const used = num(v.used);
  if (used === undefined) return undefined;
  const resetsAt = num(v.resetsAt);
  return { used: Math.max(0, Math.min(100, used)), ...(resetsAt !== undefined ? { resetsAt } : {}) };
}

function sessionOf(v: unknown): AgentSession | null {
  if (!isObject(v)) return null;
  const agent = agentOf(v.agent);
  const key = text(v.key, 40);
  const since = num(v.since);
  const state = STATES.find((s) => s === v.state);
  if (!agent || !key || since === undefined || !state) return null;
  const opt = <K extends keyof AgentSession>(k: K, value: AgentSession[K] | undefined) => (value === undefined ? {} : { [k]: value });
  return {
    key,
    agent,
    project: text(v.project, 60) ?? "",
    state,
    since,
    ...opt("turnStart", num(v.turnStart)),
    ...opt("tool", text(v.tool, 60)),
    ...opt("subagents", num(v.subagents)),
    ...opt("lastTurnMs", num(v.lastTurnMs)),
    ...opt("context", num(v.context)),
    ...opt("cost", num(v.cost)),
    ...opt("model", text(v.model, 40)),
  };
}

function splitOf(v: unknown, maxProjects: number): UsageSplit | undefined {
  if (!isObject(v)) return undefined;
  const list = (l: unknown, max: number) =>
    (Array.isArray(l) ? l : []).flatMap((e): { name: string; total: number }[] => {
      const name = isObject(e) ? text(e.name, 60) : undefined;
      const total = isObject(e) ? num(e.total) : undefined;
      return name && total !== undefined ? [{ name, total }] : [];
    }).slice(0, max);
  const projects = list(v.projects, maxProjects);
  const models = list(v.models, 20);
  return projects.length || models.length ? { projects, models } : undefined;
}

function usageOf(v: unknown): AgentUsage | undefined {
  if (!isObject(v) || !Array.isArray(v.days)) return undefined;
  const days = v.days.flatMap((d): UsageDay[] =>
    isObject(d) && typeof d.day === "string"
      ? [{ day: d.day, input: num(d.input) ?? 0, output: num(d.output) ?? 0, cacheRead: num(d.cacheRead) ?? 0, cacheWrite: num(d.cacheWrite) ?? 0, total: num(d.total) ?? 0 }]
      : []
  );
  const today = isObject(v.breakdown) ? splitOf(v.breakdown.today, 5) : undefined;
  const week = isObject(v.breakdown) ? splitOf(v.breakdown.week, 5) : undefined;
  return { today: num(v.today) ?? 0, history: num(v.history) ?? 0, days, ...(today || week ? { breakdown: { ...(today ? { today } : {}), ...(week ? { week } : {}) } } : {}) };
}

/** Tolerant read of the server's `agents`. */
export function parseAgents(raw: unknown): Agents {
  if (!isObject(raw)) return EMPTY_AGENTS;
  const sessions = (Array.isArray(raw.sessions) ? raw.sessions : []).map(sessionOf).filter((s): s is AgentSession => s !== null);
  const plan: Agents["plan"] = {};
  const usage: Agents["usage"] = {};
  for (const id of AGENT_IDS) {
    const p = isObject(raw.plan) ? raw.plan[id] : undefined;
    if (isObject(p)) {
      const fiveHour = windowOf(p.fiveHour);
      const sevenDay = windowOf(p.sevenDay);
      if (fiveHour || sevenDay) plan[id] = { ...(fiveHour ? { fiveHour } : {}), ...(sevenDay ? { sevenDay } : {}), at: num(p.at) ?? 0 };
    }
    const u = usageOf(isObject(raw.usage) ? raw.usage[id] : undefined);
    if (u) usage[id] = u;
  }
  return { sessions, plan, usage };
}

/** A model's display name: "opus-5-5" is "Opus 5.5", "gpt-5.5" and the statusline's "Opus 5.5" stay as they are, and a trailing "(1M context)" goes. */
export function modelLabel(id: string): string {
  const name = id.replace(/\s*\([^)]*\)\s*$/, "") || id;
  const m = /^(opus|sonnet|haiku|fable)-(\d+(?:-\d+)*)$/.exec(name);
  return m ? `${m[1][0].toUpperCase()}${m[1].slice(1)} ${m[2].replace(/-/g, ".")}` : name;
}

/** "45s", "3m", "1h 5m". */
export function shortDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  return m % 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${Math.floor(m / 60)}h`;
}

/** 1.2M, 830k, 512. */
export function shortTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(Math.round(n));
}

/** What a session is doing, in a few words: "Bash · 3m", "needs you", "done in 4m". */
export function sessionStatus(s: AgentSession, now: number): string {
  switch (s.state) {
    case "working":
      return [s.tool, shortDuration(now - (s.turnStart ?? s.since))].filter(Boolean).join(" · ");
    case "waiting":
      return s.tool ? `needs you · ${s.tool}` : "needs you";
    case "done":
      return s.lastTurnMs !== undefined ? `done in ${shortDuration(s.lastTurnMs)}` : "done";
    case "error":
      return "stopped with an error";
    default:
      return "idle";
  }
}

/** The order sessions matter in: waiting, working, error, done, idle; then the newest. */
const RANK: Record<AgentState, number> = { waiting: 0, working: 1, error: 2, done: 3, idle: 4 };
export const bySalience = (a: AgentSession, b: AgentSession): number => RANK[a.state] - RANK[b.state] || b.since - a.since;

/** Plan numbers older than this are shown dimmed: the agent has not reported since. */
export const STALE_PLAN_MS = 10 * 60_000;
export const FIVE_HOUR_MS = 5 * 3_600_000;
export const SEVEN_DAY_MS = 7 * 86_400_000;

/** A window as of `now`: reset to 0 once its reset time has passed (the real figure is unknown until the agent reports), and how stale the report is. */
export function planView(w: PlanWindow, at: number, now: number): { used: number; reset: boolean; stale: boolean; age: number } {
  const reset = w.resetsAt !== undefined && now >= w.resetsAt;
  // An `at` of 0 is "never reported" (the server sent none): not stale, as there is nothing to date.
  const age = at > 0 ? now - at : 0;
  return { used: reset ? 0 : w.used, reset, stale: age > STALE_PLAN_MS, age };
}

/** When the window would reach 100 % at its average rate so far (ms), or null: too early to tell, nothing used, full already, or it resets first. */
export function paceHit(w: PlanWindow, at: number, windowMs: number): number | null {
  if (w.resetsAt === undefined || w.used < 5 || w.used >= 100) return null;
  const elapsed = at - (w.resetsAt - windowMs);
  if (elapsed < (windowMs <= FIVE_HOUR_MS ? 15 * 60_000 : 6 * 3_600_000)) return null;
  const hit = at + ((100 - w.used) * elapsed) / w.used;
  return hit < w.resetsAt ? hit : null;
}

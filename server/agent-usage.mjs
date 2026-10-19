// Token use of the coding agents, from their own session files, for the Agents widget:
//   Claude Code  ~/.claude/projects/<project>/<session>.jsonl   assistant lines' `message.usage`
//                (one request's usage repeats on several lines: counted once per `requestId`)
//   Codex        ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl   `event_msg` `token_count` lines:
//                `info.total_token_usage` (cumulative per session) and `rate_limits`
//
// Tokens are also split by project and by model: a Claude line's `cwd` and `message.model`, a Codex
// rollout's `session_meta` / `turn_context` (`cwd`, `model`). A session's project is its first cwd (a
// later `cd` into a subfolder does not move it), and a worktree counts as its repo. Only the project
// folder's name and the short model id are kept, never the path.
//
// Only numbers and timestamps are kept; the text of a line is parsed and dropped. Files are read
// from where the last scan stopped, so an active session costs only its new lines. Files untouched
// for longer than the history are skipped.
//
// Node built-ins only. `claudeLine`, `codexLine`, `codexContext`, `modelOf` and `dayKey` are pure.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { projectOf } from "./agents.mjs";

/** Days of history kept (the widget's graph). */
export const HISTORY_DAYS = 35;
const SCAN_MS = 60_000;
/** Bytes read at a time; a long file is read in steps, letting the server answer in between. */
const CHUNK = 8 * 1024 * 1024;
const breathe = () => new Promise((resolve) => setImmediate(resolve));

/** A timestamp's local day, "YYYY-MM-DD". */
export function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const n = (v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);

/** A model's short id: no `claude-` prefix or `-YYYYMMDD` date ("claude-opus-5-5" is "opus-5-5"); "" if unknown. */
export function modelOf(id) {
  if (typeof id !== "string" || id === "<synthetic>") return "";
  return id.replace(/^claude-/, "").replace(/-\d{8}$/, "").slice(0, 40);
}

/** A cwd with an agent worktree (`<repo>/.claude/worktrees/<name>`) as its repo. */
export const rootOf = (cwd) => (typeof cwd === "string" ? cwd.replace(/[\\/]\.claude[\\/]worktrees[\\/].*$/, "") : cwd);

/** A Claude transcript line's request id, day, tokens, project and model, or null. */
export function claudeLine(line) {
  let j;
  try {
    j = JSON.parse(line);
  } catch {
    return null;
  }
  const u = j?.message?.usage;
  if (j?.type !== "assistant" || typeof u !== "object" || u === null) return null;
  const at = Date.parse(j.timestamp);
  if (!Number.isFinite(at)) return null;
  const id = typeof j.requestId === "string" ? j.requestId : typeof j.message.id === "string" ? j.message.id : null;
  return {
    id,
    at,
    input: n(u.input_tokens),
    output: n(u.output_tokens),
    cacheRead: n(u.cache_read_input_tokens),
    cacheWrite: n(u.cache_creation_input_tokens),
    project: projectOf(rootOf(j.cwd)),
    model: modelOf(j.message.model),
  };
}

/** A Codex rollout's project (`session_meta`) or project and model (`turn_context`), or null. */
export function codexContext(line) {
  let j;
  try {
    j = JSON.parse(line);
  } catch {
    return null;
  }
  if (j?.type !== "session_meta" && j?.type !== "turn_context") return null;
  return { project: projectOf(rootOf(j.payload?.cwd)), model: j.type === "turn_context" ? modelOf(j.payload?.model) : "" };
}

/** A Codex rollout line's cumulative tokens and rate limits (a `token_count` event), or null. */
export function codexLine(line) {
  let j;
  try {
    j = JSON.parse(line);
  } catch {
    return null;
  }
  if (j?.type !== "event_msg" || j.payload?.type !== "token_count") return null;
  const at = Date.parse(j.timestamp);
  if (!Number.isFinite(at)) return null;
  const t = j.payload.info?.total_token_usage;
  const total = t
    ? { input: n(t.input_tokens) - n(t.cached_input_tokens), output: n(t.output_tokens), cacheRead: n(t.cached_input_tokens), cacheWrite: n(t.cache_write_input_tokens) }
    : null;
  return { at, total, limits: j.payload.rate_limits ?? null };
}

const ZERO = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const add = (a, b) => ({ input: a.input + b.input, output: a.output + b.output, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite });
const total = (t) => t.input + t.output + t.cacheRead + t.cacheWrite;
const EMPTY_SPLIT = { projects: {}, models: {} };
/** A day's split with `amount` more tokens under `project` and `model`. */
const bump = (split = EMPTY_SPLIT, project, model, amount) => ({
  projects: { ...split.projects, [project]: (split.projects[project] ?? 0) + amount },
  models: { ...split.models, [model]: (split.models[model] ?? 0) + amount },
});
const sub = (a, b) => ({ input: Math.max(0, a.input - b.input), output: Math.max(0, a.output - b.output), cacheRead: Math.max(0, a.cacheRead - b.cacheRead), cacheWrite: Math.max(0, a.cacheWrite - b.cacheWrite) });

/** Every .jsonl under `dir` changed since `since` (ms), recursively, as [path, stat]. */
function jsonlFiles(dir, since, depth = 4) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return depth > 0 ? jsonlFiles(p, since, depth - 1) : [];
    if (!e.name.endsWith(".jsonl")) return [];
    try {
      const st = fs.statSync(p);
      return st.mtimeMs >= since ? [[p, st]] : [];
    } catch {
      return [];
    }
  });
}

/** The new complete lines of a file since `offset`, and the offset after them (read without blocking the server). */
async function newLines(file, offset, size) {
  const length = Math.min(size - offset, CHUNK);
  if (length <= 0) return { lines: [], offset };
  const buf = Buffer.alloc(length);
  const fh = await fs.promises.open(file, "r");
  try {
    await fh.read(buf, 0, length, offset);
  } finally {
    await fh.close();
  }
  const text = buf.toString("utf8");
  const end = text.lastIndexOf("\n");
  if (end < 0) return { lines: [], offset };
  return { lines: text.slice(0, end).split("\n"), offset: offset + Buffer.byteLength(text.slice(0, end + 1)) };
}

/**
 * The usage reader. `totals()` is the last scan's result (cheap, for every publish): per agent the
 * tokens today, over the history, and per day; `codexLimits()` Codex's newest rate limits. `onScan` runs
 * after each scan, so a fresh result is published without waiting for the next sweep.
 */
export function createAgentUsage({ home = os.homedir(), now = () => Date.now(), scanMs = SCAN_MS, onScan = () => {} } = {}) {
  const claudeDir = path.join(home, ".claude", "projects");
  const codexDir = path.join(home, ".codex", "sessions");
  /** Per file: where reading stopped, the tokens by day, and (Claude) the requests counted; (Codex) the last cumulative total. */
  const files = new Map();
  let latestLimits = null;
  let latestLimitsAt = 0;
  let result = {};

  const readClaude = async (file, st) => {
    let f = files.get(file);
    if (!f || st.size < f.offset) f = { offset: 0, days: {}, split: {}, seen: new Set(), project: "" };
    for (;;) {
      const { lines, offset } = await newLines(file, f.offset, st.size);
      for (const line of lines) {
        const u = claudeLine(line);
        if (!u || (u.id && f.seen.has(u.id))) continue;
        if (u.id) f.seen.add(u.id);
        const day = dayKey(u.at);
        f.days[day] = add(f.days[day] ?? ZERO, u);
        f.project ||= u.project;
        f.split[day] = bump(f.split[day], f.project, u.model, total(u));
      }
      const moved = offset > f.offset;
      f = { ...f, offset };
      files.set(file, f);
      if (!moved || offset >= st.size) break;
      await breathe();
    }
  };

  const readCodex = async (file, st) => {
    let f = files.get(file);
    if (!f || st.size < f.offset) f = { offset: 0, days: {}, split: {}, last: ZERO, project: "", model: "" };
    for (;;) {
      const { lines, offset } = await newLines(file, f.offset, st.size);
      let { last, project, model } = f;
      for (const line of lines) {
        if (line.includes('"session_meta"') || line.includes('"turn_context"')) {
          const ctx = codexContext(line);
          if (ctx) {
            project ||= ctx.project;
            model = ctx.model || model;
          }
          continue;
        }
        const c = codexLine(line);
        if (!c) continue;
        if (c.total) {
          const day = dayKey(c.at);
          const delta = sub(c.total, last);
          f.days[day] = add(f.days[day] ?? ZERO, delta);
          f.split[day] = bump(f.split[day], project, model, total(delta));
          last = c.total;
        }
        if (c.limits && c.at >= latestLimitsAt) {
          latestLimits = c.limits;
          latestLimitsAt = c.at;
        }
      }
      const moved = offset > f.offset;
      f = { ...f, offset, last, project, model };
      files.set(file, f);
      if (!moved || offset >= st.size) break;
      await breathe();
    }
  };

  const summarize = (prefix) => {
    const today = dayKey(now());
    const from = now() - HISTORY_DAYS * 86_400_000;
    const days = {};
    for (const [file, f] of files) {
      if (!file.startsWith(prefix)) continue;
      for (const [day, t] of Object.entries(f.days)) if (Date.parse(`${day}T12:00:00`) >= from) days[day] = add(days[day] ?? ZERO, t);
    }
    const split = (from) => {
      const projects = {};
      const models = {};
      for (const [file, f] of files) {
        if (!file.startsWith(prefix)) continue;
        for (const [day, s] of Object.entries(f.split)) {
          if (!from.includes(day)) continue;
          for (const [k, v] of Object.entries(s.projects)) projects[k] = (projects[k] ?? 0) + v;
          for (const [k, v] of Object.entries(s.models)) models[k] = (models[k] ?? 0) + v;
        }
      }
      const ranked = (m) =>
        Object.entries(m)
          .filter(([name, t]) => name && t > 0)
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([name, t]) => ({ name, total: t }));
      const p = ranked(projects).slice(0, 5);
      const mo = ranked(models);
      return p.length || mo.length ? { projects: p, models: mo } : undefined;
    };
    const lastDays = Array.from({ length: 7 }, (_, i) => dayKey(now() - i * 86_400_000));
    const todaySplit = split([today]);
    const weekSplit = split(lastDays);
    const list = Object.entries(days)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, t]) => ({ day, ...t, total: total(t) }));
    if (list.length === 0) return undefined;
    const sum = list.reduce((acc, d) => acc + d.total, 0);
    const breakdown = { ...(todaySplit ? { today: todaySplit } : {}), ...(weekSplit ? { week: weekSplit } : {}) };
    return { today: list.find((d) => d.day === today)?.total ?? 0, history: sum, days: list, ...(weekSplit ? { breakdown } : {}) };
  };

  let scanning = false;
  const scan = async () => {
    if (scanning) return;
    scanning = true;
    try {
      const since = now() - HISTORY_DAYS * 86_400_000;
      for (const [file, st] of jsonlFiles(claudeDir, since)) {
        // A file being written or removed is read on the next scan.
        await readClaude(file, st).catch(() => {});
      }
      for (const [file, st] of jsonlFiles(codexDir, since)) await readCodex(file, st).catch(() => {});
    } finally {
      scanning = false;
    }
    const claude = summarize(claudeDir);
    const codex = summarize(codexDir);
    result = { ...(claude ? { claude } : {}), ...(codex ? { codex } : {}) };
    onScan();
  };

  let timer = null;
  return {
    scan,
    start() {
      void scan();
      timer = setInterval(() => void scan(), scanMs);
      timer.unref?.();
    },
    stop() {
      if (timer) clearInterval(timer);
    },
    totals: () => result,
    codexLimits: () => latestLimits,
    /** When Codex reported `codexLimits()`, ms (null before any). */
    codexLimitsAt: () => latestLimitsAt || null,
  };
}

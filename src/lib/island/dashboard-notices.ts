import type { CalendarEvent, ObsState } from "@/lib/extras";
import { AGENT_COLORS, AGENT_IDS, AGENT_NAMES, bySalience, sessionStatus, shortDuration, type Agents } from "@/lib/agents";
import type { IslandUpdate, SourceNotice } from "./sources";

/**
 * The dashboard's own notices beyond the Data API warning (`system.ts`), each switched on per
 * profile (`IslandConfig.notices`): the page name, a layout update, a plugin coming back, OBS on air
 * and the calendar countdown. Pure: the hooks in `use-dashboard-notices.ts` feed them.
 */

/** The source the dashboard's notices are raised as. */
export const DASHBOARD_SOURCE = "dashboard";
/** OBS and the calendar raise as their own sources, so each keeps its own activity. */
export const ON_AIR_SOURCE = "on-air";
export const CALENDAR_SOURCE = "calendar";

/** The page's name when the kiosk shows another page (nothing on the first page shown). */
export function pageNotice(prev: string | null, next: string): SourceNotice | null {
  if (prev === null || prev === next || next === "") return null;
  return { id: "page", severity: "info", title: next, body: "Page", ttl: 2000, refresh: true };
}

export const LAYOUT_NOTICE: SourceNotice = { id: "layout", severity: "info", title: "Layout updated", ttl: 2500 };

/**
 * The plugins that report again after they stopped. `gone` holds the ids seen missing since they
 * were last present; the result is the new `gone` and the notices. The first list (`prev` null) is
 * the baseline.
 */
export function pluginChanges(
  prev: ReadonlyMap<string, string> | null,
  next: ReadonlyMap<string, string>,
  gone: ReadonlySet<string>
): { gone: Set<string>; notices: SourceNotice[] } {
  if (!prev) return { gone: new Set(), notices: [] };
  const left = new Set(gone);
  for (const id of prev.keys()) if (!next.has(id)) left.add(id);
  const notices: SourceNotice[] = [];
  for (const [id, name] of next) {
    if (!left.has(id)) continue;
    left.delete(id);
    notices.push({ id: `plugin:${id}`, severity: "info", title: `${name} is back`, body: "Plugin reporting again", ttl: 4000 });
  }
  return { gone: left, notices };
}

/** OBS: a live dot while streaming or recording, and a notice when either starts or stops. */
export function onAirUpdate(prev: ObsState | null, next: ObsState): IslandUpdate {
  const live = next.connected && next.streaming;
  const rec = next.connected && next.recording;
  const activity =
    live || rec
      ? { id: "on-air", title: live ? "Live" : "Recording", ...(live && rec ? { subtitle: "Recording" } : {}), color: "#ef4444", priority: 2 }
      : null;
  if (!prev?.connected || !next.connected) return { activity };
  const notices: SourceNotice[] = [];
  if (prev.streaming !== next.streaming) notices.push({ id: "stream", severity: next.streaming ? "warning" : "info", title: next.streaming ? "You are live" : "Stream ended", ttl: 3000 });
  if (prev.recording !== next.recording) notices.push({ id: "record", severity: "info", title: next.recording ? "Recording started" : "Recording stopped", ttl: 3000 });
  return { notices, activity };
}

const MINUTE = 60_000;

/** "in 8 min", "in 1 h 5 min", "now". */
export function startsIn(ms: number): string {
  if (ms <= 0) return "now";
  const min = Math.ceil(ms / MINUTE);
  if (min < 60) return `in ${min} min`;
  const h = Math.floor(min / 60);
  return min % 60 ? `in ${h} h ${min % 60} min` : `in ${h} h`;
}

/**
 * The calendar at `now`: the next timed event within `leadMin` minutes counts down beside the time;
 * it opens the island once when the countdown starts and once when it begins. `announced` holds the
 * notices already raised (returned updated). All-day events are left out.
 */
export function calendarUpdate(
  events: readonly CalendarEvent[],
  now: number,
  leadMin: number,
  announced: ReadonlySet<string>
): IslandUpdate & { announced: Set<string> } {
  const lead = leadMin * MINUTE;
  const timed = events.filter((e) => !e.allDay && e.end > now);
  // Running events stay shown for their first five minutes; then the next one takes over.
  const next = timed.find((e) => e.start - now <= lead && now - e.start < 5 * MINUTE);
  const done = new Set([...announced].filter((k) => timed.some((e) => k.startsWith(`${e.id}:`))));
  if (!next) return { activity: null, notices: [], announced: done };
  const left = next.start - now;
  const notices: SourceNotice[] = [];
  const once = (key: string, n: SourceNotice) => {
    if (done.has(key)) return;
    done.add(key);
    notices.push(n);
  };
  const where = next.location ? ` · ${next.location}` : "";
  if (left > 0) once(`${next.id}:soon`, { id: `cal:${next.id}`, severity: "info", title: next.title, body: `${startsIn(left)}${where}`, ttl: 6000 });
  else once(`${next.id}:now`, { id: `cal:${next.id}`, severity: "warning", title: next.title, body: `Starting now${where}`, ttl: 8000 });
  const progress = left > 0 ? Math.max(0, Math.min(1, 1 - left / lead)) : 1;
  return { activity: { id: "next", title: next.title, subtitle: startsIn(left), progress, color: "#3b82f6", priority: 1 }, notices, announced: done };
}

/** The coding agents raise as their own sources: the activity and finished turns, and the sessions waiting for you. */
export const AGENTS_SOURCE = "agents";
export const AGENTS_WAITING_SOURCE = "agents-waiting";
/** A finished turn opens the island only when it ran at least this long, ms (short replies would flicker). */
export const AGENT_DONE_MIN_MS = 20_000;
/** Plan use that opens the island once per window when crossed, percent. */
const PLAN_LEVELS = [80, 95] as const;

const clockTime = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/**
 * The coding agents (`src/lib/agents.ts`): the most urgent session beside the time (waiting, then
 * working) with its plan use as the progress bar; a notice when a long turn finishes or fails, and
 * when a plan window passes 80 % or 95 %; and `waiting`, the complete set of sessions that need you
 * (synced as their own source, so each stays as a badge until answered).
 */
export function agentsUpdate(prev: Agents | null, next: Agents, now: number): IslandUpdate & { waiting: SourceNotice[] } {
  const active = next.sessions.filter((s) => s.state === "working" || s.state === "waiting").sort(bySalience);
  const top = active[0];
  const plan = top ? next.plan[top.agent]?.fiveHour : undefined;
  const activity = top
    ? {
        id: "agent",
        title: `${AGENT_NAMES[top.agent]}${top.project ? ` · ${top.project}` : ""}${active.length > 1 ? ` +${active.length - 1}` : ""}`,
        subtitle: sessionStatus(top, now),
        color: AGENT_COLORS[top.agent],
        pulse: top.state === "working",
        priority: top.state === "waiting" ? 3 : 1,
        ...(plan ? { progress: plan.used / 100 } : {}),
      }
    : null;
  const waiting: SourceNotice[] = next.sessions
    .filter((s) => s.state === "waiting")
    .map((s) => ({
      id: s.key,
      severity: "warning" as const,
      title: `${AGENT_NAMES[s.agent]} needs you`,
      body: [s.project, s.tool].filter(Boolean).join(" · ") || undefined,
      badge: true,
      ttl: 10_000,
    }));
  if (!prev) return { activity, notices: [], waiting };

  const notices: SourceNotice[] = [];
  const before = new Map(prev.sessions.map((s) => [s.key, s]));
  for (const s of next.sessions) {
    const was = before.get(s.key);
    if (!was || was.state === s.state) continue;
    const name = AGENT_NAMES[s.agent];
    if (s.state === "done" && (s.lastTurnMs ?? 0) >= AGENT_DONE_MIN_MS) {
      notices.push({ id: `done:${s.key}:${s.since}`, severity: "info", title: `${name} finished`, body: `${s.project ? `${s.project} · ` : ""}in ${shortDuration(s.lastTurnMs ?? 0)}`, ttl: 5000 });
    } else if (s.state === "error") {
      notices.push({ id: `error:${s.key}:${s.since}`, severity: "warning", title: `${name} stopped with an error`, ...(s.project ? { body: s.project } : {}), ttl: 8000 });
    }
  }
  for (const agent of AGENT_IDS) {
    for (const [label, key] of [["5-hour", "fiveHour"], ["weekly", "sevenDay"]] as const) {
      const was = prev.plan[agent]?.[key]?.used;
      const w = next.plan[agent]?.[key];
      if (was === undefined || !w) continue;
      const crossed = PLAN_LEVELS.filter((l) => was < l && w.used >= l).at(-1);
      if (crossed === undefined) continue;
      notices.push({
        id: `plan:${agent}:${key}:${crossed}:${w.resetsAt ?? ""}`,
        severity: "warning",
        title: `${AGENT_NAMES[agent]} plan at ${Math.round(w.used)}%`,
        body: `${label} limit${w.resetsAt ? ` · resets ${clockTime(w.resetsAt)}` : ""}`,
        ttl: 8000,
        cooldownMs: 3_600_000,
      });
    }
  }
  return { activity, notices, waiting };
}

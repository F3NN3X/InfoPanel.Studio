import { AGENT_NAMES, bySalience, modelLabel, planView, shortDuration, shortTokens, type AgentId, type AgentSession, type AgentUsage, type PlanWindow } from "@/lib/agents";
import { PulseDot } from "@/components/pulse-dot";
import { Bar, fitRows } from "../kit";
import { resetIn, shown, toneOf, type Percent, type PlanEntry } from "./limits";

/** A session's short status word: "busy", the running tool ("shell" for Bash), "waiting", "done", "idle". */
export function statusWord(s: AgentSession): string {
  switch (s.state) {
    case "working":
      return s.tool ? (s.tool === "Bash" ? "shell" : s.tool.toLowerCase()) : "busy";
    case "waiting":
      return "waiting";
    case "done":
      return "done";
    case "error":
      return "error";
    default:
      return "idle";
  }
}

interface LimitRow {
  key: string;
  label: string;
  w: PlanWindow;
  stale: boolean;
  reset: boolean;
}

/** "opus" is "Opus", "opus-5-5" is "Opus 5.5". */
const extraName = (name: string) => modelLabel(name).replace(/^./, (c) => c.toUpperCase());

/** Every window of every plan as a labelled row: "Session (5h)", "Weekly", then "<Name> weekly" per extra; prefixed with the agent when more than one shows. */
export function limitRows(plans: PlanEntry[], now: number): LimitRow[] {
  const prefix = (id: AgentId) => (plans.length > 1 ? `${AGENT_NAMES[id]} · ` : "");
  return plans.flatMap(([id, plan]) => {
    const windows: [string, string, PlanWindow][] = [
      ...(plan.fiveHour ? [["5h", "Session (5h)", plan.fiveHour] satisfies [string, string, PlanWindow]] : []),
      ...(plan.sevenDay ? [["7d", "Weekly", plan.sevenDay] satisfies [string, string, PlanWindow]] : []),
      ...(plan.extra ?? []).map((e): [string, string, PlanWindow] => [`x-${e.name}`, `${extraName(e.name)} weekly`, e]),
    ];
    return windows.map(([k, label, w]): LimitRow => {
      const v = planView(w, plan.at, now);
      return { key: `${id}-${k}`, label: prefix(id) + label, w: { ...w, used: v.used }, stale: v.stale, reset: v.reset };
    });
  });
}

const rightText = (r: LimitRow, percent: Percent, now: number) => {
  const pct = `${shown(r.w, percent)}%`;
  return r.w.resetsAt !== undefined && !r.reset && r.w.resetsAt > now ? `${pct} · resets ${resetIn(r.w.resetsAt - now)}` : pct;
};

const GAP = 12;
const LIMIT_H = 28;
const LIMIT_GAP = 10;
const HEAD_H = 14;
const ROW_H = 18;
const FOOT_H = 16;
const LIMIT_BIG_H = 44;

const Heading = ({ children }: { children: string }) => <div className="shrink-0 text-micro font-semibold uppercase tracking-wider text-[color:var(--w-faint)]">{children}</div>;

/** Limits view: only the limit rows, large, spread over the height. */
export function LimitsView({ plans, percent, now, h }: { plans: PlanEntry[]; percent: Percent; now: number; h: number }) {
  const rows = limitRows(plans, now).slice(0, fitRows(h, LIMIT_BIG_H, LIMIT_GAP));
  return (
    <div className="flex h-full min-w-0 flex-col justify-between overflow-hidden">
      {rows.map((r) => (
        <div key={r.key} className="flex min-w-0 flex-col gap-2" style={{ opacity: r.stale && !r.reset ? 0.55 : undefined }}>
          <div className="flex min-w-0 items-baseline gap-2">
            <span className="truncate text-[14px] font-semibold text-[color:var(--w-fg)]">{r.label}</span>
            <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-[color:var(--w-muted)]">{rightText(r, percent, now)}</span>
          </div>
          <Bar value={r.w.used} t={toneOf(r.w)} className="h-4" />
        </div>
      ))}
    </div>
  );
}

export interface SummaryProps {
  plans: PlanEntry[];
  ids: AgentId[];
  usage: Partial<Record<AgentId, AgentUsage>>;
  sessions: AgentSession[];
  percent: Percent;
  now: number;
  todayKey: string;
  h: number;
  dot: (s: AgentSession) => string;
}

/** Summary view: the plan limits, today's tokens, the sessions and a footer; the sessions drop first when short, then today. */
export function SummaryView({ plans, ids, usage, sessions, percent, now, todayKey, h, dot }: SummaryProps) {
  const rows = limitRows(plans, now);
  const claude = plans.find(([id]) => id === "claude")?.[1];
  const first = plans[0]?.[1];
  const age = first ? planView({ used: 0 }, first.at, now) : null;

  let room = h - FOOT_H - GAP;
  const nLimits = Math.min(rows.length, fitRows(room, LIMIT_H, LIMIT_GAP));
  room -= nLimits ? nLimits * LIMIT_H + (nLimits - 1) * LIMIT_GAP : 0;

  const days = ids.flatMap((id) => usage[id]?.days.filter((d) => d.day === todayKey) ?? []);
  const topModel = ids
    .flatMap((id) => usage[id]?.breakdown?.today?.models ?? [])
    .reduce<{ name: string; total: number } | undefined>((a, m) => (!a || m.total > a.total ? m : a), undefined);
  const sectionH = GAP + HEAD_H + 4;
  const showToday = days.length > 0 && room >= sectionH + ROW_H;
  if (showToday) room -= sectionH + ROW_H;
  const ordered = [...sessions].sort(bySalience);
  const nSessions = ordered.length && room >= sectionH + ROW_H ? Math.min(ordered.length, fitRows(room - sectionH, ROW_H, 6)) : 0;

  const output = days.reduce((n, d) => n + d.output, 0);
  const input = days.reduce((n, d) => n + d.input + d.cacheRead + d.cacheWrite, 0);

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden" style={{ gap: GAP }}>
      {nLimits > 0 && (
        <div className="flex min-w-0 flex-col" style={{ gap: LIMIT_GAP }}>
          {rows.slice(0, nLimits).map((r) => (
            <div key={r.key} className="flex min-w-0 flex-col gap-1.5" style={{ opacity: r.stale && !r.reset ? 0.55 : undefined }}>
              <div className="flex min-w-0 items-baseline gap-2 text-xs">
                <span className="truncate font-semibold text-[color:var(--w-fg)]">{r.label}</span>
                <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-[color:var(--w-muted)]">{rightText(r, percent, now)}</span>
              </div>
              <Bar value={r.w.used} t={toneOf(r.w)} className="h-1.5" />
            </div>
          ))}
        </div>
      )}
      {showToday && (
        <div className="flex min-w-0 flex-col gap-1">
          <Heading>Today</Heading>
          <div className="flex min-w-0 items-baseline gap-2 text-xs">
            <span className="truncate text-[color:var(--w-fg)]">{topModel ? modelLabel(topModel.name) : "Tokens"}</span>
            <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-[color:var(--w-muted)]">
              {shortTokens(output)} out · {shortTokens(input)} in
            </span>
          </div>
        </div>
      )}
      {nSessions > 0 && (
        <div className="flex min-w-0 flex-col gap-1">
          <Heading>Sessions</Heading>
          <ul className="flex min-w-0 flex-col gap-1.5">
            {ordered.slice(0, nSessions).map((s) => (
              <li key={s.key} className="flex min-w-0 items-center gap-2 text-xs" style={{ height: ROW_H }}>
                <PulseDot color={dot(s)} pulse={s.state === "working"} label={s.state} className="h-2 w-2 shrink-0 rounded-full" />
                <span className="truncate text-[color:var(--w-fg)]">{s.project || AGENT_NAMES[s.agent]}</span>
                <span className="ml-auto shrink-0 text-[11px] text-[color:var(--w-muted)]">{statusWord(s)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {age && (
        <div className="mt-auto flex min-w-0 shrink-0 items-baseline gap-2 text-[11px] text-[color:var(--w-muted)]" style={{ height: FOOT_H }}>
          <span className="truncate">
            {age.stale ? "stale" : "live"}
            {age.age > 0 ? ` · ${shortDuration(age.age)} ago` : ""}
          </span>
          {claude?.version && <span className="ml-auto shrink-0 font-mono tabular-nums">cc {claude.version}</span>}
        </div>
      )}
    </div>
  );
}

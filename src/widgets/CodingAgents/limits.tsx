import { AGENT_COLORS, AGENT_NAMES, FIVE_HOUR_MS, SEVEN_DAY_MS, paceHit, planView, shortDuration, type AgentId, type AgentPlan, type PlanWindow } from "@/lib/agents";
import { Bar, Icon, Num, Ring, TONES } from "../kit";

export type LimitStyle = "bars" | "rings";
export type Percent = "used" | "left";
/** How much each agent's limits take: a card per window, one line with two bars, or a line of numbers. */
export type Density = "full" | "row" | "list";

export type PlanEntry = readonly [AgentId, AgentPlan];

const WINDOWS = [
  ["fiveHour", "5h", "5-hour", FIVE_HOUR_MS],
  ["sevenDay", "1w", "Weekly", SEVEN_DAY_MS],
] as const;

/** A window as it reads now: its use after a reset, whether the report is stale, and when it would run out at its pace so far. */
interface WindowView {
  w: PlanWindow;
  reset: boolean;
  stale: boolean;
  age: number;
  hit: number | null;
}

/** Each window of `plan` that exists, with its label and view at `now`. */
function windowsOf(plan: AgentPlan, now: number) {
  return WINDOWS.flatMap(([k, short, label, ms]) => {
    const w = plan[k];
    if (!w) return [];
    const { used, reset, stale, age } = planView(w, plan.at, now);
    const hit = reset || stale ? null : paceHit(w, plan.at, ms);
    const view: WindowView = { w: { ...w, used }, reset, stale, age, hit: hit !== null && hit > now ? hit : null };
    return [{ k, short, label, view }];
  });
}
/** A stale (not reset) window's number and bar are dimmed. */
const dimmed = (v: WindowView) => v.stale && !v.reset;
const DIM = 0.55;
const DIM_CLASS = "opacity-[0.55]";

/** A plan window's tone: amber past 80 %, red past 95 % (always by use, whichever way it reads). */
export const toneOf = (w: PlanWindow) => (w.used >= 95 ? "crit" : w.used >= 80 ? "warn" : "ok");
/** The number a window shows: its use, or what is left of it. */
export const shown = (w: PlanWindow, percent: Percent) => Math.round(percent === "left" ? 100 - w.used : w.used);

/** "15:00" for a reset later today, "Fri 15:00" further out. */
export function resetText(at: number, now: number): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return at - now < 20 * 3_600_000 ? time : `${d.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
}

/** "8m", "4h 30m", "2d 6h": how long until a reset. */
export function resetIn(ms: number): string {
  if (ms < 86_400_000) return shortDuration(ms);
  const h = Math.floor(ms / 3_600_000);
  return h % 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h / 24}d`;
}

/* Heights each layout needs, px: the body fits the limits by these before it draws them. */
const AGENT_GAP = 12;
const LIST_H = 16;
const ROW_H = 30;
const HEAD_H = 18;
const WINDOW_H = 40;
const fullH = (n: number) => n * (HEAD_H + 2 * WINDOW_H + 8) + (n - 1) * AGENT_GAP;
const rowH = (n: number) => n * ROW_H + (n - 1) * 8;
const listH = (n: number) => n * LIST_H + (n - 1) * 6;

/** The roomiest bar density whose height fits `room`, or null. */
export function barDensity(n: number, room: number): Density | null {
  if (room >= fullH(n)) return "full";
  if (room >= rowH(n)) return "row";
  if (room >= listH(n)) return "list";
  return null;
}
export const densityH = (d: Density, n: number) => (d === "full" ? fullH(n) : d === "row" ? rowH(n) : listH(n));

export interface RingLayout {
  /** Ring diameter, px. */
  d: number;
  /** Agents side by side rather than stacked. */
  across: boolean;
  /** The reset times beside the rings. */
  details: boolean;
  /** Room for a pace line under each reset. */
  pace: boolean;
  h: number;
}
const RING_MIN = 44;
const RING_MAX = 104;
const RING_GAP = 10;
const DETAILS_W = 150;
/** Two windows' label and reset line. */
const DETAILS_H = 66;
/** The same with a pace line under each reset. */
const PACE_H = 96;

/** The biggest rings that fit `w` × `room` (agents stacked or side by side), or null when they would be too small. */
export function ringLayout(n: number, w: number, room: number): RingLayout | null {
  const fit = (across: boolean) => {
    const colW = across ? (w - (n - 1) * AGENT_GAP) / n : w;
    const rows = across ? 1 : n;
    const byH = (room - rows * (HEAD_H + 4) - (rows - 1) * AGENT_GAP) / rows;
    const d = Math.floor(Math.min(byH, (colW - RING_GAP) / 2, RING_MAX));
    // The reset times beside the rings need their own height, and width.
    const details = colW - 2 * d - RING_GAP - 16 >= DETAILS_W && byH >= DETAILS_H;
    const pace = details && byH >= PACE_H;
    return { d, across, details, pace, h: rows * (HEAD_H + 4 + Math.max(d, details ? (pace ? PACE_H : DETAILS_H) : 0)) + (rows - 1) * AGENT_GAP };
  };
  const best = [fit(false), ...(n > 1 ? [fit(true)] : [])].reduce((a, b) => (b.d > a.d ? b : a));
  return best.d >= RING_MIN ? best : null;
}

function AgentName({ id }: { id: AgentId }) {
  return (
    <div className="flex h-[18px] min-w-0 items-center gap-1.5 text-[13px] font-semibold text-[color:var(--w-fg)]">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: AGENT_COLORS[id] }} />
      <span className="truncate">{id === "claude" ? "Claude Code" : AGENT_NAMES[id]}</span>
    </div>
  );
}

const Pct = ({ view, percent }: { view: WindowView; percent: Percent }) => (
  <Num weight={600} style={{ color: view.w.used >= 80 ? TONES[toneOf(view.w)] : "var(--w-fg)", opacity: dimmed(view) ? DIM : undefined }}>
    {shown(view.w, percent)}%
  </Num>
);

const ResetLine = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-w-0 items-center gap-1 text-[10.5px] text-[color:var(--w-faint)]">
    <Icon name="schedule" className="!text-[11px] shrink-0" />
    <span className="truncate tabular-nums">{children}</span>
  </div>
);

/** "Full at 14:20 at this pace", in the warn colour. */
const PaceText = ({ hit, now }: { hit: number; now: number }) => <span style={{ color: TONES.warn }}>Full at {resetText(hit, now)} at this pace</span>;

/** The reset line: a countdown (with the time and, when stale, the report's age on wide layouts), or the pace when `pace` is set and there is one. */
const Reset = ({ view, now, wide, pace = false }: { view: WindowView; now: number; wide: boolean; pace?: boolean }) => {
  const { w, reset, stale, age, hit } = view;
  if (w.resetsAt === undefined) return null;
  if (reset) return <ResetLine>New window</ResetLine>;
  if (pace && hit !== null) {
    return (
      <ResetLine>
        <PaceText hit={hit} now={now} />
        {wide && ` · resets ${resetText(w.resetsAt, now)}`}
      </ResetLine>
    );
  }
  return (
    <ResetLine>
      Resets in {resetIn(Math.max(0, w.resetsAt - now))}
      {wide && ` · ${resetText(w.resetsAt, now)}`}
      {wide && stale && ` · as of ${shortDuration(age)}`}
    </ResetLine>
  );
};

/** One agent as a card: each window with its label, number, bar and reset (the iOS widget's layout). */
function FullBars({ id, plan, percent, now, wide }: { id: AgentId; plan: AgentPlan; percent: Percent; now: number; wide: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <AgentName id={id} />
      {windowsOf(plan, now).map(({ k, label, view }) => (
        <div key={k} className="flex h-[36px] min-w-0 flex-col justify-between">
          <div className="flex items-baseline justify-between gap-2 text-xs text-[color:var(--w-muted)]">
            <span className="truncate">{label}</span>
            <span className="shrink-0">
              <Pct view={view} percent={percent} /> {percent}
            </span>
          </div>
          <Bar value={shown(view.w, percent)} t={toneOf(view.w)} className={`h-1.5 ${dimmed(view) ? DIM_CLASS : ""}`} />
          <Reset view={view} now={now} wide={wide} pace />
        </div>
      ))}
    </div>
  );
}

/** One agent on one line: its name and a short bar per window. */
function RowBars({ id, plan, percent, now, wide }: { id: AgentId; plan: AgentPlan; percent: Percent; now: number; wide: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs">
      <span className="shrink-0 font-semibold" style={{ color: AGENT_COLORS[id] }}>
        {AGENT_NAMES[id]}
      </span>
      {windowsOf(plan, now).map(({ k, short, view }) => (
        <div key={k} className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex min-w-0 items-baseline justify-between gap-1 text-[10.5px] text-[color:var(--w-muted)]">
            <span className="truncate">
              {short} <Pct view={view} percent={percent} />
            </span>
            {wide && view.w.resetsAt !== undefined && (
              <span className="shrink-0 truncate tabular-nums text-[color:var(--w-faint)]">{view.reset ? "new window" : resetText(view.w.resetsAt, now)}</span>
            )}
          </div>
          <Bar value={shown(view.w, percent)} t={toneOf(view.w)} className={`h-1 ${dimmed(view) ? DIM_CLASS : ""}`} />
        </div>
      ))}
    </div>
  );
}

/** One agent as a line of numbers: "● Claude   32%  70%". */
function ListLine({ id, plan, percent, now }: { id: AgentId; plan: AgentPlan; percent: Percent; now: number }) {
  return (
    <div className="flex h-4 min-w-0 items-center gap-2 text-xs">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: AGENT_COLORS[id] }} />
      <span className="min-w-0 flex-1 truncate text-[color:var(--w-fg)]">{AGENT_NAMES[id]}</span>
      {windowsOf(plan, now).map(({ k, view }) => (
        <Pct key={k} view={view} percent={percent} />
      ))}
    </div>
  );
}

function RingPair({ id, plan, percent, now, layout }: { id: AgentId; plan: AgentPlan; percent: Percent; now: number; layout: RingLayout }) {
  const { d } = layout;
  const big = Math.round(Math.max(11, Math.min(24, d * 0.24)));
  const small = Math.round(Math.max(9, Math.min(13, d * 0.13)));
  const wins = windowsOf(plan, now);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <AgentName id={id} />
      <div className="flex min-w-0 items-center" style={{ gap: RING_GAP }}>
        {wins.map(({ k, short, view }) => (
          <div key={k} className={`shrink-0 ${dimmed(view) ? DIM_CLASS : ""}`} style={{ width: d, height: d }}>
            <Ring value={shown(view.w, percent)} t={toneOf(view.w)} thickness={d >= 72 ? 9 : 11} className="h-full w-full">
              {d >= 56 && (
                <span className="mb-1 leading-none text-[color:var(--w-muted)]" style={{ fontSize: small }}>
                  {short}
                </span>
              )}
              <span className="leading-none" style={{ fontSize: big }}>
                <Pct view={{ ...view, stale: false }} percent={percent} />
              </span>
            </Ring>
          </div>
        ))}
        {layout.details && (
          <div className="ml-2 flex min-w-0 flex-1 flex-col gap-2">
            {wins.map(({ k, label, view }) => (
              <div key={k} className="flex min-w-0 flex-col">
                <span className="truncate text-xs font-semibold text-[color:var(--w-fg)]">
                  {label} <span className="font-normal text-[color:var(--w-muted)]">{percent}</span>
                </span>
                <Reset view={view} now={now} wide />
                {layout.pace && view.hit !== null && (
                  <div className="truncate text-[10.5px] tabular-nums">
                    <PaceText hit={view.hit} now={now} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export interface LimitsProps {
  plans: readonly PlanEntry[];
  percent: Percent;
  now: number;
  wide: boolean;
}

export function BarLimits({ plans, density, ...p }: LimitsProps & { density: Density }) {
  return (
    <div className="flex shrink-0 flex-col" style={{ gap: density === "full" ? AGENT_GAP : density === "row" ? 8 : 6 }}>
      {plans.map(([id, plan]) =>
        density === "full" ? <FullBars key={id} id={id} plan={plan} {...p} /> : density === "row" ? <RowBars key={id} id={id} plan={plan} {...p} /> : <ListLine key={id} id={id} plan={plan} percent={p.percent} now={p.now} />
      )}
    </div>
  );
}

export function RingLimits({ plans, layout, percent, now }: Omit<LimitsProps, "wide"> & { layout: RingLayout }) {
  return (
    <div className={`flex shrink-0 ${layout.across ? "flex-row" : "flex-col"}`} style={{ gap: AGENT_GAP }}>
      {plans.map(([id, plan]) => (
        <div key={id} className="min-w-0 flex-1">
          <RingPair id={id} plan={plan} percent={percent} now={now} layout={layout} />
        </div>
      ))}
    </div>
  );
}

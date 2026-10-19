import { AGENT_COLORS, modelLabel, shortTokens, type AgentUsage } from "@/lib/agents";
import { Bar } from "../kit";
import { HEADER_H } from "./history";

export interface Slice {
  name: string;
  total: number;
  /** Of the week's total, 0-1. */
  share: number;
}

export interface BreakdownData {
  /** The week's tokens. */
  total: number;
  /** The top models by share, the rest merged as "Other". */
  models: Slice[];
  /** Every project, largest first. */
  projects: Slice[];
}

/** A day's tokens by type; cache is read plus write. */
export interface TokenTypes {
  input: number;
  output: number;
  cache: number;
}

/** Most model segments before the rest merge into "Other". */
const MAX_MODELS = 4;
/** Segment colours, fixed so a model keeps its colour; "Other" is the faint one. */
const PALETTE = [AGENT_COLORS.claude, AGENT_COLORS.codex, "#6366f1", "#eab308"];
const OTHER = "var(--w-faint)";
/** The model bar with its legend, and the space above it. */
const MODEL_H = 24;
const MODEL_GAP = 6;
/** A project row (name line, then bar), and the space above each. */
const ROW_H = 18;
const ROW_GAP = 4;
const TOKENS_H = 16;

/** The height the header, the model split (when there are models), `rows` project rows and the by-type line (when asked) take. */
export const breakdownH = (rows: number, withTokens: boolean, withModels = true) =>
  HEADER_H + (withModels ? MODEL_GAP + MODEL_H : 0) + rows * (ROW_GAP + ROW_H) + (withTokens ? ROW_GAP + TOKENS_H : 0);

/** Name → total, added up over `lists`, largest first. */
function sumByName(lists: readonly { name: string; total: number }[][]): { name: string; total: number }[] {
  const sums = new Map<string, number>();
  for (const l of lists) for (const e of l) sums.set(e.name, (sums.get(e.name) ?? 0) + e.total);
  return [...sums.entries()].map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total);
}

/** The week's split of the shown agents combined, or null when none of them has one. */
export function breakdownOf(usages: readonly (AgentUsage | undefined)[]): BreakdownData | null {
  const weeks = usages.flatMap((u) => (u?.breakdown?.week ? [u.breakdown.week] : []));
  if (weeks.length === 0) return null;
  const models = sumByName(weeks.map((w) => w.models.map((e) => ({ ...e, name: modelLabel(e.name) }))));
  const projects = sumByName(weeks.map((w) => w.projects));
  const total = (models.length ? models : projects).reduce((sum, e) => sum + e.total, 0);
  if (total <= 0) return null;
  const share = (e: { name: string; total: number }): Slice => ({ ...e, share: e.total / total });
  const top = models.slice(0, MAX_MODELS).map((e) => share(e));
  const rest = models.slice(MAX_MODELS).reduce((sum, e) => sum + e.total, 0);
  return { total, models: rest > 0 ? [...top, share({ name: "Other", total: rest })] : top, projects: projects.map(share) };
}

/** Today's tokens by type, added up over the shown agents, or null when they have none. */
export function tokensToday(usages: readonly (AgentUsage | undefined)[], todayKey: string): TokenTypes | null {
  const days = usages.flatMap((u) => u?.days.filter((d) => d.day === todayKey) ?? []);
  const sum = days.reduce((a, d) => ({ input: a.input + d.input, output: a.output + d.output, cache: a.cache + d.cacheRead + d.cacheWrite }), { input: 0, output: 0, cache: 0 });
  return sum.input + sum.output + sum.cache > 0 ? sum : null;
}

const colorOf = (s: Slice, i: number) => (s.name === "Other" ? OTHER : PALETTE[i % PALETTE.length]);
const pct = (share: number) => `${Math.round(share * 100)}%`;

/** This week's tokens by model (one stacked bar and its legend) and by project, and today's by type when `tokens` is given. */
export function Breakdown({ data, rows, tokens }: { data: BreakdownData; rows: number; tokens?: TokenTypes | null }) {
  const projects = data.projects.slice(0, rows);
  return (
    <div className="flex shrink-0 flex-col" style={{ height: breakdownH(rows, !!tokens, data.models.length > 0) }}>
      <div className="flex items-baseline justify-between gap-2 text-[11px] text-[color:var(--w-muted)]" style={{ height: HEADER_H }}>
        <span className="truncate">This week</span>
        <span className="shrink-0 tabular-nums text-[color:var(--w-fg)]">{shortTokens(data.total)}</span>
      </div>
      {data.models.length > 0 && (
        <div className="flex min-w-0 flex-col justify-between" style={{ height: MODEL_H, marginTop: MODEL_GAP }}>
          <div className="flex h-1.5 w-full gap-px overflow-hidden rounded-full bg-[color:var(--w-track)]" role="img" aria-label="Tokens by model">
            {data.models.map((m, i) => (
              <span key={m.name} title={`${m.name} ${pct(m.share)}`} style={{ width: `${m.share * 100}%`, background: colorOf(m, i) }} />
            ))}
          </div>
          <div className="truncate text-[10.5px] tabular-nums leading-[14px] text-[color:var(--w-muted)]">
            {data.models.map((m, i) => (
              <span key={m.name}>
                {i > 0 && <span className="text-[color:var(--w-faint)]"> · </span>}
                <span style={{ color: colorOf(m, i) }}>●</span> {m.name} {pct(m.share)}
              </span>
            ))}
          </div>
        </div>
      )}
      {projects.map((p) => (
        <div key={p.name} className="flex min-w-0 flex-col justify-end gap-[3px]" style={{ height: ROW_H, marginTop: ROW_GAP }}>
          <div className="flex min-w-0 items-baseline justify-between gap-2 text-[11px] leading-[12px]">
            <span className="truncate text-[color:var(--w-fg)]">{p.name}</span>
            <span className="shrink-0 tabular-nums text-[color:var(--w-muted)]">{pct(p.share)}</span>
          </div>
          <Bar value={p.share * 100} className="h-[3px]" />
        </div>
      ))}
      {tokens && (
        <div className="flex items-end truncate text-[10.5px] tabular-nums text-[color:var(--w-faint)]" style={{ height: TOKENS_H, marginTop: ROW_GAP }}>
          in {shortTokens(tokens.input)} · out {shortTokens(tokens.output)} · cache {shortTokens(tokens.cache)}
        </div>
      )}
    </div>
  );
}

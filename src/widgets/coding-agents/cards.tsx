import { Bot, Folder, MinusCircle, Sparkles } from "lucide-react";
import type { AgentSession } from "@/lib/agents";
import { AGENT_FULL_NAMES, ANSWER_ELSEWHERE } from "@/lib/agent-requests";
import { TONES, useSkin, type SkinContext } from "../kit";
import { agentColour } from "./colours";

/*
 * Coding Agents' Sessions view (pinned layer P8, owner Q7, mockup 02): the roomy page view, a card per session with what it is
 * doing. A card never answers a permission request: it can't show everything the tool would get, and this page runs widget
 * code that must not reach an answer. A waiting card says what it waits for and where to answer: InfoPanel Studio's own
 * prompt window on this PC (src/agent-prompt/), or the terminal. The mockup's Open and Stop have nothing behind them, so they
 * are not drawn.
 */

const clock = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/** The card's state line: "waiting since 14:31", "working since 14:12", "done 14:05", "idle". */
export function stateLine(s: AgentSession): string {
  if (s.state === "waiting" || s.state === "working") return `${s.state} since ${clock(s.since)}`;
  if (s.state === "done") return `done ${clock(s.since)}`;
  return s.state === "error" ? "stopped with an error" : "idle";
}

/** What the session does, in a sentence. */
export function doingLine(s: AgentSession): string {
  if (s.state === "waiting") return s.tool ? `Wants to use ${s.tool}` : "Waiting for you";
  if (s.state === "working") return s.tool ? `Using ${s.tool}` : "Working";
  if (s.state === "done") return `Finished ${clock(s.since)}`;
  return s.state === "error" ? "Stopped with an error" : "Nothing running";
}

const tone = (sk: Pick<SkinContext, "series">, s: AgentSession) => (s.state === "waiting" ? TONES.warn : s.state === "error" ? TONES.crit : s.state === "working" ? agentColour(sk, s.agent) : "var(--w-faint)");

function Card({ s }: { s: AgentSession }) {
  const sk = useSkin();
  const Icon = s.state === "idle" || s.state === "done" ? MinusCircle : s.agent === "claude" ? Sparkles : Bot;
  return (
    <li
      data-agent-card={s.key}
      className="relative flex min-h-0 items-center gap-4 overflow-hidden rounded-2xl py-4 pl-6 pr-4"
      style={{ background: "color-mix(in oklab, var(--w-fg) 4%, transparent)", boxShadow: `inset 0 0 0 1px ${s.state === "waiting" ? `color-mix(in oklab, ${TONES.warn} 35%, transparent)` : "var(--w-track)"}` }}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: tone(sk, s) }} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          <Icon aria-hidden size={20} className="shrink-0 self-center" style={{ color: tone(sk, s) }} />
          <span className="min-w-0 truncate text-stat font-semibold leading-tight">{AGENT_FULL_NAMES[s.agent]}</span>
          <span className="shrink-0 truncate text-lead" style={{ color: s.state === "waiting" || s.state === "working" ? tone(sk, s) : "var(--w-muted)" }}>
            {stateLine(s)}
          </span>
        </div>
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[15px]">
          <span className="shrink-0">{doingLine(s)}</span>
          {s.state === "waiting" && (
            <span className="min-w-0 text-[13px]" style={{ color: "var(--w-muted)" }}>
              {ANSWER_ELSEWHERE}
            </span>
          )}
        </div>
        {s.project && (
          <span className="flex min-w-0 items-center gap-1.5 text-[13px]" style={{ color: "var(--w-muted)" }}>
            <Folder aria-hidden size={14} className="shrink-0" />
            <span className="truncate">{s.project}</span>
          </span>
        )}
      </div>
    </li>
  );
}

export interface SessionCardsProps {
  sessions: AgentSession[];
  /** The rows that fit. */
  rows: number;
}

/** The heading's count and the cards. */
export function SessionCards({ sessions, rows }: SessionCardsProps) {
  const waiting = sessions.filter((s) => s.state === "waiting").length;
  return (
    <div className="flex h-full min-h-0 flex-col gap-3" style={{ color: "var(--w-fg)" }}>
      <header className="flex shrink-0 items-baseline gap-3">
        <span className="text-[13px]" style={{ color: "var(--w-muted)" }}>
          {sessions.length} connected
        </span>
        {waiting > 0 && (
          <span className="ml-auto flex items-center gap-2 text-lead font-semibold" style={{ color: TONES.warn }}>
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: TONES.warn }} />
            {waiting === 1 ? "One needs you" : `${waiting} need you`}
          </span>
        )}
      </header>
      <ul className="flex min-h-0 flex-col gap-3">
        {sessions.slice(0, rows).map((s) => (
          <Card key={s.key} s={s} />
        ))}
      </ul>
    </div>
  );
}

/** A card's height and the gap between cards, px. */
export const CARD_H = 112;
export const CARD_GAP = 12;

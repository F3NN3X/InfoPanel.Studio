import { Bot, Folder, MinusCircle, Sparkles } from "lucide-react";
import { AGENT_COLORS, type AgentSession } from "@/lib/agents";
import { AGENT_FULL_NAMES, answerRequest, forget, useAgentRequests, type AgentRequest, type Behavior } from "@/lib/agent-requests";
import { HoldButton } from "@/components/hold-button";
import { TONES } from "../kit";

/*
 * Coding Agents' Sessions view (pinned layer P8, owner Q7, mockup 02): the roomy page view, a card per session with what it is
 * doing and, while one waits for permission on this PC's kiosk, Deny and Hold to allow, the same answers the prompt gives
 * (lib/agent-requests.ts). Elsewhere (the studio, another device, a request gone back to the terminal) a waiting card says what
 * it waits for and offers nothing. The mockup's Open and Stop have nothing behind them, so they are not drawn.
 */

const clock = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

/** The card's state line: "waiting since 14:31", "working since 14:12", "done 14:05", "idle". */
export function stateLine(s: AgentSession): string {
  if (s.state === "waiting" || s.state === "working") return `${s.state} since ${clock(s.since)}`;
  if (s.state === "done") return `done ${clock(s.since)}`;
  return s.state === "error" ? "stopped with an error" : "idle";
}

/** What the session does, in a sentence; a waiting one names its command when this kiosk has it. */
export function doingLine(s: AgentSession, request: AgentRequest | undefined): string {
  if (s.state === "waiting") return request ? "Wants to run" : s.tool ? `Wants to use ${s.tool}` : "Waiting for you";
  if (s.state === "working") return s.tool ? `Using ${s.tool}` : "Working";
  if (s.state === "done") return `Finished ${clock(s.since)}`;
  return s.state === "error" ? "Stopped with an error" : "Nothing running";
}

const tone = (s: AgentSession) => (s.state === "waiting" ? TONES.warn : s.state === "error" ? TONES.crit : s.state === "working" ? AGENT_COLORS[s.agent] : "var(--w-faint)");

function Card({ s, request, stacked }: { s: AgentSession; request: AgentRequest | undefined; stacked: boolean }) {
  const Icon = s.state === "idle" || s.state === "done" ? MinusCircle : s.agent === "claude" ? Sparkles : Bot;
  const answer = async (behavior: Behavior) => {
    if (!request) return;
    await answerRequest(request.id, behavior);
    forget(request.id);
  };
  return (
    <li
      data-agent-card={s.key}
      data-answers={request ? "" : undefined}
      className={`relative flex min-h-0 gap-4 overflow-hidden rounded-2xl py-4 pl-6 pr-4 ${stacked ? "flex-col" : "items-center"}`}
      style={{ background: "color-mix(in oklab, var(--w-fg) 4%, transparent)", boxShadow: `inset 0 0 0 1px ${s.state === "waiting" ? `color-mix(in oklab, ${TONES.warn} 35%, transparent)` : "var(--w-track)"}` }}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: tone(s) }} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3">
          <Icon aria-hidden size={20} className="shrink-0 self-center" style={{ color: tone(s) }} />
          <span className="min-w-0 truncate text-[22px] font-semibold leading-tight">{AGENT_FULL_NAMES[s.agent]}</span>
          <span className="shrink-0 truncate text-[14px]" style={{ color: s.state === "waiting" || s.state === "working" ? tone(s) : "var(--w-muted)" }}>
            {stateLine(s)}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-2 text-[15px]">
          <span className="shrink-0">{doingLine(s, request)}</span>
          {/* the whole command, read-only: it scrolls sideways (by touch and keyboard) rather than being cut */}
          {request && (
            <input
              readOnly
              aria-label="The command"
              value={request.text}
              className="min-w-0 flex-1 rounded-md px-2 py-0.5 font-mono text-[14px]"
              style={{ color: "inherit", background: "color-mix(in oklab, var(--w-fg) 7%, transparent)" }}
            />
          )}
        </div>
        {s.project && (
          <span className="flex min-w-0 items-center gap-1.5 text-[13px]" style={{ color: "var(--w-muted)" }}>
            <Folder aria-hidden size={14} className="shrink-0" />
            <span className="truncate">{s.project}</span>
          </span>
        )}
      </div>
      {request && (
        <div className="grid shrink-0 gap-3" style={{ gridTemplateColumns: stacked ? "1fr 1.4fr" : "120px 150px" }}>
          <button
            type="button"
            onClick={() => void answer("deny")}
            className="h-14 rounded-xl text-[15px] font-semibold"
            style={{ color: TONES.crit, boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${TONES.crit} 55%, transparent)` }}
          >
            Deny
          </button>
          <HoldButton label="Hold to allow" className="h-14 text-[15px]" onConfirm={() => void answer("allow")} />
        </div>
      )}
    </li>
  );
}

export interface SessionCardsProps {
  sessions: AgentSession[];
  /** The widget's width: below `STACK_W` a card's answers go under its text. */
  w: number;
  /** The rows that fit. */
  rows: number;
}

/** The heading's count and the cards; requests are asked for only on a kiosk, while one waits. */
export function SessionCards({ sessions, rows, w }: SessionCardsProps) {
  const waiting = sessions.filter((s) => s.state === "waiting").length;
  const kiosk = new URLSearchParams(window.location.search).get("kiosk") === "1";
  const requests = useAgentRequests(kiosk && waiting > 0);
  return (
    <div className="flex h-full min-h-0 flex-col gap-3" style={{ color: "var(--w-fg)" }}>
      <header className="flex shrink-0 items-baseline gap-3">
        <span className="text-[13px]" style={{ color: "var(--w-muted)" }}>
          {sessions.length} connected
        </span>
        {waiting > 0 && (
          <span className="ml-auto flex items-center gap-2 text-[14px] font-semibold" style={{ color: TONES.warn }}>
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: TONES.warn }} />
            {waiting === 1 ? "One needs you" : `${waiting} need you`}
          </span>
        )}
      </header>
      <ul className="flex min-h-0 flex-col gap-3">
        {sessions.slice(0, rows).map((s) => (
          <Card key={s.key} s={s} request={requests.find((r) => r.session === s.key)} stacked={w < STACK_W} />
        ))}
      </ul>
    </div>
  );
}

/** A card's height and the gap between cards, px (a stacked card is taller by its answers). */
export const CARD_H = 112;
/** Narrower than this, a card's answers go under its text. */
export const STACK_W = 600;
export const CARD_GAP = 12;

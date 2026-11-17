import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { AGENT_FULL_NAMES, useAgentRequests, answerRequest, forget, requestTitle, secondsLeft, type AgentRequest, type Behavior } from "@/lib/agent-requests";
import { TONES, Widget, shell } from "@/widgets/kit";
import { HoldButton } from "./hold-button";

/*
 * An agent's permission request on the kiosk (pinned layer P8, decision 1 and 5, owner Q4, Q12), as the `agents` fixture
 * draws it (src/dev/fixtures/pinned/island-prompt.tsx): the Island's agents-waiting notice opened with actions, Deny and Hold
 * to allow. The whole command shows and scrolls, never cut; the line under the buttons counts down the panel's 25 s, after
 * which the agent asks in its terminal. Nothing answers by itself: Deny is a tap, Allow a 0.6 s hold, and the keyboard has
 * both (Tab to them; Enter for Deny, Enter or Space held for Allow). A notice, not a modal: it takes no focus from the page.
 * It sits at the top of the page area, centred beside any pinned items, and wears the page's Look. A request whose session
 * card (Coding Agents' Sessions view) is on the page is answered on that card instead. Loaded with the first request this
 * kiosk may see.
 */

export interface AgentPromptProps {
  /** The requests waiting, oldest first: the oldest shows. */
  requests: AgentRequest[];
  /** The page area: the room the pinned items take on each edge, px. */
  room: { left: number; right: number; top: number; bottom: number };
}

/** The fixture's sizes: at most 560 wide, 24 px off the page area's sides, 12 px below its top. */
const MAX_W = 560;
const SIDE = 24;
const TOP = 12;
/** Characters per line of the command box at 560 px, and its line height. */
const LINE_CHARS = 56;
const LINE_H = 18;

/** The command box's lines: one per 56 characters, up to four (the rest scrolls). */
export const commandRows = (text: string) => Math.min(4, Math.max(1, Math.ceil(text.length / LINE_CHARS)));

/** The card's height for a command of `rows` lines: padding, title, the box, the buttons and the line under them. */
export const promptHeight = (rows: number) => 32 + 22 + 12 + (rows * LINE_H + 16) + 12 + 56 + 8 + 16;

/** The prompt while a session waits: asks for the requests every second and shows the first (the host mounts it then). */
export function AgentPromptLayer({ room }: Pick<AgentPromptProps, "room">) {
  const requests = useAgentRequests(true);
  return requests.length > 0 ? <AgentPrompt requests={requests} room={room} /> : null;
}

/** Whether a Coding Agents card on screen already offers the answers for this request's session (its Sessions view). */
const answeredByCard = (r: AgentRequest) => !!document.querySelector(`[data-agent-card="${CSS.escape(r.session)}"][data-answers]`);

export default function AgentPrompt({ requests, room }: AgentPromptProps) {
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);
  // a request whose card is on the page is answered there, so the prompt never covers it
  const request = requests.find((r) => !answeredByCard(r));
  if (!request) return null;
  const left = secondsLeft(request, now);
  const name = AGENT_FULL_NAMES[request.agent];
  const rows = commandRows(request.text);
  const width = Math.max(0, Math.min(MAX_W, window.innerWidth - room.left - room.right - 2 * SIDE));
  const answer = async (behavior: Behavior) => {
    if (busy) return;
    setBusy(true);
    await answerRequest(request.id, behavior);
    // answered, or gone already: either way it is not this card's to show
    forget(request.id);
    setBusy(false);
  };
  return (
    <div className="pointer-events-none fixed z-(--z-dialog) flex justify-center" style={{ left: room.left, right: room.right, top: room.top + TOP }}>
      <section
        key={request.id}
        aria-labelledby="agent-request-title"
        aria-describedby="agent-request-command"
        data-agent-prompt=""
        className="pointer-events-auto"
        style={{ width, height: promptHeight(rows) }}
      >
        <Widget {...shell({ surface: "solid" })} radius={22} showHeader={false} bleed design={null}>
          <div className="flex h-full flex-col p-4" style={{ color: "var(--w-fg)" }}>
            <header className="flex h-[22px] items-center gap-2">
              <Sparkles aria-hidden size={18} style={{ color: TONES.warn }} />
              <h2 id="agent-request-title" role="status" className="truncate text-[15px] font-semibold">
                {requestTitle(name, request)}
              </h2>
              <span className="ml-auto shrink-0 truncate text-[12px]" style={{ color: "var(--w-muted)" }}>
                {request.project}
              </span>
            </header>
            {/* the whole command, in a read-only box that scrolls (by touch and by keyboard) rather than cutting it short */}
            <textarea
              id="agent-request-command"
              readOnly
              aria-label="The command"
              value={request.text}
              rows={rows}
              className="mt-3 block w-full shrink-0 resize-none overflow-auto break-all rounded-lg px-3 py-2 font-mono text-[13px]"
              style={{ height: rows * LINE_H + 16, lineHeight: `${LINE_H}px`, color: "inherit", background: "color-mix(in oklab, var(--w-fg) 7%, transparent)" }}
            />
            <div className="mt-3 grid shrink-0 gap-3" style={{ gridTemplateColumns: "1fr 1.4fr" }}>
              <button
                type="button"
                disabled={busy}
                onClick={() => void answer("deny")}
                className="h-14 rounded-xl text-[15px] font-semibold"
                style={{ color: TONES.crit, boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${TONES.crit} 55%, transparent)` }}
              >
                Deny
              </button>
              <HoldButton label="Hold to allow" className="h-14 text-[15px]" onConfirm={() => void answer("allow")} />
            </div>
            <p className="mt-2 h-4 shrink-0 text-[12px] leading-4" style={{ color: "var(--w-muted)" }}>
              {left > 0 ? `Answer here for ${left} s, then in the terminal.` : "Answer in the terminal."}
            </p>
          </div>
        </Widget>
      </section>
    </div>
  );
}

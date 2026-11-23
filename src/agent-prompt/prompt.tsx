import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { HoldButton } from "@/components/hold-button";
import { AGENT_FULL_NAMES, requestTitle, secondsLeft, type AgentRequest, type Behavior } from "@/lib/agent-requests";

/*
 * An agent's permission request in InfoPanel Studio's prompt window (pinned layer P8, decision 1 and 5, owner Q4, Q12;
 * src-tauri/src/agent_prompt.rs), drawn as the `agents` fixture's notice (src/dev/fixtures/pinned/island-prompt.tsx): the
 * title, everything the tool would get, Deny and Hold to allow, and the time left of the panel's 25 s, after which the agent
 * asks in its terminal. Nothing answers by itself: Deny is a tap, Allow a 0.6 s hold, and the keyboard has both (Tab to them;
 * Enter or Space for Deny, held for Allow).
 *
 * What it shows is what would run, exactly: every field of the tool's input (ips-server's `request_text`), newlines and runs
 * of spaces kept, lines never wrapped or cut, in a box that scrolls both ways. Each request gets its own card, keyed by its
 * id, so an answer can only ever go to the request that was on screen: a new one remounts the buttons and drops a hold in
 * progress.
 */

export interface AgentPromptProps {
  /** The requests waiting, oldest first: the oldest shows. */
  requests: AgentRequest[];
  /** Gives the answer to request `id`; false when it no longer waits. */
  answer: (id: string, behavior: Behavior) => Promise<boolean>;
}

export default function AgentPrompt({ requests, answer }: AgentPromptProps) {
  const request = requests[0];
  if (!request) return null;
  return <RequestCard key={request.id} request={request} more={requests.length - 1} answer={answer} />;
}

interface RequestCardProps {
  request: AgentRequest;
  /** How many more wait behind it. */
  more: number;
  answer: AgentPromptProps["answer"];
}

function RequestCard({ request, more, answer }: RequestCardProps) {
  // this card's request for its whole life: the parent keys it by id
  const [id] = useState(request.id);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);
  const left = secondsLeft(request, now);
  const give = async (behavior: Behavior) => {
    if (busy) return;
    setBusy(true);
    // taken: the app closes or moves on to the next request; gone already: the list will say so
    if (!(await answer(id, behavior))) setBusy(false);
  };
  return (
    <section aria-labelledby="agent-request-title" aria-describedby="agent-request-text" data-agent-prompt={id} className="flex h-full flex-col p-4 text-s-t1">
      <header className="flex h-5.5 shrink-0 items-center gap-2">
        <Sparkles aria-hidden size={18} className="text-s-amber" />
        <h1 id="agent-request-title" role="status" className="truncate text-title font-semibold">
          {requestTitle(AGENT_FULL_NAMES[request.agent], request)}
        </h1>
        <span className="ml-auto shrink-0 truncate text-caption text-s-muted">{request.project}</span>
      </header>
      {/* everything, exactly: no wrapping (a wrapped line would read as two), no cutting; it scrolls by touch and keyboard */}
      <textarea
        id="agent-request-text"
        readOnly
        wrap="off"
        spellCheck={false}
        aria-label="What it would run, in full"
        value={request.text}
        className="mt-3 block min-h-0 w-full flex-1 resize-none overflow-auto whitespace-pre rounded-lg border border-s-card-line bg-s-well px-3 py-2 font-mono text-body leading-4.5 text-s-t1"
      />
      <div className="mt-3 grid shrink-0 gap-3" style={{ gridTemplateColumns: "1fr 1.4fr" }}>
        <button type="button" disabled={busy} onClick={() => void give("deny")} className="h-14 rounded-xl border border-s-red/55 text-title font-semibold text-s-red-text">
          Deny
        </button>
        <HoldButton label="Hold to allow" className="h-14 text-title" onConfirm={() => void give("allow")} />
      </div>
      <p className="mt-2 h-4 shrink-0 text-caption leading-4 text-s-muted">
        {left > 0 ? `Answer here for ${left} s, then in the terminal.` : "Answer in the terminal."}
        {more > 0 && ` ${more} more waiting.`}
      </p>
    </section>
  );
}

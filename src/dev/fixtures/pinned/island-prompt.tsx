import { Sparkles } from "lucide-react";
import { HoldButton } from "./hold";

/*
 * An agent's permission request as an Island notice with actions (decision 1, owner Q1 and Q4; P8 builds it): the Island's
 * agents-waiting notice expanded, with Deny and Hold to allow. The full command shows and scrolls when it is long, never cut
 * short; the panel answers for 25 s, then the request goes back to the terminal, which the line under the buttons says.
 * It wears the page's Look (the Island's "skin" placement), so its colours are the card and text tokens.
 */

export interface AgentRequest {
  agent: string;
  project: string;
  /** What the tool call runs, in full. */
  command: string;
  /** Seconds left of the panel's 25 s wait. */
  left: number;
  /** The hold's progress for the fixture's still (0–1). */
  held?: number;
}

export function IslandPrompt({ request, width }: { request: AgentRequest; width: number }) {
  return (
    <section
      // a notice, not a modal: it takes no focus from the page; the title is announced when it appears
      aria-labelledby="agent-request-title"
      aria-describedby="agent-request-command"
      className="pointer-events-auto absolute left-1/2 top-3 z-20 -translate-x-1/2 p-4"
      style={{ width, borderRadius: 22, background: "var(--w-card)", color: "var(--w-fg)", boxShadow: "inset 0 0 0 1px var(--w-edge), 0 18px 48px -12px color-mix(in oklab, var(--w-page) 85%, transparent)" }}
    >
      <header className="flex items-center gap-2">
        <Sparkles aria-hidden size={18} style={{ color: "var(--w-warn)" }} />
        <h2 id="agent-request-title" role="status" className="text-title font-semibold">
          {request.agent} wants to run a command
        </h2>
        <span className="ml-auto text-caption" style={{ color: "var(--w-muted)" }}>
          {request.project}
        </span>
      </header>
      {/* the whole command, in a read-only box that scrolls (by touch and by keyboard) rather than cutting it short */}
      <textarea
        id="agent-request-command"
        readOnly
        aria-label="The command"
        value={request.command}
        rows={Math.min(4, Math.ceil(request.command.length / 56))}
        className="mt-3 block w-full resize-none overflow-auto break-all rounded-lg px-3 py-2 font-mono text-body leading-snug"
        style={{ color: "inherit", background: "color-mix(in oklab, var(--w-fg) 7%, transparent)" }}
      />
      <div className="mt-3 grid gap-3" style={{ gridTemplateColumns: "1fr 1.4fr" }}>
        <button
          type="button"
          className="h-14 rounded-xl text-title font-semibold"
          style={{ color: "var(--w-crit)", boxShadow: "inset 0 0 0 1px color-mix(in oklab, var(--w-crit) 55%, transparent)" }}
        >
          Deny
        </button>
        <HoldButton label="Hold to allow" frozen={request.held} className="h-14 text-title" />
      </div>
      <p className="mt-2 text-caption" style={{ color: "var(--w-muted)" }}>
        Answer here for {request.left} s, then in the terminal.
      </p>
    </section>
  );
}

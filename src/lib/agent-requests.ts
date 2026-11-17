/**
 * Agent approvals from the panel (pinned layer P8, decision 5, owner Q4; ips-server's approvals.rs): a coding agent's
 * permission request, with the tool's input in full. The server holds the agent's hook for 25 s; with no answer the agent
 * asks in its terminal. A request is read and answered only in InfoPanel Studio's own prompt window on this PC
 * (src/agent-prompt/, src-tauri/src/agent_prompt.rs), by IPC: never over HTTP, where any local process or page could answer
 * it, and never in the extras stream. This module holds what the prompt, the cards and Settings share.
 */
import type { AgentId } from "./agents";

/** The agents by their full names, as the prompt and the cards say them. */
export const AGENT_FULL_NAMES: Record<AgentId, string> = { claude: "Claude Code", codex: "Codex" };

/** What a page that can't answer says about a waiting request. */
export const ANSWER_ELSEWHERE = "Answer in InfoPanel Studio's prompt on this PC, or in the terminal.";

export interface AgentRequest {
  id: string;
  agent: AgentId;
  /** The session's public key (the extras' `AgentSession.key`). */
  session: string;
  project: string;
  /** The tool's name ("Bash", "Edit"). */
  tool: string;
  /** Every field of the tool's input: the command, file or address first, then each other field; an edit as a diff. */
  text: string;
  /** When the panel's wait ends, ms on this page's clock. */
  until: number;
}

export type Behavior = "allow" | "deny";

export interface AnswerLogEntry {
  at: number;
  from: string;
  agent: string;
  project: string;
  tool: string;
  text: string;
  answer: Behavior | "none" | "gone";
}

const text = (v: unknown) => (typeof v === "string" ? v : "");

/** The requests the app sent, stamped with when each one's wait ends on this page's clock. */
export function parseRequests(raw: unknown, now: number): AgentRequest[] {
  const list = (raw as { requests?: unknown } | null)?.requests;
  if (!Array.isArray(list)) return [];
  return list.flatMap((r: Record<string, unknown>) => {
    if (!r || typeof r.id !== "string" || (r.agent !== "claude" && r.agent !== "codex")) return [];
    const left = typeof r.left === "number" && Number.isFinite(r.left) ? Math.max(0, r.left) : 0;
    return [{ id: r.id, agent: r.agent, session: text(r.session), project: text(r.project), tool: text(r.tool), text: text(r.text), until: now + left }];
  });
}

/** Whole seconds left of a request's wait. */
export const secondsLeft = (r: AgentRequest, now: number) => Math.max(0, Math.ceil((r.until - now) / 1000));

/** What a request's title says the agent wants. */
export function requestTitle(agentName: string, r: Pick<AgentRequest, "tool">): string {
  return r.tool === "Bash" || r.tool === "PowerShell" || r.tool === "" ? `${agentName} wants to run a command` : `${agentName} wants to use ${r.tool}`;
}

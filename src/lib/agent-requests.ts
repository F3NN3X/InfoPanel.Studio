/**
 * Agent approvals from the panel (pinned layer P8, decision 5, owner Q4; ips-server's approvals.rs): a coding agent's
 * permission request, with the tool's input in full, read and answered by this PC's kiosk only. The server holds the
 * agent's hook for 25 s; with no answer the agent asks in its terminal. The requests are never in the extras stream: the
 * kiosk asks for them on their own route while a session waits, and another device is refused (403), so it stops asking.
 * Deny and Hold to allow are the only answers; nothing answers on a timeout.
 */
import { useEffect, useState } from "react";
import type { AgentId } from "./agents";

export const REQUESTS_URL = "/api/agents/requests";
export const ANSWER_URL = "/api/agents/answer";
export const REQUESTS_LOG_URL = "/api/agents/requests/log";
/** The agents by their full names, as the prompt and the cards say them. */
export const AGENT_FULL_NAMES: Record<AgentId, string> = { claude: "Claude Code", codex: "Codex" };
/** How often the kiosk asks while a session waits, ms. */
export const POLL_MS = 1000;

export interface AgentRequest {
  id: string;
  agent: AgentId;
  /** The session's public key (the extras' `AgentSession.key`). */
  session: string;
  project: string;
  /** The tool's name ("Bash", "Edit"). */
  tool: string;
  /** What it runs, in full: a command, a file, or the tool's whole input. */
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
  answer: Behavior | "none" | "gone" | "refused";
}

const READ_HEADERS = { "X-Agent-Answer": "1" };
const WRITE_HEADERS = { "Content-Type": "application/json", "X-Agent-Answer": "1" };

const text = (v: unknown) => (typeof v === "string" ? v : "");

/** The requests in a server answer, stamped with when each one's wait ends on this page's clock. */
export function parseRequests(raw: unknown, now: number): AgentRequest[] {
  const list = (raw as { requests?: unknown } | null)?.requests;
  if (!Array.isArray(list)) return [];
  return list.flatMap((r: Record<string, unknown>) => {
    if (!r || typeof r.id !== "string" || (r.agent !== "claude" && r.agent !== "codex")) return [];
    const left = typeof r.left === "number" && Number.isFinite(r.left) ? Math.max(0, r.left) : 0;
    return [{ id: r.id, agent: r.agent, session: text(r.session), project: text(r.project), tool: text(r.tool), text: text(r.text), until: now + left }];
  });
}

/** The requests waiting now; null when this device may not see them (it isn't the PC running the server). */
export async function fetchRequests(): Promise<AgentRequest[] | null> {
  try {
    const res = await fetch(REQUESTS_URL, { headers: READ_HEADERS, cache: "no-store" });
    if (res.status === 403) return null;
    if (!res.ok) return [];
    return parseRequests(await res.json(), Date.now());
  } catch {
    return [];
  }
}

/** Answers a request. False when it is gone (answered, back in the terminal) or the answer was refused. Never throws. */
export async function answerRequest(id: string, behavior: Behavior): Promise<boolean> {
  try {
    const res = await fetch(ANSWER_URL, { method: "POST", headers: WRITE_HEADERS, body: JSON.stringify({ id, behavior }) });
    return res.ok;
  } catch {
    return false;
  }
}

/** The answers given so far, oldest first (Settings › Coding agents). */
export async function answersLog(): Promise<AnswerLogEntry[]> {
  try {
    const res = await fetch(REQUESTS_LOG_URL, { headers: READ_HEADERS, cache: "no-store" });
    if (!res.ok) return [];
    const body = (await res.json()) as { entries?: AnswerLogEntry[] };
    return Array.isArray(body.entries) ? body.entries : [];
  } catch {
    return [];
  }
}

/** Whole seconds left of a request's wait. */
export const secondsLeft = (r: AgentRequest, now: number) => Math.max(0, Math.ceil((r.until - now) / 1000));

/** What a request's title says the agent wants. */
export function requestTitle(agentName: string, r: Pick<AgentRequest, "tool">): string {
  return r.tool === "Bash" || r.tool === "PowerShell" || r.tool === "" ? `${agentName} wants to run a command` : `${agentName} wants to use ${r.tool}`;
}

/** The requests in a shared store, so the prompt and the Coding Agents cards read one poll. */
type Listener = () => void;
let current: AgentRequest[] = [];
const listeners = new Set<Listener>();
let users = 0;
let timer = 0;
/** This device was refused: it never asks again on this page. */
let refused = false;

function set(next: AgentRequest[]) {
  const same = next.length === current.length && next.every((r, i) => r.id === current[i].id);
  current = same ? current : next;
  if (!same) for (const l of listeners) l();
}

async function poll() {
  const got = await fetchRequests();
  if (got === null) {
    refused = true;
    window.clearInterval(timer);
    set([]);
    return;
  }
  set(got);
}

/** Drops an answered request at once, before the next poll. */
export function forget(id: string) {
  set(current.filter((r) => r.id !== id));
}

/** The requests waiting for this kiosk, asked for every second while `active` (a session waits); empty otherwise. */
export function useAgentRequests(active: boolean): AgentRequest[] {
  const [list, setList] = useState(current);
  useEffect(() => {
    const l = () => setList(current);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  useEffect(() => {
    if (!active || refused) {
      if (!active) set([]);
      return;
    }
    users++;
    if (users === 1) {
      void poll();
      timer = window.setInterval(() => void poll(), POLL_MS);
    }
    return () => {
      users--;
      if (users === 0) window.clearInterval(timer);
    };
  }, [active]);
  return active ? list : [];
}

/** For tests: forget the store's state. */
export function resetAgentRequests() {
  window.clearInterval(timer);
  current = [];
  users = 0;
  refused = false;
  listeners.clear();
}

/**
 * The action runner's client (pinned layer P7, decision 4; ips-server's actions.rs): a touch action's command goes to
 * `POST /api/actions/run`, which runs it only while the runner is on (ACTION_RUNNER, Settings > Actions), from this PC unless
 * remote editing is on, and only once the command is approved word for word on this PC. Test mode, or a dry run, checks all
 * of that and starts nothing. Loaded with the first command a kiosk runs, and by the studio's editors; the commands a profile
 * names are listed in action-commands.ts, which the import reads without this.
 */
export const ACTIONS_URL = "/api/actions";
export const ACTIONS_RUN_URL = "/api/actions/run";
export const ACTIONS_LOG_URL = "/api/actions/log";
const OBS_ACT_URL = "/api/obs/act";

/** Why a run did not start: another device, the runner off, the command not approved, a command that can't be cut into a program, a program that didn't start, or no answer. */
export type RunRefusal = "remote" | "off" | "unapproved" | "command" | "failed" | "network";

export interface RunResult {
  /** The program started. */
  ran: boolean;
  /** Checked and logged, not started (a dry run or test mode). */
  dry?: boolean;
  program?: string;
  args?: string[];
  refused?: RunRefusal;
  /** The server's words for a refusal. */
  error?: string;
}

const WRITE_HEADERS = { "Content-Type": "application/json", "X-Dashboard-Control": "1" };

const REFUSALS: readonly RunRefusal[] = ["remote", "off", "unapproved", "command", "failed"];

/** Asks the server to run `command` (`dry`: only check it). Never throws. */
export async function runCommand(command: string, dry = false): Promise<RunResult> {
  try {
    const res = await fetch(ACTIONS_RUN_URL, { method: "POST", headers: WRITE_HEADERS, body: JSON.stringify({ command, ...(dry ? { dry: true } : {}) }) });
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      body = { error: text };
    }
    if (res.ok) return { ran: body.ran === true, dry: body.dry === true, program: String(body.program ?? ""), args: Array.isArray(body.args) ? body.args.map(String) : [] };
    const reason = REFUSALS.find((r) => r === body.reason) ?? (res.status === 400 ? "command" : "failed");
    return { ran: false, refused: reason, error: typeof body.error === "string" ? body.error : `The server answered ${res.status}.` };
  } catch {
    return { ran: false, refused: "network", error: "The server couldn't be reached." };
  }
}

/** Asks OBS to go live, stop, or the other of the two; the server refuses it unless its switch is on. Never throws. */
export async function obsStream(state: "start" | "stop" | "toggle"): Promise<RunResult> {
  try {
    const res = await fetch(OBS_ACT_URL, { method: "POST", headers: WRITE_HEADERS, body: JSON.stringify({ op: "stream", state }) });
    return res.ok ? { ran: true } : { ran: false, refused: res.status === 403 ? "off" : "failed", error: await res.text() };
  } catch {
    return { ran: false, refused: "network", error: "The server couldn't be reached." };
  }
}

/** The line the kiosk shows after a run, or null when there is nothing to say (it started). */
export function resultNote(r: RunResult): string | null {
  if (r.ran) return null;
  if (r.dry) return `Test mode: would run ${[r.program, ...(r.args ?? []).map((a) => (/\s/.test(a) || a === "" ? `"${a}"` : a))].join(" ")}`;
  return r.error ?? "That didn't run.";
}

/** The runner's state as the server tells it (`GET /api/actions`). */
export interface ActionsState {
  /** Running commands is on (ACTION_RUNNER, Settings > Actions). */
  runner: boolean;
  /** OBS's go live and stop are on. */
  obsStream: boolean;
  /** Runs are checked and logged, never started. */
  testMode: boolean;
  approved: string[];
}

/** The runner's state, or null when it can't be read (another device without remote editing, no server). */
export async function actionsState(): Promise<ActionsState | null> {
  try {
    const res = await fetch(ACTIONS_URL, { cache: "no-store" });
    if (!res.ok) return null;
    const b = (await res.json()) as Partial<ActionsState>;
    return { runner: b.runner === true, obsStream: b.obsStream === true, testMode: b.testMode === true, approved: Array.isArray(b.approved) ? b.approved.filter((c): c is string => typeof c === "string") : [] };
  } catch {
    return null;
  }
}

/** Approves or revokes commands, or sets test mode (this PC only). Resolves to the new state, or the reason it was refused. */
export async function changeActions(change: { approve?: string[]; revoke?: string[]; testMode?: boolean }): Promise<ActionsState | { error: string }> {
  try {
    const res = await fetch(ACTIONS_URL, { method: "PUT", headers: WRITE_HEADERS, body: JSON.stringify(change) });
    const text = await res.text();
    if (!res.ok) {
      try {
        return { error: String((JSON.parse(text) as { error?: string }).error ?? text) };
      } catch {
        return { error: text || `The server answered ${res.status}.` };
      }
    }
    const b = JSON.parse(text) as ActionsState;
    return { runner: b.runner === true, obsStream: b.obsStream === true, testMode: b.testMode === true, approved: b.approved ?? [] };
  } catch {
    return { error: "The server couldn't be reached." };
  }
}

/** One line of the runner's log. */
export interface LogEntry {
  at: number;
  from: string;
  command?: string;
  outcome: "ran" | "dry" | "refused" | "failed";
  reason?: string;
  program?: string;
  args?: string[];
}

/** The runner's log, oldest first; empty when it can't be read. */
export async function actionsLog(): Promise<LogEntry[]> {
  try {
    const res = await fetch(ACTIONS_LOG_URL, { cache: "no-store" });
    if (!res.ok) return [];
    const b = (await res.json()) as { entries?: LogEntry[] };
    return Array.isArray(b.entries) ? b.entries : [];
  } catch {
    return [];
  }
}

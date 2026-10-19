// Claude Code's live sessions, from the files it writes itself: ~/.claude/sessions/<pid>.json
// (`pid`, `sessionId`, `cwd`, `status`, `updatedAt`). A session counts while its process is alive.
//
// Only the project folder's name, the state and a time are kept; the cwd is parsed and dropped.
//
// Node built-ins only. `parseClaudeSession` is pure.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { projectOf } from "./agents.mjs";

const STATES = { busy: "working", waiting: "waiting" };

/** A session file's id, pid, project, state ("working", "waiting", "idle") and update time, or null. */
export function parseClaudeSession(text) {
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof j !== "object" || j === null) return null;
  if (typeof j.pid !== "number" || !Number.isInteger(j.pid) || j.pid <= 0 || typeof j.sessionId !== "string" || !j.sessionId) return null;
  return {
    id: j.sessionId.slice(0, 100),
    pid: j.pid,
    project: projectOf(j.cwd),
    state: STATES[j.status] ?? "idle",
    updatedAt: typeof j.updatedAt === "number" && Number.isFinite(j.updatedAt) ? j.updatedAt : null,
  };
}

/** Whether a process exists (a permission error means it does, owned by someone else). */
export function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e?.code === "EPERM";
  }
}

/** Every session file, each with whether its process is alive (a crash leaves the file behind). */
export function readClaudeSessions({ home = os.homedir(), alive = isAlive } = {}) {
  const dir = path.join(home, ".claude", "sessions");
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((name) => name.endsWith(".json"))
    .flatMap((name) => {
      try {
        const s = parseClaudeSession(fs.readFileSync(path.join(dir, name), "utf8"));
        return s ? [{ ...s, alive: alive(s.pid) }] : [];
      } catch {
        return [];
      }
    });
}

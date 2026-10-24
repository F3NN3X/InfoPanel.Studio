// What a coding agent's Stop hook does with `verify --check-fresh`: let it finish, or exit 2 so the agent keeps going.
// All the logic lives here so the hook script outside git stays a three-line wrapper. It never runs the checks; it
// only reads the record. Node built-ins only.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const BLOCKED_FILE = ".cache/verify/stop-blocked.json";

export const STALE_MESSAGE = "Changes since the last verify. Run npm run verify (or verify:full before finishing), then report its summary.";
export const FAILED_MESSAGE = "npm run verify failed (see summary). Fix it, or tell the user exactly what fails and why you are stopping.";

/**
 * The decision, pure.
 * - `active`: the hook input's `stop_hook_active` (the agent is already continuing because of a stop hook).
 * - `changes`: how many files differ from the base. `state`: "fresh-pass", "fresh-fail" or "stale". `tree`: the tree hash.
 * - `blockedTree`: the tree hash a failure already blocked once.
 * Returns the exit code, the stderr text, and the tree hash to record when a failure was blocked.
 */
export function decideStop({ active, changes, state, tree, blockedTree }) {
  if (active || changes === 0 || state === "fresh-pass") return { code: 0 };
  if (state === "stale") return { code: 2, message: STALE_MESSAGE };
  // A failing tree blocks once; the next stop on the same tree goes through so the agent can report it, not loop.
  if (blockedTree === tree) return { code: 0 };
  return { code: 2, message: FAILED_MESSAGE, recordBlocked: tree };
}

/** `verify --check-fresh --json`, parsed. The exit code is the state, so a non-zero exit still carries the output. */
function checkFresh(root) {
  const run = () => execFileSync(process.execPath, [path.join(root, "tools/verify.mjs"), "--check-fresh", "--json"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  try {
    return JSON.parse(run());
  } catch (error) {
    return JSON.parse(error.stdout);
  }
}

function readBlocked(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, BLOCKED_FILE), "utf8")).tree;
  } catch {
    return null;
  }
}

/** The hook: `input` is the hook's JSON from stdin. Returns what the wrapper should exit with and write to stderr. */
export function runStopHook({ root, input, check = checkFresh }) {
  let active = false;
  try {
    active = JSON.parse(input || "{}").stop_hook_active === true;
  } catch {}
  let status;
  try {
    status = check(root);
  } catch {
    return { code: 0 }; // verify itself is broken: never trap the agent behind that
  }
  const { state, changes, tree } = status;
  const decision = decideStop({ active, changes, state, tree, blockedTree: readBlocked(root) });
  if (decision.recordBlocked) {
    fs.mkdirSync(path.join(root, path.dirname(BLOCKED_FILE)), { recursive: true });
    fs.writeFileSync(path.join(root, BLOCKED_FILE), `${JSON.stringify({ tree: decision.recordBlocked })}\n`);
  }
  return decision;
}

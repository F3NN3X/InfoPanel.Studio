// Turning the selected features into the ordered list of checks to run, and the exit status of a run. Pure: the caller
// passes the tracked-file list and a file-exists probe. Node built-ins only.
import { matchesAny } from "./map.mjs";

/** Exit codes of `npm run verify`. */
export const EXIT = { ok: 0, failed: 1, usage: 2, incomplete: 3, stale: 4 };

const MAX_CMD = 7000;
const CODE_EXT = /\.(?:[cm]?[jt]sx?)$/;
const isTestFile = (file) => file.startsWith("tests/");

/** The tracked files that match any of the globs. */
export function expandGlobs(globs, tracked) {
  return tracked.filter((file) => matchesAny(file, globs));
}

const quote = (file) => (/[\s"]/.test(file) ? `"${file}"` : file);

/** Check names in the map's own order (it is the run order: fast to slow). */
const orderOf = (map) => Object.keys(map.checks);

/** Pull in what each chosen check `needs`, so a plan never runs e2e without the build under it. */
function withNeeds(names, map) {
  const chosen = new Set();
  const add = (name) => {
    if (chosen.has(name)) return;
    chosen.add(name);
    for (const need of map.checks[name].needs ?? []) add(need);
  };
  for (const name of names) add(name);
  return orderOf(map).filter((name) => chosen.has(name));
}

/** Whether any selected feature carries an escalating check (`full`). */
export function escalates(features, map) {
  return features.some((feature) => feature.checks.some((name) => map.checks[name]?.escalate));
}

/**
 * The plan.
 * - `mode`: "default" (feature tests plus tests related to the changed sources), "fast" (feature tests only) or "full".
 * - `features`: the selected feature objects. `changed`: the changed files (may include deleted ones).
 * - `tracked`: every tracked file; `exists(file)`: whether it is on disk now; `platform`: process.platform.
 */
export function buildPlan({ map, features, changed, mode, tracked, exists, platform }) {
  const escalated = mode === "full" || escalates(features, map);
  const effective = escalated ? "full" : mode;
  const present = changed.filter(exists);

  const runnable = (name) => !map.checks[name].escalate;
  const wanted = new Set();
  if (effective === "full") {
    for (const name of orderOf(map)) if (runnable(name)) wanted.add(name);
  } else {
    for (const feature of features) for (const name of feature.checks) if (runnable(name)) wanted.add(name);
  }
  for (const [name, check] of Object.entries(map.checks)) if (check.always) wanted.add(name);

  const steps = withNeeds([...wanted], map).map((name) => step(name, map.checks[name]));
  return { mode: effective, escalated, features: features.map((f) => f.id), changed, steps };

  function step(name, check) {
    const base = { id: name, cwd: check.cwd ?? ".", platform: check.platform ?? null };
    const notRun = check.platform && check.platform !== platform ? { status: "not-run", reason: `needs ${check.platform === "win32" ? "Windows" : check.platform}` } : {};
    if (effective === "full") return { ...base, ...notRun, cmd: check.fullCmd ?? check.cmd };
    if (check.files) {
      const files = present.filter((file) => matchesAny(file, check.files));
      if (files.length === 0) return { ...base, cmd: null, status: "skipped", reason: "no files it covers changed" };
      return { ...base, ...notRun, cmd: check.cmd.replace("{files}", files.map(quote).join(" ")), files };
    }
    if (check.tests) return withTests(name, check, base, notRun);
    return { ...base, ...notRun, cmd: check.cmd };
  }

  /** A check that runs test files: the selected features' own, the changed test files, and for `related` the sources. */
  function withTests(name, check, base, notRun) {
    const eligible = (file) => matchesAny(file, check.tests) && !matchesAny(file, check.testsExclude);
    const own = features.filter((feature) => feature.checks.includes(name)).flatMap((feature) => expandGlobs(feature.tests, tracked));
    const tests = [...new Set([...own, ...present.filter(isTestFile)].filter(eligible))].filter(exists);
    const sources = check.related && effective === "default" ? present.filter((file) => CODE_EXT.test(file) && !isTestFile(file)) : [];
    const files = [...tests, ...sources];
    if (files.length === 0) {
      if (check.emptyMeansAll) return { ...base, ...notRun, cmd: check.fullCmd ?? check.cmd, note: "no listed specs: the whole suite" };
      return { ...base, cmd: null, status: "skipped", reason: "no tests listed for these features" };
    }
    const template = effective === "fast" && check.fastCmd ? check.fastCmd : check.cmd;
    const cmd = template.replace("{tests}", files.map(quote).join(" "));
    // A command line past what cmd.exe takes: the whole suite is the safe answer.
    if (cmd.length > MAX_CMD && check.fullCmd) return { ...base, ...notRun, cmd: check.fullCmd, note: "too many files for one command line: the whole suite" };
    return { ...base, ...notRun, cmd, files };
  }
}

/** The status of the whole run from its checks' statuses ("passed", "failed", "not-run", "skipped"). */
export function exitCodeFor(results, { allowIncomplete = false } = {}) {
  if (results.some((result) => result.status === "failed")) return EXIT.failed;
  if (results.some((result) => result.status === "not-run")) return allowIncomplete ? EXIT.ok : EXIT.incomplete;
  return EXIT.ok;
}

#!/usr/bin/env node
// verify's cargo lane: the checks marked `"lane": "cargo"` in tests/feature-map.json run one after another in this
// process while tools/verify.mjs runs the rest beside them. They share nothing with the browser checks but the CPU, so
// on a dev machine the Rust tests no longer wait for e2e. Its own CARGO_TARGET_DIR keeps cargo from relinking the
// debug ips-server the e2e scratch servers are running (Windows refuses to replace a running exe), and it takes a
// quarter of the cores. Never in CI: a 4 vCPU runner has no room for both.
//   node tools/verify/lane.mjs <spec.json>   spec: { steps: [{ id, cmd, cwd, notRunExit }], log, out, keepGoing }
// Output goes to `log`; the results ({ id, status, ms } like verify's) to `out`, rewritten after each step.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LANE = "cargo";

/** The ids of the steps that go to the lane: runnable here, marked for it, and only when something else runs beside them. */
export function laneIds(steps, checks, { ci }) {
  if (ci) return new Set();
  const runnable = steps.filter((step) => step.cmd && step.status !== "not-run");
  const lane = runnable.filter((step) => checks[step.id]?.lane === LANE);
  return lane.length && lane.length < runnable.length ? new Set(lane.map((step) => step.id)) : new Set();
}

/**
 * The planned main-line steps the lane waits for: what its checks name in `after`, because they write files the lane's
 * commands read (settings-build empties src-tauri/pages/app, which the app crate embeds as it compiles). Unlike `needs`,
 * `after` only orders: it never adds a check to the plan.
 */
export function laneWaitsFor(steps, ids, checks) {
  const named = new Set([...ids].flatMap((id) => checks[id]?.after ?? []));
  return new Set(steps.filter((step) => step.cmd && step.status !== "not-run" && named.has(step.id) && !ids.has(step.id)).map((step) => step.id));
}

/** Run the spec's steps in order, stopping at the first failure unless keepGoing; returns the results. */
export function runLane(spec, spawn = spawnSync) {
  const fd = fs.openSync(spec.log, "w");
  const results = [];
  let stopped = false;
  try {
    for (const step of spec.steps) {
      if (stopped) {
        results.push({ id: step.id, status: "skipped", ms: 0 });
        continue;
      }
      const started = Date.now();
      fs.writeSync(fd, `\n== ${step.id}: ${step.cmd}\n`);
      const run = spawn(step.cmd, { cwd: step.cwd, shell: true, stdio: ["ignore", fd, fd] });
      const notRun = run.status !== 0 && run.status === step.notRunExit;
      const status = run.status === 0 ? "passed" : notRun ? "not-run" : "failed";
      results.push({ id: step.id, status, ms: Date.now() - started });
      if (status === "failed" && !spec.keepGoing) stopped = true;
      fs.writeFileSync(spec.out, JSON.stringify(results));
    }
  } finally {
    fs.closeSync(fd);
  }
  fs.writeFileSync(spec.out, JSON.stringify(results));
  return results;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runLane(JSON.parse(fs.readFileSync(process.argv[2], "utf8")));
}

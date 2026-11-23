#!/usr/bin/env node
// CI: turns `node tools/verify.mjs --plan --json` into the `plan` job's outputs, one per job that may be skipped.
//   node tools/verify.mjs --plan --json --base origin/main | node tools/ci/plan-outputs.mjs [--all | --e2e | --warm]
// `--all` (the ci:full label) sets every job's output to true (not the new-test gate, which needs the changed files). The
// browser checks (e2e, one-editor, overflow) and the spec gate (flake-e2e) run only with `--e2e` (the ci:e2e label) or
// `--all`, whole: `npm run ship` runs them locally before a PR merges, and the nightly and the release run them too. `--warm` (a push to main) runs only the jobs that save the Rust and npm
// caches PRs restore. `quarantine` is on while tests/quarantine.json lists anything (an advisory job). Writes name=value
// lines to $GITHUB_OUTPUT, or to stdout when it isn't set. Node built-ins only.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { loadMap } from "../verify/map.mjs";
import { quarantinedFiles } from "./quarantine.mjs";

/** Every output name, with the planned checks (by id) that switch it on. `e2e` follows the browser checks (see `planOutputs`). */
export const OUTPUTS = {
  lint: ["lint"],
  typecheck: ["typecheck"],
  unit: ["unit"],
  build: ["build", "budgets", "settings-build"],
  budgets: ["budgets"],
  settings: ["settings-build"],
  server: ["server-suite", "cargo-server"],
  e2e: [],
  ui_usage: ["ui-usage"],
  pack_budgets: ["pack-budgets"],
  lab: ["lab"],
  rust: ["cargo-app"],
  windows: ["cargo-app", "cargo-server", "rust-fmt"],
  actionlint: ["actionlint"],
};

/** The checks the `e2e` job runs, in order; the build and the debug server under them come from the job itself. */
export const BROWSER_CHECKS = ["e2e", "one-editor", "overflow"];

/**
 * The new-test gates (tools/ci/flake-gate.mjs). `flake-unit` and `flake-e2e` each have a job of their own, so a slow
 * gate can neither starve the browser checks nor run them out of time. An escalated plan's command has no file list
 * (verify reads git), and CI's checkout has no merge base, so the changed test files go on its command line.
 */
export const GATE_E2E = "flake-e2e";
export const GATE_UNIT = "flake-unit";
const gateCommand = (step, plan) => (plan.mode === "full" ? [step.cmd, ...plan.changed.filter((file) => file.startsWith("tests/"))].join(" ") : step.cmd);

/** The jobs a push to main runs: the ones whose Rust caches (and npm cache) PRs restore. */
export const WARM = new Set(["server", "rust", "windows"]);

/**
 * The outputs of a plan: a check counts when it has a command (a skipped lint does not). `e2e` is on when the plan lists
 * a browser check, or with `e2e` or `all`, and pulls in the build it runs against. `e2e_cmds` (a JSON array) is what the
 * job runs: the planned commands, or with `e2e` or `all` the whole checks' (`commands`: id to full command, from the map).
 * `full` and `docs_only` are derived.
 */
export function planOutputs(plan, { all = false, e2e = false, warm = false, commands = {}, quarantined = false } = {}) {
  if (warm) return { ...Object.fromEntries(Object.keys(OUTPUTS).map((name) => [name, WARM.has(name)])), full: false, docs_only: false };
  const steps = plan.steps.filter((step) => step.cmd);
  const planned = new Set(steps.map((step) => step.id));
  const outputs = Object.fromEntries(Object.entries(OUTPUTS).map(([name, ids]) => [name, all || ids.some((id) => planned.has(id))]));
  // The browser checks run on a PR only on request: `npm run ship` ran them locally before the merge, and the nightly and
  // the release run them whole. With the label they run whole, and the spec gate repeats the changed specs.
  const forced = all || e2e;
  const gateE2e = forced ? steps.filter((step) => step.id === GATE_E2E).map((step) => gateCommand(step, plan)) : [];
  const browser = forced ? BROWSER_CHECKS.map((id) => commands[id]).filter(Boolean) : [];
  const withE2e = forced;
  const gateUnit = all ? [] : steps.filter((step) => step.id === GATE_UNIT).map((step) => gateCommand(step, plan));
  return { ...outputs, e2e: withE2e, e2e_cmds: JSON.stringify(browser), flake_e2e: gateE2e.length > 0, flake_e2e_cmds: JSON.stringify(gateE2e), flake_unit: gateUnit.length > 0, flake_unit_cmds: JSON.stringify(gateUnit), quarantine: quarantined, build: outputs.build || withE2e || gateE2e.length > 0, full: all || plan.mode === "full", docs_only: !all && !withE2e && planned.size === 0 };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url))) {
  const flag = (name) => process.argv.includes(name);
  const root = fileURLToPath(new URL("../..", import.meta.url));
  const { checks } = loadMap(root);
  const commands = Object.fromEntries(BROWSER_CHECKS.map((id) => [id, checks[id].fullCmd ?? checks[id].cmd]));
  const outputs = planOutputs(JSON.parse(fs.readFileSync(0, "utf8")), { all: flag("--all"), e2e: flag("--e2e"), warm: flag("--warm"), commands, quarantined: quarantinedFiles(root).length > 0 });
  const lines = Object.entries(outputs).map(([name, value]) => `${name}=${value}`).join("\n");
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines}\n`);
  console.log(lines);
}

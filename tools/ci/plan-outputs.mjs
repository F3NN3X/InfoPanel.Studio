#!/usr/bin/env node
// CI: turns `node tools/verify.mjs --plan --json` into the `plan` job's outputs, one per job that may be skipped.
//   node tools/verify.mjs --plan --json --base origin/main | node tools/ci/plan-outputs.mjs [--all | --e2e | --warm]
// `--all` (the ci:full label) sets every output to true. The e2e specs are slow, so a PR runs them only with `--e2e`
// (the ci:e2e label) or `--all`; the release (release.yml) and the nightly run them anyway. `--warm` (a push to main)
// runs only the jobs that save the Rust and npm caches PRs restore. Writes name=value lines to $GITHUB_OUTPUT, or to
// stdout when it isn't set. Node built-ins only.
import fs from "node:fs";

/** Every output name, with the planned checks (by id) that switch it on. `e2e` is opt-in (see `planOutputs`). */
export const OUTPUTS = {
  lint: ["lint"],
  typecheck: ["typecheck"],
  unit: ["unit"],
  build: ["build", "budgets", "settings-build"],
  budgets: ["budgets"],
  settings: ["settings-build"],
  server: ["server-suite", "cargo-server"],
  e2e: [],
  lab: ["lab"],
  rust: ["cargo-app"],
  windows: ["cargo-app", "cargo-server"],
  actionlint: ["actionlint"],
};

/** The jobs a push to main runs: the ones whose Rust caches (and npm cache) PRs restore. */
export const WARM = new Set(["server", "rust", "windows"]);

/**
 * The outputs of a plan: a check counts when it has a command (a skipped lint does not). `e2e` is on with `e2e` or
 * `all`, and pulls in the build it runs against. `full` and `docs_only` are derived.
 */
export function planOutputs(plan, { all = false, e2e = false, warm = false } = {}) {
  if (warm) return { ...Object.fromEntries(Object.keys(OUTPUTS).map((name) => [name, WARM.has(name)])), full: false, docs_only: false };
  const planned = new Set(plan.steps.filter((step) => step.cmd).map((step) => step.id));
  const outputs = Object.fromEntries(Object.entries(OUTPUTS).map(([name, ids]) => [name, all || ids.some((id) => planned.has(id))]));
  const withE2e = all || e2e;
  return { ...outputs, e2e: withE2e, build: outputs.build || withE2e, full: all || plan.mode === "full", docs_only: !all && !withE2e && planned.size === 0 };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url))) {
  const flag = (name) => process.argv.includes(name);
  const outputs = planOutputs(JSON.parse(fs.readFileSync(0, "utf8")), { all: flag("--all"), e2e: flag("--e2e"), warm: flag("--warm") });
  const lines = Object.entries(outputs).map(([name, value]) => `${name}=${value}`).join("\n");
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines}\n`);
  console.log(lines);
}

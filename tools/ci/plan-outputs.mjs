#!/usr/bin/env node
// CI: turns `node tools/verify.mjs --plan --json` into the `plan` job's outputs, one per job that may be skipped.
//   node tools/verify.mjs --plan --json --base origin/main | node tools/ci/plan-outputs.mjs [--all]
// `--all` (a push to main, or the ci:full label) sets every output to true. Writes name=value lines to
// $GITHUB_OUTPUT, or to stdout when it isn't set. Node built-ins only.
import fs from "node:fs";

/** Every output name, with the planned checks (by id) that switch it on. */
export const OUTPUTS = {
  lint: ["lint"],
  typecheck: ["typecheck"],
  unit: ["unit"],
  build: ["build", "budgets", "settings-build", "e2e"],
  budgets: ["budgets"],
  settings: ["settings-build"],
  server: ["server-suite", "cargo-server"],
  e2e: ["e2e"],
  lab: ["lab"],
  rust: ["cargo-app"],
  windows: ["cargo-app", "cargo-server"],
  actionlint: ["actionlint"],
};

/** The outputs of a plan: a check counts when it has a command (a skipped lint does not). `full` and `docs_only` are derived. */
export function planOutputs(plan, { all = false } = {}) {
  const planned = new Set(plan.steps.filter((step) => step.cmd).map((step) => step.id));
  const outputs = Object.fromEntries(Object.entries(OUTPUTS).map(([name, ids]) => [name, all || ids.some((id) => planned.has(id))]));
  return { ...outputs, full: all || plan.mode === "full", docs_only: !all && planned.size === 0 };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url))) {
  const outputs = planOutputs(JSON.parse(fs.readFileSync(0, "utf8")), { all: process.argv.includes("--all") });
  const lines = Object.entries(outputs).map(([name, value]) => `${name}=${value}`).join("\n");
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines}\n`);
  console.log(lines);
}

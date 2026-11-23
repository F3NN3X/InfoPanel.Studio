#!/usr/bin/env node
// The gate for new tests (_docs/TESTING.md, "The new-test gate"): a test file added or changed on this branch must pass
// repeated runs before it counts as proven. Vitest files: 10 runs, shuffled by a fresh seed each, 4 workers. Playwright
// specs: `--repeat-each 3` on half the cores up to 4, a quarter above that: the whole-page measure specs starve when 4 workers share 4 vCPUs.
//   node tools/ci/flake-gate.mjs --unit [files...]    node tools/ci/flake-gate.mjs --e2e [files...]
// Without files, the test files changed since the merge base (as `verify` computes them). Quarantined files are exempt.
// Off CI, a file that passed every repeat is proven until its content changes (.cache/verify/flake-proven.json): the gate
// asks whether the test is stable, and repeating an unchanged file on every verify answers nothing new. CI always repeats.
// Node built-ins only.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { changedFiles } from "../verify/git.mjs";
import { matchesAny } from "../verify/map.mjs";
import { quarantinedFiles } from "./quarantine.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PROVEN_FILE = path.join(ROOT, ".cache", "verify", "flake-proven.json");

export const UNIT_RUNS = 10;
export const E2E_REPEATS = 3;
/**
 * Playwright workers for `cores`: half of them up to 4, or a quarter on a bigger machine (8 on 32 threads, as
 * playwright.config.ts). Browsers, a server and the page's own work each need a core; 2 on CI's 4 vCPU runner.
 */
export const gateWorkers = (cores) => Math.max(1, Math.min(Math.max(4, Math.floor(cores / 4)), Math.floor(cores / 2)));
const UNIT = ["tests/**/*.test.{ts,tsx,mjs}"];
// tests/server needs the ips-server binary (npm run test:server); it is not repeated here.
const UNIT_EXCLUDE = ["tests/server/**"];
const PROJECTS = { e2e: ["tests/e2e/*.spec.ts"], "one-editor": ["tests/visual/one-editor/*.spec.ts"] };

const quote = (file) => (/[\s"]/.test(file) ? `"${file}"` : file);

/** The files to repeat, by kind: Vitest files, and the specs of each Playwright project. */
export function classify(files) {
  const unit = files.filter((file) => matchesAny(file, UNIT) && !matchesAny(file, UNIT_EXCLUDE));
  const specs = Object.fromEntries(Object.entries(PROJECTS).map(([project, globs]) => [project, files.filter((file) => matchesAny(file, globs))]));
  return { unit, specs };
}

/** The files still to prove: those whose content hash is not the one that last passed every repeat. */
export const unproven = (files, proven, hashes) => files.filter((file) => proven[file] !== hashes[file]);

function readProven() {
  try {
    return JSON.parse(fs.readFileSync(PROVEN_FILE, "utf8"));
  } catch {
    return {};
  }
}

/** The Playwright command for one project's specs. */
export const playwrightCommand = (project, files, workers = gateWorkers(os.availableParallelism())) =>
  `npx playwright test --project=${project} --repeat-each ${E2E_REPEATS} --workers ${workers} ${files.map(quote).join(" ")}`;

/** The Vitest command for one of the runs. */
export const vitestCommand = (files, seed) => `npx vitest run --sequence.shuffle.files --sequence.shuffle.tests --sequence.seed=${seed} --maxWorkers=4 ${files.map(quote).join(" ")}`;

function main(argv) {
  const mode = argv[0];
  if (mode !== "--unit" && mode !== "--e2e") {
    console.error("usage: node tools/ci/flake-gate.mjs --unit|--e2e [files...]");
    return 2;
  }
  const given = argv.slice(1).map((file) => file.replaceAll("\\", "/"));
  const exempt = new Set(quarantinedFiles(ROOT));
  const ofMode = ({ unit, specs }) => (mode === "--unit" ? unit : Object.values(specs).flat());
  const candidates = ofMode(classify((given.length ? given : changedFiles(ROOT).files).filter((file) => fs.existsSync(path.join(ROOT, file)) && !exempt.has(file))));
  const proven = process.env.CI ? {} : readProven();
  const hashes = Object.fromEntries(candidates.map((file) => [file, createHash("sha256").update(fs.readFileSync(path.join(ROOT, file))).digest("hex")]));
  const todo = unproven(candidates, proven, hashes);
  if (todo.length < candidates.length) console.log(`flake gate: ${candidates.length - todo.length} file(s) already passed every repeat at this content, not repeated.`);
  const { unit, specs } = classify(todo);

  let commands;
  if (mode === "--unit") commands = unit.length ? Array.from({ length: UNIT_RUNS }, () => vitestCommand(unit, Math.floor(Math.random() * 1e6))) : [];
  else commands = Object.entries(specs).filter(([, files]) => files.length).map(([project, files]) => playwrightCommand(project, files));
  if (commands.length === 0) {
    console.log(`flake gate: no changed ${mode === "--unit" ? "Vitest files" : "Playwright specs"} to repeat.`);
    return 0;
  }
  for (const [i, command] of commands.entries()) {
    console.log(`\n== flake gate ${i + 1}/${commands.length}: ${command}`);
    if (spawnSync(command, { cwd: ROOT, shell: true, stdio: "inherit" }).status !== 0) {
      console.error(`\nflake gate: FAILED on ${command}\nA new or changed test must pass every repeat. Fix it, or (with an issue, an owner and a deadline) add it to tests/quarantine.json.`);
      return 1;
    }
  }
  if (!process.env.CI) {
    fs.mkdirSync(path.dirname(PROVEN_FILE), { recursive: true });
    fs.writeFileSync(PROVEN_FILE, `${JSON.stringify({ ...readProven(), ...Object.fromEntries(todo.map((file) => [file, hashes[file]])) }, null, 2)}\n`);
  }
  console.log(`\nflake gate: ${commands.length} run(s) passed.`);
  return 0;
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) process.exitCode = main(process.argv.slice(2));

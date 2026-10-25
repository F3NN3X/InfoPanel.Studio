#!/usr/bin/env node
// npm run verify: works out which features the changed files belong to (tests/feature-map.json) and runs exactly the
// checks those features need, fast to slow. docs/TESTING.md, "Verify", describes the modes and the exit codes.
//   verify                  checks for what changed since the merge base with origin/main (commits, staged, unstaged, untracked)
//   verify --fast           the features' own tests only, no `vitest related`
//   verify --full           every check in the map
//   verify --plan           print the plan and run nothing
//   verify --feature a,b    those features' checks, whatever changed
//   verify --where <path>   the feature(s) a file belongs to and their test globs
//   verify --check-fresh    does .cache/verify/last.json still describe this tree? (exit 0 fresh-pass, 1 fresh-fail, 4 stale)
//   --base <ref>  --json  --allow-incomplete  --keep-going
// Exit: 0 passed, 1 a check failed, 2 usage error or unmapped file, 3 a needed check couldn't run here, 4 stale.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { changedFiles, fileAt, head, trackedFiles, treeHash } from "./verify/git.mjs";
import { loadMap, resolveChanges, whereIs } from "./verify/map.mjs";
import { buildPlan, EXIT, exitCodeFor } from "./verify/plan.mjs";
import { RELEASE_FEATURE, splitVersionOnly } from "./verify/release.mjs";
import { freshness, freshnessExit, readRecord, writeRecord } from "./verify/record.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FLAGS = new Set(["--full", "--fast", "--plan", "--json", "--check-fresh", "--allow-incomplete", "--keep-going", "--help"]);
const VALUED = new Set(["--base", "--feature", "--where"]);

function parseArgs(argv) {
  const options = { flags: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (FLAGS.has(arg)) options.flags.add(arg);
    else if (VALUED.has(arg) && argv[i + 1] && !argv[i + 1].startsWith("--")) options[arg.slice(2)] = argv[++i];
    else return { error: `unknown or incomplete argument: ${arg}` };
  }
  return options;
}

const usage = (message) => {
  console.error(`verify: ${message}\nusage: node tools/verify.mjs [--full|--fast|--plan] [--feature a,b] [--where path] [--check-fresh] [--base ref] [--json] [--allow-incomplete] [--keep-going]`);
  return EXIT.usage;
};

const shorten = (text, n = 110) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

function printPlan(plan, grouped, notes, mergeBase) {
  const log = console.error;
  for (const note of notes) log(`verify: ${note}`);
  log(`verify: ${mergeBase ? `base ${mergeBase.ref} (merge base ${mergeBase.sha.slice(0, 7)})` : "no base"}, ${plan.changed.length} changed file(s), mode ${plan.mode}${plan.escalated ? " (escalated)" : ""}`);
  for (const [id, files] of grouped) log(`  ${id}${files.length ? ` (${files.length}): ${shorten(files.slice(0, 4).join(", "), 90)}${files.length > 4 ? ", ..." : ""}` : ""}`);
  plan.steps.forEach((step, i) => {
    const what = step.cmd ? shorten(step.cmd) : `skipped: ${step.reason}`;
    const flag = step.status === "not-run" ? `   [NOT RUN here: ${step.reason}]` : step.note ? `   [${step.note}]` : "";
    log(`  ${i + 1}. ${step.id.padEnd(13)} ${what}${flag}`);
  });
}

/** Run one planned step; returns its result record. */
function runStep(step, { json, map }) {
  const started = Date.now();
  console.error(`\n== ${step.id}: ${shorten(step.cmd, 140)}`);
  const stdio = json ? ["ignore", process.stderr.fd, process.stderr.fd] : "inherit";
  const run = spawnSync(step.cmd, { cwd: path.join(ROOT, step.cwd), shell: true, stdio });
  // A check that can tell it has nothing to run on (no .NET, no source folder) says so with its `notRunExit`; the script printed why.
  const notRun = run.status !== 0 && run.status === map.checks[step.id]?.notRunExit;
  return { id: step.id, status: run.status === 0 ? "passed" : notRun ? "not-run" : "failed", ms: Date.now() - started };
}

function main() {
  const started = Date.now();
  const options = parseArgs(process.argv.slice(2));
  if (options.error) return usage(options.error);
  const { flags } = options;
  if (flags.has("--help")) return usage("help");
  const json = flags.has("--json");
  const map = loadMap(ROOT);

  if (options.where) {
    const found = whereIs(options.where.replaceAll("\\", "/"), map);
    if (found.length === 0) {
      console.error(`unmapped: ${options.where}, add it to tests/feature-map.json`);
      return EXIT.usage;
    }
    for (const f of found) console.log(`${f.id}\n  tests:  ${f.tests.join(", ") || "(none)"}\n  checks: ${f.checks.join(", ") || "(none)"}`);
    return EXIT.ok;
  }

  const changes = changedFiles(ROOT, options.base);

  if (flags.has("--check-fresh")) {
    const current = { head: head(ROOT), tree: treeHash(ROOT) };
    const state = freshness(readRecord(ROOT), current);
    if (json) console.log(JSON.stringify({ state, changes: changes.files.length, ...current }));
    else console.log(`${state} (${changes.files.length} changed file(s))`);
    return freshnessExit(state);
  }

  const notes = [];
  let mode = flags.has("--full") ? "full" : flags.has("--fast") ? "fast" : "default";
  let selected;
  if (options.feature) {
    const ids = options.feature.split(",");
    const unknown = ids.filter((id) => !map.features.some((f) => f.id === id));
    if (unknown.length) return usage(`unknown feature: ${unknown.join(", ")}`);
    selected = new Map(ids.map((id) => [id, []]));
  } else {
    if (!changes.mergeBase) {
      notes.push("no merge base with origin/main or main (shallow clone or detached HEAD?): running the full suite");
      mode = "full";
    }
    // A manifest whose only change is its version (a release bump) goes to release-version, not to the features that own it.
    const { versionOnly, rest } = splitVersionOnly(changes.files, (file) => {
      const old = changes.mergeBase && fileAt(ROOT, changes.mergeBase.sha, file);
      const now = fs.existsSync(path.join(ROOT, file)) ? fs.readFileSync(path.join(ROOT, file), "utf8") : null;
      return old != null && now != null ? { old, new: now } : null;
    });
    const { byFeature, unmapped } = resolveChanges(rest, map);
    if (versionOnly.length) byFeature.set(RELEASE_FEATURE, versionOnly);
    if (unmapped.length) {
      for (const file of unmapped) console.error(`unmapped: ${file}, add it to tests/feature-map.json`);
      return EXIT.usage;
    }
    selected = byFeature;
  }

  const features = [...selected.keys()].map((id) => map.features.find((f) => f.id === id));
  const plan = buildPlan({
    map,
    features,
    changed: options.feature ? [] : changes.files,
    mode,
    tracked: trackedFiles(ROOT),
    exists: (file) => fs.existsSync(path.join(ROOT, file)),
    platform: process.platform,
  });
  const overheadMs = Date.now() - started;
  if (flags.has("--plan")) {
    if (json) console.log(JSON.stringify({ base: changes.mergeBase, ...plan, features: Object.fromEntries(selected), overheadMs }, null, 2));
    else {
      printPlan(plan, selected, notes, changes.mergeBase);
      console.error(`verify: overhead ${overheadMs} ms`);
    }
    return EXIT.ok;
  }
  printPlan(plan, selected, notes, changes.mergeBase);

  const current = { head: head(ROOT), tree: treeHash(ROOT) };
  const results = [];
  let stopped = false;
  for (const step of plan.steps) {
    if (!step.cmd) results.push({ id: step.id, status: "skipped", ms: 0 });
    else if (step.status === "not-run") {
      const owners = features.filter((f) => f.checks.includes(step.id)).map((f) => f.id);
      console.error(`\nNOT RUN: ${step.id} ${step.reason}${owners.length ? ` (${owners.join(", ")})` : ""}`);
      results.push({ id: step.id, status: "not-run", ms: 0 });
    } else if (stopped) results.push({ id: step.id, status: "skipped", ms: 0 });
    else {
      const result = runStep(step, { json, map });
      results.push(result);
      if (result.status === "failed" && !flags.has("--keep-going")) stopped = true;
    }
  }

  const exit = exitCodeFor(results, { allowIncomplete: flags.has("--allow-incomplete") });
  console.error("\nverify summary");
  for (const r of results) console.error(`  ${r.status.padEnd(8)} ${r.id.padEnd(13)} ${(r.ms / 1000).toFixed(1)} s`);
  console.error(`  features: ${[...selected.keys()].join(", ") || "(none)"}\n  exit ${exit}, overhead ${overheadMs} ms, total ${((Date.now() - started) / 1000).toFixed(1)} s`);
  const record = { ...current, mode: plan.mode, features: [...selected.keys()], checks: results, exit, at: new Date().toISOString() };
  if (!options.feature) writeRecord(ROOT, record);
  if (json) console.log(JSON.stringify(record, null, 2));
  return exit;
}

process.exitCode = main();

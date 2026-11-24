#!/usr/bin/env node
// npm run verify: works out which features the changed files belong to (tests/feature-map.json) and runs exactly the
// checks those features need, fast to slow. _docs/TESTING.md, "Verify", describes the modes and the exit codes.
//   verify                  checks for what changed (commits, staged, unstaged, untracked) since the last passing run here
//                           (.cache/verify/last.json); since the merge base with origin/main in CI, after a rebase, or with none
//   verify --base <ref>     since the merge base with <ref>: `--base origin/main` is the whole branch, as `npm run ship` runs it
//   verify --fast           the features' own tests only, no `vitest related`
//   verify --full           every check in the map
//   verify --plan           print the plan and run nothing
//   verify --feature a,b    those features' checks, whatever changed
//   verify --where <path>   the feature(s) a file belongs to and their test globs
//   verify --check-fresh    does .cache/verify/last.json still describe this tree? (exit 0 fresh-pass, 1 fresh-fail, 4 stale)
//   --base <ref>  --json  --allow-incomplete  --keep-going
// Exit: 0 passed, 1 a check failed, 2 usage error or unmapped file, 3 a needed check couldn't run here, 4 stale.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { changedFiles, fileAt, head, isAncestor, trackedFiles, treeHash } from "./verify/git.mjs";
import { laneIds, laneWaitsFor } from "./verify/lane.mjs";
import { loadMap, MAP_FEATURE, MAP_FILE, resolveChanges, splitRoutingOnly, whereIs } from "./verify/map.mjs";
import { buildPlan, EXIT, exitCodeFor } from "./verify/plan.mjs";
import { RELEASE_FEATURE, splitVersionOnly } from "./verify/release.mjs";
import { freshness, freshnessExit, incrementalBase, nextOkHead, readRecord, SINCE_LAST_PASS, writeRecord } from "./verify/record.mjs";

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

/**
 * Start the cargo lane (tools/verify/lane.mjs) beside the other checks; null when no step goes to it. `done` resolves
 * with its results once it exits, `stop()` ends it early (a failure elsewhere).
 */
function startLane(steps, ids, map, keepGoing) {
  if (!ids.size) return null;
  const dir = path.join(ROOT, ".cache", "verify");
  fs.mkdirSync(dir, { recursive: true });
  const spec = {
    steps: steps
      .filter((step) => ids.has(step.id))
      .map((step) => ({ id: step.id, cmd: step.cmd, cwd: path.join(ROOT, step.cwd), notRunExit: map.checks[step.id]?.notRunExit })),
    log: path.join(dir, "lane.log"),
    out: path.join(dir, "lane.json"),
    keepGoing,
  };
  fs.rmSync(spec.out, { force: true });
  const specFile = path.join(dir, "lane-spec.json");
  fs.writeFileSync(specFile, JSON.stringify(spec));
  const env = {
    ...process.env,
    CARGO_TARGET_DIR: path.join(ROOT, "src-tauri", "target", "verify-lane"),
    CARGO_BUILD_JOBS: process.env.CARGO_BUILD_JOBS ?? String(Math.max(2, Math.floor(os.availableParallelism() / 4))),
  };
  const child = spawn(process.execPath, [path.join(ROOT, "tools", "verify", "lane.mjs"), specFile], {
    cwd: ROOT,
    env,
    stdio: "ignore",
    detached: process.platform !== "win32",
  });
  const read = () => {
    try {
      return JSON.parse(fs.readFileSync(spec.out, "utf8"));
    } catch {
      return [];
    }
  };
  const done = new Promise((resolve) => child.on("close", () => resolve(read())));
  console.error(`\n== lane: ${spec.steps.map((step) => step.id).join(", ")} run beside the other checks (output in .cache/verify/lane.log)`);
  const stop = () => {
    if (child.exitCode !== null) return;
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-child.pid, "SIGKILL");
  };
  return { done, stop, log: spec.log };
}

async function main() {
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

  // Without --base, a local run checks what changed since the last passing one (record.mjs), not the whole branch again.
  const previous = readRecord(ROOT);
  const since = options.base || flags.has("--check-fresh") ? null : incrementalBase(previous, { full: flags.has("--full"), ci: Boolean(process.env.CI), isAncestor: (sha) => isAncestor(ROOT, sha) });
  const changes = changedFiles(ROOT, options.base ?? since ?? undefined);
  const base = since && changes.mergeBase ? { ...changes.mergeBase, ref: SINCE_LAST_PASS } : changes.mergeBase;

  if (flags.has("--check-fresh")) {
    const current = { head: head(ROOT), tree: treeHash(ROOT) };
    const state = freshness(previous, current);
    if (json) console.log(JSON.stringify({ state, changes: changes.files.length, ...current }));
    else console.log(`${state} (${changes.files.length} changed file(s))`);
    return freshnessExit(state);
  }

  const notes = since ? ["checking what changed since the last passing run (--base origin/main checks the whole branch)"] : [];
  let mode =flags.has("--full") ? "full" : flags.has("--fast") ? "fast" : "default";
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
    const read = (file) => {
      const old = changes.mergeBase && fileAt(ROOT, changes.mergeBase.sha, file);
      const now = fs.existsSync(path.join(ROOT, file)) ? fs.readFileSync(path.join(ROOT, file), "utf8") : null;
      return old != null && now != null ? { old, new: now } : null;
    };
    // A manifest whose only change is its version (a release bump) goes to release-version, not to the features that own it.
    const { versionOnly, rest: afterVersions } = splitVersionOnly(changes.files, read);
    // The map changed in its features only (a new file's path, a test): it goes to feature-map, not to tooling's full run.
    const { routingOnly, rest } = splitRoutingOnly(afterVersions, read);
    const resolved = resolveChanges(rest, map);
    const { byFeature } = resolved;
    // A deleted file no feature claims any more (its glob went with it) is not a new file to map.
    const unmapped = resolved.unmapped.filter((file) => fs.existsSync(path.join(ROOT, file)));
    if (versionOnly.length) byFeature.set(RELEASE_FEATURE, versionOnly);
    if (routingOnly) byFeature.set(MAP_FEATURE, [MAP_FILE]);
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
    ci: Boolean(process.env.CI),
    browser: process.env.VERIFY_BROWSER === "1",
  });
  const overheadMs = Date.now() - started;
  if (flags.has("--plan")) {
    if (json) console.log(JSON.stringify({ base, ...plan, features: Object.fromEntries(selected), overheadMs }, null, 2));
    else {
      printPlan(plan, selected, notes, base);
      console.error(`verify: overhead ${overheadMs} ms`);
    }
    return EXIT.ok;
  }
  printPlan(plan, selected, notes, base);

  const current = { head: head(ROOT), tree: treeHash(ROOT) };
  const keepGoing = flags.has("--keep-going");
  const inLane = laneIds(plan.steps, map.checks, { ci: Boolean(process.env.CI) });
  const waitsFor = laneWaitsFor(plan.steps, inLane, map.checks);
  let lane = waitsFor.size ? null : startLane(plan.steps, inLane, map, keepGoing);
  const byId = new Map();
  let stopped = false;
  for (const step of plan.steps) {
    if (inLane.has(step.id)) continue;
    if (!step.cmd) byId.set(step.id, { id: step.id, status: "skipped", ms: 0 });
    else if (step.status === "not-run") {
      const owners = features.filter((f) => f.checks.includes(step.id)).map((f) => f.id);
      console.error(`\nNOT RUN: ${step.id} ${step.reason}${owners.length ? ` (${owners.join(", ")})` : ""}`);
      byId.set(step.id, { id: step.id, status: "not-run", ms: 0 });
    } else if (stopped) byId.set(step.id, { id: step.id, status: "skipped", ms: 0 });
    else {
      const result = runStep(step, { json, map });
      byId.set(step.id, result);
      if (result.status === "failed" && !keepGoing) stopped = true;
    }
    if (waitsFor.delete(step.id) && !waitsFor.size && !stopped) lane = startLane(plan.steps, inLane, map, keepGoing);
  }
  if (lane) {
    if (stopped) lane.stop();
    else console.error("\n== lane: waiting for it to finish");
    const laneResults = await lane.done;
    for (const result of laneResults) byId.set(result.id, result);
    if (laneResults.some((result) => result.status === "failed")) {
      const tail = fs.readFileSync(lane.log, "utf8").split(/\r?\n/).slice(-80).join("\n");
      console.error(`\n== lane failed; the last lines of .cache/verify/lane.log:\n${tail}`);
    }
  }
  // In the plan's order; a lane step stopped before it ran counts as skipped.
  const results = plan.steps.map((step) => byId.get(step.id) ?? { id: step.id, status: "skipped", ms: 0 });

  const exit = exitCodeFor(results, { allowIncomplete: flags.has("--allow-incomplete") });
  console.error("\nverify summary");
  for (const r of results) console.error(`  ${r.status.padEnd(8)} ${r.id.padEnd(13)} ${(r.ms / 1000).toFixed(1)} s`);
  console.error(`  features: ${[...selected.keys()].join(", ") || "(none)"}\n  exit ${exit}, overhead ${overheadMs} ms, total ${((Date.now() - started) / 1000).toFixed(1)} s`);
  const ran = { ...current, mode: plan.mode, base: base?.ref ?? null, browser: process.env.VERIFY_BROWSER === "1" || Boolean(process.env.CI), features: [...selected.keys()], checks: results, exit, at: new Date().toISOString() };
  const record = { ...ran, okHead: nextOkHead(previous, ran) };
  if (!options.feature) writeRecord(ROOT, record);
  if (json) console.log(JSON.stringify(record, null, 2));
  return exit;
}

process.exitCode = await main();

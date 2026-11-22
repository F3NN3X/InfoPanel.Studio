#!/usr/bin/env node
// Ships the current branch: `verify --full` here, then push, open (or reuse) the PR, post the `local-verify` commit
// status that the main ruleset requires, and squash merge. GitHub's CI still runs on the PR, as an advisory backstop.
//   npm run ship [-- --title "<subject>"] [--body-file <path>] [--no-merge]
// The status attests HEAD, so the tree must be committed and clean: an uncommitted change would merge unverified.
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { head, treeHash } from "./verify/git.mjs";
import { freshness, readRecord } from "./verify/record.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CONTEXT = "local-verify";

/** Whether a verify record lets this tree ship: a passing full run of exactly this HEAD and tree, nothing left unrun. */
export function gateFor(record, current) {
  const state = freshness(record, current);
  if (state !== "fresh-pass") return { ok: false, reason: `the last verify run is ${state} for this tree` };
  if (record.mode !== "full") return { ok: false, reason: `the last verify run was ${record.mode}, not full` };
  if (!record.browser) return { ok: false, reason: "the last verify run skipped the browser checks (VERIFY_BROWSER=1)" };
  const notRun = record.checks.filter((check) => check.status === "not-run").map((check) => check.id);
  if (notRun.length) return { ok: false, reason: `not run here: ${notRun.join(", ")}` };
  return { ok: true };
}

/** The commit status description (GitHub keeps 140 characters). */
export function statusDescription(record) {
  const passed = record.checks.filter((check) => check.status === "passed").length;
  const seconds = Math.round(record.checks.reduce((sum, check) => sum + check.ms, 0) / 1000);
  return `verify --full passed here: ${passed} checks in ${seconds} s`.slice(0, 140);
}

/** `--title <t>`, `--body-file <p>` and `--no-merge`; anything else is a usage error. */
export function parseArgs(argv) {
  const options = { title: null, bodyFile: null, merge: true };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--no-merge") options.merge = false;
    else if ((arg === "--title" || arg === "--body-file") && argv[i + 1]) options[arg === "--title" ? "title" : "bodyFile"] = argv[++i];
    else throw new Error(`unknown or incomplete argument: ${arg}`);
  }
  return options;
}

const run = (cmd, args) => execFileSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }).trim();

function ship(options) {
  const branch = run("git", ["branch", "--show-current"]);
  if (!branch || branch === "main") throw new Error("ship runs on a feature branch, not main");
  if (run("git", ["status", "--porcelain"])) throw new Error("commit or remove your changes first: the status attests HEAD");

  const verify = spawnSync(process.execPath, [path.join(ROOT, "tools", "verify.mjs"), "--full"], { cwd: ROOT, stdio: "inherit", env: { ...process.env, VERIFY_BROWSER: "1" } });
  if (verify.status !== 0) return verify.status ?? 1;
  const record = readRecord(ROOT);
  const gate = gateFor(record, { head: head(ROOT), tree: treeHash(ROOT) });
  if (!gate.ok) throw new Error(`not shipping: ${gate.reason}`);

  run("git", ["push", "-u", "origin", "HEAD"]);
  let pr = spawnSync("gh", ["pr", "view", "--json", "number", "-q", ".number"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();
  if (!pr) {
    const how = options.title ? ["--title", options.title, ...(options.bodyFile ? ["--body-file", options.bodyFile] : ["--body", ""])] : ["--fill"];
    run("gh", ["pr", "create", "--base", "main", ...how]);
    pr = run("gh", ["pr", "view", "--json", "number", "-q", ".number"]);
  }
  const repo = run("gh", ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"]);
  run("gh", ["api", "-X", "POST", `repos/${repo}/statuses/${record.head}`, "-f", "state=success", "-f", `context=${CONTEXT}`, "-f", `description=${statusDescription(record)}`]);
  console.error(`ship: #${pr} has ${CONTEXT} on ${record.head.slice(0, 8)}`);
  if (options.merge) {
    run("gh", ["pr", "merge", pr, "--squash", "--delete-branch", "--match-head-commit", record.head]);
    console.error(`ship: #${pr} merged`);
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = ship(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(`ship: ${error.message}`);
    process.exitCode = 1;
  }
}

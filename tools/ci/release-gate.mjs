#!/usr/bin/env node
// Release gate: a tag may only be released from a commit on main that CI vouches for. The commit must be reachable from
// main (never a branch that wasn't merged), and then passes when
//   1. the commit has a successful `ci-ok` check run, or
//   2. the pull request that merged it has a successful `ci-ok` on its head and `merge_commit_sha` is this commit
//      (squash-merged PRs run CI on the PR, not on the commit that lands on main), or
//   3. the last green nightly on main ran on this commit (a manual nightly on another branch never counts).
//   node tools/ci/release-gate.mjs --sha <commit> [--repo owner/name] [--check ci-ok]
// Reads the GitHub API through `gh` (GH_TOKEN in CI; the workflow needs `checks: read`). Exit 0 pass, 1 fail.
// Node built-ins only.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

/** Whether check runs hold a successful run of `name`. */
export const passed = (checkRuns, name) => checkRuns.some((run) => run.name === name && run.conclusion === "success");

/** Whether a compare of `sha...main` says main holds the commit (main is ahead of it, or is it). */
export const reachableFromMain = (compareStatus) => compareStatus === "ahead" || compareStatus === "identical";

/**
 * The decision, pure. `onMain`: the commit is reachable from main (`reachableFromMain`). `pulls`: the PRs of the commit, each `{ number, merge_commit_sha, headChecks }` (head checks
 * already fetched). Returns `{ ok, reason }`.
 */
export function decideRelease({ sha, check, onMain, commitChecks, pulls, nightlyShas }) {
  if (onMain !== true) return { ok: false, reason: `${sha.slice(0, 7)} is not on main: only a merged commit is released` };
  if (passed(commitChecks, check)) return { ok: true, reason: `${sha.slice(0, 7)} has a successful ${check}` };
  const pr = pulls.find((p) => p.merge_commit_sha === sha && passed(p.headChecks, check));
  if (pr) return { ok: true, reason: `#${pr.number}, merged as ${sha.slice(0, 7)}, has a successful ${check}` };
  if (nightlyShas.includes(sha)) return { ok: true, reason: `the last green nightly on main ran on ${sha.slice(0, 7)}` };
  return { ok: false, reason: `${sha.slice(0, 7)} has no successful ${check} (on the commit or the PR that merged it) and is not the last green nightly's commit on main` };
}

const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** `fn()`, tried again after each delay (ms) while it throws; the last attempt's error is thrown. A 5xx or a secondary rate limit passes. */
export function retried(fn, delays = [2000, 5000], sleep = sleepSync) {
  for (const delay of delays) {
    try {
      return fn();
    } catch {
      sleep(delay);
    }
  }
  return fn();
}

const gh = (...args) => retried(() => JSON.parse(execFileSync("gh", ["api", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })));

function gather({ repo, sha }) {
  const checksOf = (ref) => gh(`repos/${repo}/commits/${ref}/check-runs?per_page=100`).check_runs;
  const pulls = gh(`repos/${repo}/commits/${sha}/pulls`).map((p) => ({ number: p.number, merge_commit_sha: p.merge_commit_sha, headChecks: checksOf(p.head.sha) }));
  // No nightly workflow yet (or no green run): that route is simply closed.
  let nightly = [];
  try {
    nightly = gh(`repos/${repo}/actions/workflows/nightly.yml/runs?status=success&branch=main&per_page=1`).workflow_runs.filter((run) => run.head_branch === "main");
  } catch {}
  // A tag can point at any commit: only one main holds may be released. The branch is resolved to its commit first, so
  // a tag (or any other ref) named "main" can't stand in for it in the compare.
  const mainSha = gh(`repos/${repo}/git/ref/heads/main`).object.sha;
  const onMain = reachableFromMain(gh(`repos/${repo}/compare/${sha}...${mainSha}`).status);
  return { onMain, commitChecks: checksOf(sha), pulls, nightlyShas: nightly.map((run) => run.head_sha) };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const arg = (name, fallback) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : fallback);
  const sha = arg("--sha");
  const repo = arg("--repo", process.env.GITHUB_REPOSITORY);
  const check = arg("--check", "ci-ok");
  if (!sha || !repo) {
    console.error("usage: release-gate.mjs --sha <commit> --repo <owner/name> [--check ci-ok]");
    process.exit(2);
  }
  let facts;
  try {
    facts = gather({ repo, sha });
  } catch (error) {
    console.error(`release gate: could not read the GitHub API: ${error.stderr || error.message}`);
    process.exit(1);
  }
  const { ok, reason } = decideRelease({ sha, check, ...facts });
  console.log(`release gate: ${ok ? "pass" : "FAIL"}: ${reason}`);
  process.exit(ok ? 0 : 1);
}

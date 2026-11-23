// The record of the last `verify` run (.cache/verify/last.json, gitignored) and the freshness check built on it.
import fs from "node:fs";
import path from "node:path";
import { EXIT } from "./plan.mjs";

export const RECORD_FILE = ".cache/verify/last.json";

export function readRecord(root) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, RECORD_FILE), "utf8"));
  } catch {
    return null;
  }
}

export function writeRecord(root, record) {
  const file = path.join(root, RECORD_FILE);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
}

/** Whether a record still describes the tree: "fresh-pass", "fresh-fail" (same tree, exited non-zero) or "stale". */
export function freshness(record, current) {
  if (!record || record.head !== current.head || record.tree !== current.tree) return "stale";
  return record.exit === EXIT.ok ? "fresh-pass" : "fresh-fail";
}

/** `base` in a record whose run diffed against the last passing run's commit, and the refs that mean the whole branch. */
export const SINCE_LAST_PASS = "the last passing verify";
export const BRANCH_BASES = ["origin/main", "main"];

/**
 * The commit a run diffs against when no `--base` is given: the last passing run's (`okHead`) while HEAD still descends
 * from it, so a run checks what changed since then and not the whole branch again. Null (the merge base with
 * origin/main) for `--full`, in CI, without such a record, or after a rebase.
 */
export function incrementalBase(record, { full, ci, isAncestor }) {
  const ok = record?.okHead;
  return !full && !ci && ok && isAncestor(ok) ? ok : null;
}

/**
 * The `okHead` a run leaves behind: its own commit when it passed with nothing left unrun, on everything since the last
 * passing run or more (not `--fast`, which proves less, and not a narrower `--base`). Otherwise the one before it.
 */
export function nextOkHead(previous, { head, mode, base, exit, checks }) {
  const covers = mode === "full" || base === SINCE_LAST_PASS || BRANCH_BASES.includes(base);
  const proven = exit === EXIT.ok && mode !== "fast" && covers && checks.every((check) => check.status !== "not-run");
  return proven ? head : (previous?.okHead ?? null);
}

/** The exit code of `--check-fresh`: 0, 1 and 4. */
export const freshnessExit = (state) => ({ "fresh-pass": EXIT.ok, "fresh-fail": EXIT.failed, stale: EXIT.stale })[state];

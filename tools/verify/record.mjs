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

/** The exit code of `--check-fresh`: 0, 1 and 4. */
export const freshnessExit = (state) => ({ "fresh-pass": EXIT.ok, "fresh-fail": EXIT.failed, stale: EXIT.stale })[state];

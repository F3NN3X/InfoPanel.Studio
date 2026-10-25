// What changed, according to git: the change-set `verify` plans from, and the hash of the working tree that tells
// `--check-fresh` whether a recorded run still describes it. Node built-ins only.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const git = (root, args) => execFileSync("git", args, { cwd: root, maxBuffer: 1 << 30, stdio: ["ignore", "pipe", "ignore"] });
const gitText = (root, args) => git(root, args).toString("utf8");

/** Paths from `git diff --name-status -z`: a rename or copy counts by its old and its new path. */
export function parseNameStatus(out) {
  const tokens = out.split("\0").filter(Boolean);
  const paths = [];
  for (let i = 0; i < tokens.length; ) {
    const status = tokens[i++];
    const count = /^[RC]/.test(status) ? 2 : 1;
    paths.push(...tokens.slice(i, i + count));
    i += count;
  }
  return paths;
}

/** The union of several lists of paths, sorted. */
export function mergeChangeSets(...sets) {
  return [...new Set(sets.flat())].sort();
}

/** A hash of the changed content: the tracked diff against HEAD, then each untracked file by name and bytes. */
export function hashTree(diff, untracked) {
  const hash = createHash("sha256");
  hash.update(diff);
  for (const { file, bytes } of [...untracked].sort((a, b) => (a.file < b.file ? -1 : 1))) {
    hash.update(`\0untracked\0${file}\0`);
    hash.update(createHash("sha256").update(bytes).digest());
  }
  return hash.digest("hex");
}

export const head = (root) => gitText(root, ["rev-parse", "HEAD"]).trim();

export function trackedFiles(root) {
  return gitText(root, ["ls-files", "-z"]).split("\0").filter(Boolean);
}

const untrackedFiles = (root) => gitText(root, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean);

/** The hash of what differs from HEAD right now. */
export function treeHash(root) {
  const diff = git(root, ["diff", "HEAD", "--binary", "--no-ext-diff"]);
  const untracked = untrackedFiles(root).map((file) => ({ file, bytes: fs.readFileSync(path.join(root, file)) }));
  return hashTree(diff, untracked);
}

/** The merge base of HEAD and `base` (default origin/main, else main), or null when git can't find one. */
export function mergeBase(root, base) {
  for (const ref of base ? [base] : ["origin/main", "main"]) {
    try {
      git(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);
      return { ref, sha: gitText(root, ["merge-base", "HEAD", ref]).trim() };
    } catch {}
  }
  return null;
}

/** The text of `file` at `sha`, or null when it isn't there. */
export function fileAt(root, sha, file) {
  try {
    return gitText(root, ["show", `${sha}:${file}`]);
  } catch {
    return null;
  }
}

/**
 * Every file changed relative to the base: commits since the merge base, staged, unstaged and untracked (not ignored).
 * `mergeBase: null` means the base wasn't found (shallow clone, detached HEAD): the caller falls back to a full run.
 */
export function changedFiles(root, base) {
  const found = mergeBase(root, base);
  const names = (...args) => parseNameStatus(gitText(root, ["diff", "--name-status", "-z", "-M", ...args]));
  const committed = found ? names(found.sha, "HEAD") : [];
  return {
    mergeBase: found,
    files: mergeChangeSets(committed, names("--cached"), names(), untrackedFiles(root)),
  };
}

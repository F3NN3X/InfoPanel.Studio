#!/usr/bin/env node
// Run on the Linux machine after a sync (tools/remote-linux.mjs): removes the files the sync didn't send, so a file deleted
// on the checkout is gone there too. What the runs build and keep (node_modules, the Rust target, caches, builds) is left.
//   node tools/linux/prune.mjs <list of synced files>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Top-level folders a run builds or keeps between runs, never pruned. */
export const KEPT = ["node_modules", "dist", ".cache", "src-tauri/target", "src-tauri/pages", "lab/infopanel/node_modules"];

/** The files under `root` (relative, `/`-separated) not in `synced` and outside `KEPT`. Pure apart from the walk. */
export function stale(files, synced) {
  const keep = new Set(synced);
  return files.filter((f) => !keep.has(f) && !KEPT.some((k) => f === k || f.startsWith(`${k}/`)));
}

function walk(root, dir = "") {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = dir ? `${dir}/${e.name}` : e.name;
    if (KEPT.includes(rel)) return [];
    return e.isDirectory() ? walk(root, rel) : [rel];
  });
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  const synced = fs.readFileSync(process.argv[2], "utf8").split("\n").filter(Boolean);
  const gone = stale(walk("."), [...synced, path.basename(process.argv[2])]);
  for (const f of gone) fs.rmSync(f);
  if (gone.length) console.log(`pruned ${gone.length} file(s) the checkout no longer has`);
}

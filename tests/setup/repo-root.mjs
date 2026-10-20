import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The repo root: the nearest folder above this file holding package.json, so a test stays correct at any depth.
function findRoot(dir) {
  return fs.existsSync(path.join(dir, "package.json")) ? dir : findRoot(path.dirname(dir));
}

export const repoRoot = findRoot(path.dirname(fileURLToPath(import.meta.url)));

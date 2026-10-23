#!/usr/bin/env node
// Disk footprint of the desktop app: the newest installer, an installed folder broken down by node/, app/ and the
// exe, and src-tauri/resources/ (what desktop:prepare bundles; the only part CI has). Read-only.
//   node tools/perf/disk-report.mjs [--installed <dir>]
// --installed defaults to %LOCALAPPDATA%\InfoPanel Studio when it exists. Writes .cache/perf/<label>/disk.json.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { label } from "./bundle-report.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Bytes under a path (a file's own size), 0 when missing. */
export function sizeOf(p) {
  if (!fs.existsSync(p)) return 0;
  const st = fs.statSync(p);
  if (!st.isDirectory()) return st.size;
  return fs.readdirSync(p).reduce((n, name) => n + sizeOf(path.join(p, name)), 0);
}

/** Each top-level entry's size, plus the total. */
export function breakdown(dir) {
  if (!fs.existsSync(dir)) return null;
  const parts = Object.fromEntries(fs.readdirSync(dir).map((name) => [name, sizeOf(path.join(dir, name))]));
  return { dir, total: Object.values(parts).reduce((a, b) => a + b, 0), parts };
}

function newestInstaller() {
  const dir = path.join(ROOT, "src-tauri/target/release/bundle/nsis");
  if (!fs.existsSync(dir)) return null;
  const exes = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith("-setup.exe"))
    .map((f) => ({ file: path.join(dir, f), mtime: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return exes[0] ? { file: exes[0].file, bytes: sizeOf(exes[0].file) } : null;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const i = process.argv.indexOf("--installed");
  const fallback = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "InfoPanel Studio") : "";
  const installedDir = i > 0 ? process.argv[i + 1] : fallback;
  const result = {
    installer: newestInstaller(),
    installed: installedDir ? breakdown(installedDir) : null,
    resources: breakdown(path.join(ROOT, "src-tauri/resources")),
  };
  const dir = path.join(ROOT, ".cache", "perf", label());
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "disk.json"), `${JSON.stringify({ spec: "disk", label: label(), at: new Date().toISOString(), ...result }, null, 2)}\n`);
  const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
  if (result.installer) console.log(`installer ${mb(result.installer.bytes)}  ${path.basename(result.installer.file)}`);
  for (const key of ["installed", "resources"]) {
    const b = result[key];
    if (b) console.log(`${key.padEnd(9)} ${mb(b.total)}  ${Object.entries(b.parts).map(([k, v]) => `${k} ${mb(v)}`).join(", ")}`);
  }
}

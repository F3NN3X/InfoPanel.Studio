#!/usr/bin/env node
// Fills src-tauri/resources/ for the desktop app (InfoPanel Studio):
//
//   app/dist/       the built studio and kiosk, which the app's own server (ips-server) serves
//   ips-agent.exe   the release build of src-tauri/crates/ips-agent (the agents' hook command)
//
// The studio comes from .cache/desktop/dist (`npm run desktop:web`), never the repo's dist/,
// which a running dashboard server may be serving. Node built-ins only.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "src-tauri", "resources");

/** The release ips-agent.exe, built (cargo is incremental) into the workspace's target folder. */
function buildAgent() {
  const manifest = path.join(ROOT, "src-tauri", "Cargo.toml");
  execFileSync("cargo", ["build", "--release", "-p", "ips-agent", "--manifest-path", manifest], { stdio: "inherit" });
  return path.join(ROOT, "src-tauri", "target", "release", "ips-agent.exe");
}

/** Copy a tree; Vite's build manifest (`.vite/`, for tools/perf/bundle-report.mjs) stays behind. */
function copy(from, to) {
  fs.cpSync(from, to, { recursive: true, filter: (src) => !(fs.statSync(src).isDirectory() && path.basename(src) === ".vite") });
}

function main() {
  const web = path.join(ROOT, ".cache", "desktop", "dist");
  if (!fs.existsSync(path.join(web, "index.html"))) throw new Error(".cache/desktop/dist is missing: run `npm run desktop:web` first");

  const agent = buildAgent();
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  fs.copyFileSync(agent, path.join(OUT, "ips-agent.exe"));
  copy(web, path.join(OUT, "app", "dist"));
  console.log(`Prepared ${path.relative(ROOT, OUT)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

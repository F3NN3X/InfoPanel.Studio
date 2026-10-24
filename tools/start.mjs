#!/usr/bin/env node
// npm start: runs the dashboard server (ips-server) from source on http://127.0.0.1:3922. Builds dist/ with Vite first
// when it is missing, then `cargo run --release -p ips-server` from src-tauri. PORT, HOST and the other server
// settings in the environment go through; DASHBOARD_DIST defaults to the repo's dist/.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = (cmd, args, options) => spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32", ...options }).status ?? 1;

if (!fs.existsSync(path.join(ROOT, "dist", "index.html"))) {
  console.log("dist/ is missing: building the web app first");
  const built = run("npx", ["vite", "build"], { cwd: ROOT });
  if (built !== 0) process.exit(built);
}
process.exit(
  run("cargo", ["run", "--release", "-p", "ips-server"], {
    cwd: path.join(ROOT, "src-tauri"),
    env: { DASHBOARD_DIST: path.join(ROOT, "dist"), ...process.env },
  }),
);

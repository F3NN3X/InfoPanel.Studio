#!/usr/bin/env node
// CI only: the least that src-tauri/tauri.conf.json needs on disk for `cargo test` and `cargo clippy` to compile the
// desktop app, so those jobs skip the web build, the Node download and the release agent build that
// `npm run desktop:prepare` does for a real installer. tauri-build checks that every bundle resource exists; nothing the
// tests run reads their contents. Creates what is missing, never overwrites (a developer's real resources stay) and
// never writes under target/. The agent stub is a copy of the debug ips-agent.exe that `cargo build -p ips-agent` made
// (never an empty file: tauri-build copies resources/ips-agent.exe over target/debug/ips-agent.exe, which the agent's own
// forwarder tests run, so an empty one there fails them with "os error 193"); without that build it stops and says so.
//   frontendDist  src-tauri/pages        tracked
//   resources     src-tauri/resources/ips-agent.exe and src-tauri/resources/app/
//   resources     ../CHANGELOG.md       tracked
// Node built-ins only.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Create the missing stubs under `root`; returns what it created. */
export function stubDesktop(root = ROOT) {
  const resources = path.join(root, "src-tauri", "resources");
  const made = [];
  const agent = path.join(resources, "ips-agent.exe");
  const app = path.join(resources, "app");
  if (!fs.existsSync(agent)) {
    const built = path.join(root, "src-tauri", "target", "debug", "ips-agent.exe");
    if (!fs.existsSync(built) || fs.statSync(built).size === 0) throw new Error("no built ips-agent.exe to stub from: run `cargo build -p ips-agent` in src-tauri first");
    fs.mkdirSync(resources, { recursive: true });
    fs.copyFileSync(built, agent);
    made.push(path.relative(root, agent));
  }
  fs.mkdirSync(app, { recursive: true });
  return made;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const made = stubDesktop();
    console.log(made.length ? `Stubbed ${made.join(", ")}` : "src-tauri/resources already in place");
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

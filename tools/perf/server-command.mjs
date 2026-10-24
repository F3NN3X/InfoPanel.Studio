// The dashboard server to run: the ips-server binary at SERVER_CMD, by default the debug build
// (src-tauri/target/debug/ips-server, built by `cargo build -p ips-server` in src-tauri). Shared by the scratch server
// (scratch.mjs), tools/perf/make-fixture.mjs and the tests in tests/server.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** The server's debug build. */
export const SERVER_BINARY = path.join(ROOT, "src-tauri/target/debug", process.platform === "win32" ? "ips-server.exe" : "ips-server");

/** The server command. */
export function serverCommand(env = process.env) {
  const cmd = env.SERVER_CMD || SERVER_BINARY;
  if (!fs.existsSync(cmd)) throw new Error(`the ips-server binary is missing at ${cmd}; run cargo build -p ips-server in src-tauri.`);
  return { cmd, args: [] };
}

// The dashboard server to run for SERVER_IMPL: node (default) runs `node server.mjs`; native runs the ips-server binary
// at SERVER_CMD (default src-tauri/target/debug/ips-server, built by `cargo build -p ips-server` in src-tauri). Shared
// by the scratch server (scratch.mjs) and tests/server/server.test.mjs.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** The native server's debug build. */
export const NATIVE_SERVER = path.join(ROOT, "src-tauri/target/debug", process.platform === "win32" ? "ips-server.exe" : "ips-server");

/** The server command for SERVER_IMPL. */
export function serverCommand(env = process.env) {
  const impl = env.SERVER_IMPL || "node";
  if (impl === "node") return { cmd: process.execPath, args: [path.join(ROOT, "server.mjs")] };
  if (impl === "native") {
    const cmd = env.SERVER_CMD || NATIVE_SERVER;
    if (!fs.existsSync(cmd)) throw new Error(`SERVER_IMPL=native needs the ips-server binary at ${cmd}; run cargo build -p ips-server in src-tauri.`);
    return { cmd, args: [] };
  }
  throw new Error(`SERVER_IMPL must be node or native, not ${impl}`);
}

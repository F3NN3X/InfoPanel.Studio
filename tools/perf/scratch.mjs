#!/usr/bin/env node
// A throwaway server for the e2e and perf harness: copies the perf fixture (tests/fixtures/perf/data) to a temp
// folder, starts the fake Data API (fake-data-api.mjs) and then the dashboard server on that copy, both on ports the
// OS picks. It never touches the real data folder, InfoPanel's data or the user's agent sessions.
//   import { startScratch } from "./scratch.mjs";  const { base, dataApi, dataDir, pid, stop } = await startScratch();
//   node tools/perf/scratch.mjs     starts one and prints its URLs until Ctrl+C
// The server is the ips-server binary (server-command.mjs: the debug build, or SERVER_CMD).
// DASHBOARD_DIST is passed through (default dist/; run `npm run build` first).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serverCommand } from "./server-command.mjs";

export { serverCommand };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const FIXTURE_DIR = path.join(ROOT, "tests/fixtures/perf/data");
/** The server's start line (the same pattern as tests/server/server.test.mjs). */
const SERVER_LINE = /InfoPanel Studio on http:\/\/[^:]+:(\d+)/;
const DATA_API_LINE = /Fake Data API on http:\/\/[^:]+:(\d+)/;
const START_TIMEOUT_MS = 15_000;
/** Ports at or above 1024 that Chromium refuses to navigate to (net::ERR_UNSAFE_PORT); an OS-picked port can land on one. */
const UNSAFE_PORTS = new Set([1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080]);

/** Spawn a process and wait for its start line; resolves with the port. */
function launch(cmd, args, env, pattern, name) {
  const child = spawn(cmd, args, { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  let out = "";
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${name} did not start in ${START_TIMEOUT_MS} ms:\n${out}`));
    }, START_TIMEOUT_MS);
    const onData = (chunk) => {
      out += chunk;
      const port = Number(pattern.exec(out)?.[1]);
      if (port) {
        clearTimeout(timer);
        resolve({ child, port, output: () => out });
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", (c) => (out += c));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(new Error(`${name} failed to start: ${err.message}`));
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`${name} exited (${code}) before starting:\n${out}`));
    });
  });
}

/**
 * A temp folder with a copy of `fixture` (its `dataApiUrl` pointed at a fresh fake Data API), an empty home and an
 * empty InfoPanel folder. `stop` ends the fake Data API and anything pushed onto `children`, then removes the folder.
 */
export async function prepareScratch({ fixture = FIXTURE_DIR, dataApiEnv = {} } = {}) {
  if (!fs.existsSync(path.join(fixture, "config.json"))) throw new Error(`no fixture at ${fixture}; run node tools/perf/make-fixture.mjs`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ips-scratch-"));
  const dataDir = path.join(tmp, "data");
  const home = path.join(tmp, "home");
  const infopanel = path.join(tmp, "infopanel");
  fs.cpSync(fixture, dataDir, { recursive: true });
  fs.mkdirSync(home);
  fs.mkdirSync(infopanel);

  const children = [];
  const stop = () => {
    for (const c of children) c.kill();
    // The server may still hold files for a moment on Windows.
    setTimeout(() => fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5 }), 200).unref?.();
  };
  try {
    let api;
    do {
      api = await launch(process.execPath, [path.join(ROOT, "tools/perf/fake-data-api.mjs")], { ...process.env, ...dataApiEnv, PORT: "0", HOST: "127.0.0.1" }, DATA_API_LINE, "fake Data API");
      children.push(api.child);
      if (UNSAFE_PORTS.has(api.port)) api.child.kill();
    } while (UNSAFE_PORTS.has(api.port));
    const dataApi = `http://127.0.0.1:${api.port}`;
    const configFile = path.join(dataDir, "config.json");
    const config = JSON.parse(fs.readFileSync(configFile, "utf8"));
    fs.writeFileSync(configFile, JSON.stringify({ ...config, dataApiUrl: dataApi }));
    return { tmp, dataDir, home, infopanel, dataApi, children, stop };
  } catch (err) {
    stop();
    throw err;
  }
}

/**
 * Start a scratch server. `fixture` is the data folder to copy; `env` adds to the server's environment;
 * `dataApiEnv` to the fake Data API's (RATE_HZ, AUDIO_HZ, SEED).
 */
export async function startScratch(options = {}) {
  for (let attempt = 0; ; attempt++) {
    const scratch = await startScratchOnce(options);
    if (!UNSAFE_PORTS.has(Number(new URL(scratch.base).port)) || attempt >= 9) return scratch;
    scratch.stop();
  }
}

async function startScratchOnce({ fixture = FIXTURE_DIR, env = {}, dataApiEnv = {} }) {
  const server = serverCommand({ ...process.env, ...env });
  const scratch = await prepareScratch({ fixture, dataApiEnv });
  try {
    const serverEnv = {
      ...process.env,
      // The agent-usage scan reads the user's home; point it at an empty one.
      HOME: scratch.home,
      USERPROFILE: scratch.home,
      INFOPANEL_DATA_DIR: scratch.infopanel,
      HOST: "127.0.0.1",
      ...env,
      DASHBOARD_DATA_DIR: scratch.dataDir,
      PORT: "0",
    };
    const started = await launch(server.cmd, server.args, serverEnv, SERVER_LINE, "server");
    scratch.children.push(started.child);
    return { base: `http://127.0.0.1:${started.port}`, dataApi: scratch.dataApi, dataDir: scratch.dataDir, pid: started.child.pid, output: started.output, stop: scratch.stop };
  } catch (err) {
    scratch.stop();
    throw err;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const s = await startScratch();
  console.log(`scratch server ${s.base}  data API ${s.dataApi}  data ${s.dataDir}`);
  const stop = () => {
    s.stop();
    setTimeout(() => process.exit(0), 300);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

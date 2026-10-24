#!/usr/bin/env node
// Hook latency: how long `ips-agent hook claude` takes from spawn to exit, 50 runs against a local test server. Prints p50, p95 and the extremes. Measures, never gates.
//   node tools/perf/agent-latency.mjs [--runs=50] [--agent=<ips-agent.exe>]
// --agent defaults to src-tauri/target/release/ips-agent.exe (cargo build --release -p ips-agent).
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const RUNS = Number(arg("runs") ?? 50);
const AGENT = arg("agent") ?? path.join(ROOT, "src-tauri", "target", "release", "ips-agent.exe");
const BODY = JSON.stringify({ hook_event_name: "PostToolUse", session_id: "latency", cwd: "E:/x", tool_name: "Edit" });

/** Wall time in ms for one run to exit. */
function once(command, args) {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    const child = spawn(command, args, { stdio: ["pipe", "ignore", "ignore"] });
    child.on("close", () => resolve(Number(process.hrtime.bigint() - start) / 1e6));
    child.stdin.end(BODY);
  });
}

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];

async function measure(label, command, args) {
  await once(command, args); // warm the file cache
  const times = [];
  for (let i = 0; i < RUNS; i++) times.push(await once(command, args));
  times.sort((a, b) => a - b);
  const row = { label, runs: RUNS, min: times[0], p50: percentile(times, 50), p95: percentile(times, 95), max: times.at(-1) };
  console.log(`${label.padEnd(8)} runs=${RUNS}  min=${row.min.toFixed(1)}  p50=${row.p50.toFixed(1)}  p95=${row.p95.toFixed(1)}  max=${row.max.toFixed(1)}  (ms)`);
  return row;
}

if (!fs.existsSync(AGENT)) {
  console.error(`${AGENT} is missing: run cargo build --release -p ips-agent in src-tauri`);
  process.exit(1);
}
let posts = 0;
const server = http.createServer((req, res) => {
  req.resume();
  req.on("end", () => {
    posts++;
    res.writeHead(204).end();
  });
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const url = `--url=http://127.0.0.1:${server.address().port}`;
try {
  await measure("ips-agent", AGENT, ["hook", "claude", url]);
  console.log(`posts received: ${posts} (expected ${RUNS + 1})`);
} finally {
  server.close();
}

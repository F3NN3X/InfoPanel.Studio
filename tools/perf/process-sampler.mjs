#!/usr/bin/env node
// Samples the desktop app's processes (the app, its sidecar and its WebView2 processes) over a long run: CPU and
// memory per role, one CSV line per interval. Works on the installed app with debug mode off. Read-only.
//   node tools/perf/process-sampler.mjs [out.csv] [intervalSeconds=60]
//   node tools/perf/process-sampler.mjs --report <file.csv> [bucketMinutes=60]
// Default out: .cache/perf/processes-<date>.csv. CPU is % of one core (100 = one core busy); memory is private MB.
// Each sample costs one PowerShell start (about 0.3 s of CPU), outside the app's processes.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROLES = ["app", "sidecar", "webview", "renderer", "gpu", "utility"];
const COLUMNS = ["time", ...ROLES.flatMap((r) => [`${r}.cpu`, `${r}.mb`, `${r}.n`]), "total.cpu", "total.mb"];

/** Every process on the machine, with its CPU time (100 ns units) and private bytes. */
function processes() {
  const ps =
    "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine,KernelModeTime,UserModeTime,PrivatePageCount | ConvertTo-Json -Compress";
  return JSON.parse(execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", ps], { encoding: "utf8", maxBuffer: 64 << 20 }));
}

/** The app's process tree, each process with its role: the WebView2 ones by their --type. */
function appTree(all) {
  const roots = all.filter((p) => /^infopanel[- ]studio\.exe$/i.test(p.Name));
  const byParent = new Map();
  for (const p of all) byParent.set(p.ParentProcessId, [...(byParent.get(p.ParentProcessId) ?? []), p]);
  const out = [];
  const walk = (p, depth) => {
    const type = /--type=([a-z-]+)/.exec(p.CommandLine ?? "")?.[1];
    const role =
      depth === 0 ? "app" : /msedgewebview2/i.test(p.Name) ? (type === "renderer" ? "renderer" : type === "gpu-process" ? "gpu" : type ? "utility" : "webview") : "sidecar";
    out.push({ pid: p.ProcessId, role, cpu100ns: Number(p.KernelModeTime) + Number(p.UserModeTime), bytes: Number(p.PrivatePageCount) });
    if (depth < 8) for (const c of byParent.get(p.ProcessId) ?? []) walk(c, depth + 1);
  };
  for (const r of roots) walk(r, 0);
  return out;
}

function sample(outFile, intervalS) {
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  if (!fs.existsSync(outFile)) fs.writeFileSync(outFile, `${COLUMNS.join(",")}\n`);
  let prev = new Map();
  let prevAt = 0;
  const tick = () => {
    const at = Date.now();
    let tree;
    try {
      tree = appTree(processes());
    } catch (e) {
      console.error(`sample failed: ${e.message}`);
      return;
    }
    const dt = (at - prevAt) / 1000;
    const row = Object.fromEntries(ROLES.flatMap((r) => [[`${r}.cpu`, 0], [`${r}.mb`, 0], [`${r}.n`, 0]]));
    for (const p of tree) {
      const before = prev.get(p.pid);
      // A process that started since the last sample counts from its next one.
      if (before !== undefined && prevAt) row[`${p.role}.cpu`] += ((p.cpu100ns - before) / 1e7 / dt) * 100;
      row[`${p.role}.mb`] += p.bytes / 1048576;
      row[`${p.role}.n`] += 1;
    }
    prev = new Map(tree.map((p) => [p.pid, p.cpu100ns]));
    const first = !prevAt;
    prevAt = at;
    if (first) return; // the first sample only primes the CPU counters
    row["total.cpu"] = ROLES.reduce((s, r) => s + row[`${r}.cpu`], 0);
    row["total.mb"] = ROLES.reduce((s, r) => s + row[`${r}.mb`], 0);
    const cells = COLUMNS.map((c) => (c === "time" ? new Date(at).toISOString() : row[c].toFixed(c.endsWith(".n") ? 0 : 1)));
    fs.appendFileSync(outFile, `${cells.join(",")}\n`);
    if (!tree.length) console.error(`${cells[0]} app not running`);
  };
  console.log(`sampling every ${intervalS} s → ${outFile} (Ctrl+C to stop)`);
  tick();
  setInterval(tick, intervalS * 1000);
}

/** Least-squares slope of y over x. */
const slope = (xs, ys) => {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  return den ? num / den : 0;
};

function report(file, bucketMin) {
  const [head, ...lines] = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
  const cols = head.split(",");
  const rows = lines.map((l) => {
    const c = l.split(",");
    return Object.fromEntries(cols.map((k, i) => [k, k === "time" ? Date.parse(c[i]) : Number(c[i])]));
  }).filter((r) => r["app.n"] > 0);
  if (rows.length < 2) return console.log("not enough samples with the app running");
  const show = [
    ["total.cpu", "CPU %"],
    ["renderer.cpu", "render %"],
    ["gpu.cpu", "GPU %"],
    ["sidecar.cpu", "server %"],
    ["total.mb", "total MB"],
    ["renderer.mb", "render MB"],
    ["sidecar.mb", "server MB"],
  ];
  console.log(["from", ...show.map(([, l]) => l), "samples"].join("\t"));
  const t0 = rows[0].time;
  const buckets = new Map();
  for (const r of rows) {
    const b = Math.floor((r.time - t0) / (bucketMin * 60000));
    buckets.set(b, [...(buckets.get(b) ?? []), r]);
  }
  for (const [b, rs] of buckets) {
    const avg = (k) => rs.reduce((s, r) => s + r[k], 0) / rs.length;
    const from = new Date(t0 + b * bucketMin * 60000).toISOString().slice(0, 16).replace("T", " ");
    console.log([from, ...show.map(([k]) => avg(k).toFixed(k.endsWith(".cpu") ? 1 : 0)), rs.length].join("\t"));
  }
  const hours = rows.map((r) => (r.time - t0) / 3600000);
  const span = hours.at(-1);
  console.log(`\n${rows.length} samples over ${span.toFixed(1)} h.`);
  // Under an hour the warm-up and single spikes swamp the slope.
  if (span >= 1) {
    console.log("Trend per hour (least squares):");
    for (const [k, l] of show) console.log(`  ${l.padEnd(10)} ${slope(hours, rows.map((r) => r[k])).toFixed(2)}`);
  }
  const restarts = rows.slice(1).filter((r, i) => r["renderer.n"] !== rows[i]["renderer.n"]).length;
  if (restarts) console.log(`  renderer count changed ${restarts}× (a window opened or closed, or a renderer restarted)`);
}

const args = process.argv.slice(2);
if (args[0] === "--report") {
  if (!args[1]) throw new Error("usage: process-sampler.mjs --report <file.csv> [bucketMinutes]");
  report(args[1], Number(args[2] || 60));
} else {
  const date = new Date().toISOString().slice(0, 10);
  sample(args[0] || path.join(".cache", "perf", `processes-${date}.csv`), Number(args[1] || 60));
}

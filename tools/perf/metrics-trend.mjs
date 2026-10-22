#!/usr/bin/env node
// Summarises the desktop app's debug metrics (logs/metrics.csv) in time buckets, to see whether the
// webview's memory grows over a long session. Read-only.
//   node tools/perf/metrics-trend.mjs [metrics.csv] [bucketMinutes=30] [sinceIso]
// Default file: %LOCALAPPDATA%\dev.f3nn3x.infopanel-studio\logs\metrics.csv. Columns: see CSV_COLUMNS in
// src-tauri/src/debug.rs. See docs/desktop/webview-performance.md.
import fs from "node:fs";
import path from "node:path";

const file = process.argv[2] || path.join(process.env.LOCALAPPDATA || ".", "dev.f3nn3x.infopanel-studio", "logs", "metrics.csv");
const bucketS = Number(process.argv[3] || 30) * 60;
const since = process.argv[4] ? Date.parse(process.argv[4]) / 1000 : 0;

const [head, ...rows] = fs.readFileSync(file, "utf8").trim().split(/\r?\n/);
const cols = head.split(",");
const at = (name) => cols.indexOf(name);
const show = [
  ["webview.privateMb", "webview MB", (v) => v.toFixed(0)],
  ["studio.jsHeapUsed", "JS heap MB", (v) => (v / 1e6).toFixed(0)],
  ["studio.domNodes", "DOM", (v) => v.toFixed(0)],
  ["studio.eventSources", "streams", (v) => v.toFixed(0)],
  ["server.memory.rss", "server MB", (v) => (v / 1e6).toFixed(0)],
  ["app.rssMb", "app MB", (v) => v.toFixed(0)],
].filter(([c]) => at(c) >= 0);

console.log(["time", ...show.map(([, label]) => label)].join("\t"));
let last = -Infinity;
for (const row of rows) {
  const cells = row.split(",");
  const t = Number(cells[0]);
  if (t < since || t - last < bucketS) continue;
  last = t;
  const time = new Date(t * 1000).toISOString().slice(0, 16).replace("T", " ");
  console.log([time, ...show.map(([c, , fmt]) => (cells[at(c)] === "" ? "-" : fmt(Number(cells[at(c)]))))].join("\t"));
}

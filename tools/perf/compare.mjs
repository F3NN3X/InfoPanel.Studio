#!/usr/bin/env node
// A markdown table of every metric two perf runs share: A, B, the delta and the % change.
//   node tools/perf/compare.mjs <labelA> <labelB>
// Reads .cache/perf/<label>/*.json. A measured metric (median, min, max) is compared by median and flagged "noise"
// when A's and B's ranges overlap; a plain number (bundle bytes, disk sizes) is exact.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SKIP = new Set(["spec", "label", "at", "values", "files", "rafCallers", "impl"]);

const isStat = (v) => v && typeof v === "object" && "median" in v && "min" in v && "max" in v;

/** `{ "spec › path": number | { median, min, max } }` for one run's files. */
export function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    if (SKIP.has(k)) continue;
    const key = prefix ? `${prefix} › ${k}` : k;
    if (isStat(v)) out[key] = { median: v.median, min: v.min, max: v.max };
    else if (typeof v === "number") out[key] = v;
    else if (typeof v === "boolean") out[key] = v ? 1 : 0;
    else if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
  }
  return out;
}

export function loadRun(labelName, base = path.join(ROOT, ".cache", "perf")) {
  const dir = path.join(base, labelName);
  if (!fs.existsSync(dir)) throw new Error(`no perf results for "${labelName}" in ${dir}`);
  const out = {};
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
    flatten(data, data.spec ?? path.basename(file, ".json"), out);
  }
  return out;
}

const fmt = (n) => (Number.isFinite(n) ? (Math.abs(n) >= 100 ? n.toFixed(0) : Math.abs(n) >= 1 ? n.toFixed(2) : n.toFixed(3)) : "–");
const value = (m) => (typeof m === "number" ? m : m.median);
const range = (m) => (typeof m === "number" ? "" : ` (${fmt(m.min)}–${fmt(m.max)})`);

/** Markdown rows for every metric in both runs. */
export function compare(a, b) {
  const rows = ["| Metric | A | B | Δ | % | |", "|---|---|---|---|---|---|"];
  for (const key of Object.keys(a).filter((k) => k in b)) {
    const va = value(a[key]);
    const vb = value(b[key]);
    const delta = vb - va;
    const pct = va === 0 ? (delta === 0 ? 0 : Number.NaN) : (delta / Math.abs(va)) * 100;
    const noise = typeof a[key] !== "number" && typeof b[key] !== "number" && a[key].min <= b[key].max && b[key].min <= a[key].max && delta !== 0;
    rows.push(`| ${key} | ${fmt(va)}${range(a[key])} | ${fmt(vb)}${range(b[key])} | ${delta > 0 ? "+" : ""}${fmt(delta)} | ${Number.isFinite(pct) ? `${pct > 0 ? "+" : ""}${pct.toFixed(1)}%` : "–"} | ${noise ? "noise" : ""} |`);
  }
  return rows.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [labelA, labelB] = process.argv.slice(2);
  if (!labelA || !labelB) {
    console.error("usage: node tools/perf/compare.mjs <labelA> <labelB>");
    process.exit(2);
  }
  console.log(`A = ${labelA}, B = ${labelB}\n`);
  console.log(compare(loadRun(labelA), loadRun(labelB)));
}

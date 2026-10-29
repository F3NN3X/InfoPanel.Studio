#!/usr/bin/env node
// Writes tests/fixtures/hwinfo-names.json: the names and units HWiNFO gives its readings, which
// `tests/lib/hwinfo-names.test.ts` checks the alias rules in src/lib/hwinfo-aliases.ts against.
//
//   node tools/hwinfo-names.mjs --github            public HWiNFO CSV logs found with `gh api search/code`
//   node tools/hwinfo-names.mjs --live[=<base>]     this PC's HWiNFO readings from the Data API (GET only)
//   node tools/hwinfo-names.mjs --github --live     both; --out=<file> changes the target
//
// The fixture is frozen and refreshed by hand; CI only runs the test. A run replaces the sections of the
// modes it was given and keeps the other. Privacy: users can rename sensors, so a GitHub name is kept only
// once seen in at least two distinct repositories, and the fixture holds names, units and counts only
// (no repository, path, user, value or Data API key). Needs `gh`, authenticated, for --github.

import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = path.join(ROOT, "tests/fixtures/hwinfo-names.json");
const DEFAULT_BASE = "http://127.0.0.1:3921";
const MIN_REPOS = 2;

// Headers that hit HWiNFO CSV logs, and the readings whose units or names the aliases only assume.
const QUERIES = [
  '"Total CPU Usage [%]"',
  '"Physical Memory Used [MB]"',
  '"Virtual Memory Committed"',
  '"Virtual Memory Available"',
  '"Read Rate [MB/s]"',
  '"Write Rate [MB/s]"',
  '"Total Host Reads"',
  '"Total Host Writes"',
  '"GPU Video Engine Load"',
  '"GPU Memory Allocated"',
  '"Core 0 VID [V]"',
  '"VRM" "[RPM]"',
  '"VRM Temperature"',
  '"CPU_OPT" "[RPM]"',
  '"CPU Fan" "[RPM]"',
  '"CPU Optional" "[RPM]"',
  '"MOS" "[RPM]"',
  '"Current DL rate [KB/s]"',
  '"Drive Remaining Life [%]"',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** HWiNFO writes its degree sign in ANSI, so a log read as UTF-8 shows it as a replacement or `Â°`. */
const normalizeUnit = (u) => u.trim().replace(/^(?:Â°|ï¿½|[^\p{L}\p{N}%/]+)(?=[CF]$)/u, "°");

/** The `Name [unit]` columns of a CSV header line. A column without a unit is dropped. */
function parseHeader(line) {
  const out = [];
  for (const cell of line.replace(/^﻿/, "").split(/","|",\s*"|,(?=\S)/)) {
    const m = /^\s*"?(.+?)\s*\[([^\]]*)\]\s*"?\s*$/.exec(cell);
    // a name with a comma splits into fragments: drop those with a parenthesis left open
    if (m && (m[1].match(/\(/g) ?? []).length === (m[1].match(/\)/g) ?? []).length) out.push({ name: m[1].trim(), unit: normalizeUnit(m[2]) });
  }
  return out;
}

/** Whether a header line is HWiNFO's: Date and Time first, many unit-tagged columns. */
const isHwinfoHeader = (line) => /^﻿?"?Date"?,"?Time"?,/.test(line) && parseHeader(line).length >= 10;

/** Runs a command; with `firstLine` it stops reading at the first line break (a header, not a whole log). */
function run(cmd, args, { firstLine = false } = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { shell: false });
    let out = "";
    let err = "";
    let done = false;
    const end = (code) => {
      if (done) return;
      done = true;
      resolve({ code, out, err });
    };
    p.stdout.on("data", (d) => {
      out += d.toString("latin1");
      if (firstLine && out.includes("\n")) {
        out = out.slice(0, out.indexOf("\n"));
        p.kill();
        end(0);
      }
    });
    p.stderr.on("data", (d) => (err += d));
    p.on("close", end);
    p.on("error", () => end(1));
  });
}

/** A `gh` call that backs off when GitHub's rate limit answers. */
async function gh(args, opts) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const r = await run("gh", args, opts);
    if (r.code === 0 || !/rate limit|secondary|abuse|403|429/i.test(r.err)) return r;
    const wait = 30_000 * (attempt + 1);
    console.error(`rate limited, waiting ${wait / 1000}s`);
    await sleep(wait);
  }
  return { code: 1, out: "", err: "rate limited" };
}

async function fromGithub() {
  /** repository -> the "name\tunit" columns its logs have (a repository counts once per column) */
  const perRepo = new Map();
  const seen = new Set();
  for (const q of QUERIES) {
    for (const page of [1, 2, 3]) {
      // code search allows about 10 requests a minute
      await sleep(7000);
      const r = await gh(["api", "-X", "GET", "search/code", "-f", `q=${q} extension:csv`, "-f", "per_page=100", "-f", `page=${page}`]);
      if (r.code !== 0) {
        console.error(`search ${q} p${page}: ${r.err.trim().slice(0, 120)}`);
        break;
      }
      const items = JSON.parse(r.out).items ?? [];
      for (const it of items) {
        const repo = it.repository.full_name;
        const id = `${repo}/${it.path}`;
        if (seen.has(id)) continue;
        seen.add(id);
        const url = `repos/${repo}/contents/${it.path.split("/").map(encodeURIComponent).join("/")}`;
        const f = await gh(["api", url, "-H", "Accept: application/vnd.github.raw"], { firstLine: true });
        if (!f.out || !isHwinfoHeader(f.out)) continue;
        const set = perRepo.get(repo) ?? new Set();
        for (const c of parseHeader(f.out)) set.add(`${c.name}\t${c.unit}`);
        perRepo.set(repo, set);
      }
      if (items.length < 100) break;
    }
    console.error(`${q}: ${seen.size} files, ${perRepo.size} repositories`);
  }
  const names = {};
  for (const set of perRepo.values()) {
    for (const col of set) {
      const [name, unit] = col.split("\t");
      names[name] ??= {};
      names[name][unit] = (names[name][unit] ?? 0) + 1;
    }
  }
  // a name seen in one repository could be a renamed sensor; its count is its commonest unit's repositories
  const kept = Object.fromEntries(Object.entries(names).filter(([, units]) => Math.max(...Object.values(units)) >= MIN_REPOS));
  return { names: kept, repositories: perRepo.size };
}

async function fromLive(base) {
  const res = await fetch(`${base}/api/sensors`, { method: "GET", cache: "no-store" });
  if (!res.ok) throw new Error(`${base}/api/sensors answered ${res.status}`);
  const { sensors } = await res.json();
  const names = {};
  for (const [key, r] of Object.entries(sensors ?? {})) {
    // local HWiNFO readings only: `hwinfo.r{n}_…` is another PC's, and the key itself is never kept
    if (!key.startsWith("hwinfo.") || /^hwinfo\.r\d+_/.test(key) || !r.name) continue;
    const name = r.name.trim();
    const unit = normalizeUnit(r.unit ?? "");
    names[name] ??= {};
    names[name][unit] = (names[name][unit] ?? 0) + 1;
  }
  return { names };
}

const sortObj = (o) =>
  Object.fromEntries(
    Object.entries(o)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => [k, v && typeof v === "object" && !Array.isArray(v) ? sortObj(v) : v]),
  );

async function main() {
  const args = process.argv.slice(2);
  const arg = (n) => args.find((a) => a === `--${n}` || a.startsWith(`--${n}=`));
  const out = arg("out")?.split("=")[1] ?? DEFAULT_OUT;
  if (!arg("github") && !arg("live")) {
    console.error("usage: node tools/hwinfo-names.mjs [--github] [--live[=<base>]] [--out=<file>]");
    process.exit(2);
  }
  const prev = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : {};
  const date = new Date().toISOString().slice(0, 10);
  let github = prev.github ?? { names: {} };
  let live = prev.live ?? { names: {} };
  if (arg("github")) github = { date, minRepositories: MIN_REPOS, ...(await fromGithub()) };
  if (arg("live")) {
    const base = arg("live").split("=")[1] ?? DEFAULT_BASE;
    try {
      live = { date, ...(await fromLive(base)) };
      if (Object.keys(live.names).length === 0) console.error("live: the Data API answered but reports no hwinfo.* readings");
    } catch (e) {
      console.error(`live: ${e.message}`);
    }
  }
  const header =
    "Made by tools/hwinfo-names.mjs. github: header columns of public HWiNFO CSV logs, found with `gh api search/code`, kept for names in at least 2 distinct repositories, counted in repositories. live: the local hwinfo.* readings of a PC's InfoPanel Data API, counted in readings. Names, units and counts only. Refreshed by hand.";
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify({ header, github: sortObj(github), live: sortObj(live) }, null, 1)}\n`);
  console.log(`wrote ${path.relative(ROOT, out)}: ${Object.keys(github.names).length} github names, ${Object.keys(live.names).length} live names`);
}

await main();

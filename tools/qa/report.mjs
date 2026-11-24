#!/usr/bin/env node
// One report from the Widget QA page (`?widget-qa`): per frame its key, size, issues (the overflow probe), theme flags (under a worn
// Look) and note, plus a summary; clean frames are counted, not listed. It is `window.__qa.report()` read from a page on a scratch
// server (DASHBOARD_DEBUG=1, fixture data, the overflow runner's clock and image rule), or `--url` for a page already served.
// Report first; shoot only what it flags (--shots). Needs `npm run build` and the debug ips-server unless `--url` is given.
// The format is src/widgets/widget-qa/claude.ts; `node tools/qa/report.mjs --help` lists the flags.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { mountAll, openQaPage, qaUrl, startQa } from "./qa-page.mjs";

/** The page's params a flag sets as it is (`--skin cyber` is `skin=cyber`); `--look id/variant` sets look and lookVariant. */
const PARAMS = ["module", "spans", "q", "fx", "script", "skin", "variant", "surface", "graph", "meter", "accent", "radius", "cell", "gap", "theme", "settings", "data"];
const VALUED = new Set([...PARAMS, "look", "frame", "url", "shots", "shots-all", "fail-on"]);
const FLAGS = new Set(["md", "all", "notes", "help"]);
const FAIL_ON = { issues: "withIssues", flags: "withFlags", notes: "openNotes" };
/** What `--notes` takes after it, if anything: the open notes (the default), the fixed ones or all. */
const NOTE_KINDS = new Set(["open", "fixed", "all"]);

const USAGE = `usage: node tools/qa/report.mjs [page flags] [output flags]   (npm run qa:report -- …)
page flags (the URL params of ?widget-qa, src/widgets/widget-qa/params.ts):
  --module a,b          only those widgets (the surfaces are drawn without it)
  --spans 2x1,4x2       other spans (default: the page's 1x1,2x1,3x1,1x2,2x2,4x2)
  --look id[/variant]   wear a Look as a screen does (cyberspec/crimson); theme flags are read only under one
  --fx full|calm|off    --script 0   --skin s   --variant studio   --surface s   --graph g   --meter m
  --accent '#hex'       --radius r   --cell 150   --gap 8   --theme paper   --settings '{json}'   --q text
  --data fixtures|stress|live
  --url http://…        a page already served (a Vite dev server, the app's debug server) instead of a scratch one
output flags:
  --frame key           only one frame: 2x1, view:gauge, layout:x, surface:rail, or "CpuMonitor 2x1"
  --all                 list the clean frames too (default: counted only)
  --md                  print the Copy for Claude text instead of JSON
  --notes [open|fixed|all]   add the notes queue: the open notes in notes.json (or the fixed ones, or all), each
                        with its status, frame reference, link and the report line that reads its frame
  --shots <dir>         write a PNG of each listed frame (its box and 12 px around it) to <dir>
  --shots-all <dir>     the same for every frame
  --fail-on issues,flags,notes   exit 1 when any frame has one of them (notes: an open one)
exit: 0, 1 (--fail-on), 2 (bad arguments or the page did not load)`;

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const name = argv[i].startsWith("--") ? argv[i].slice(2) : "";
  if (name === "notes") args.notes = NOTE_KINDS.has(argv[i + 1]) ? argv[++i] : true;
  else if (FLAGS.has(name)) args[name] = true;
  else if (VALUED.has(name) && argv[i + 1] !== undefined) args[name] = argv[++i];
  else {
    console.error(`report: unknown or incomplete argument: ${argv[i]}\n${USAGE}`);
    process.exit(2);
  }
}
if (args.help) {
  console.log(USAGE);
  process.exit(0);
}
const failOn = (args["fail-on"] ?? "").split(",").filter(Boolean);
for (const k of failOn)
  if (!Object.hasOwn(FAIL_ON, k)) {
    console.error(`report: --fail-on takes issues, flags or notes, not ${k}`);
    process.exit(2);
  }
const shotDir = args["shots-all"] ?? args.shots;

const [look, lookVariant = ""] = (args.look ?? "").split("/");
const params = { ...Object.fromEntries(PARAMS.filter((k) => args[k] !== undefined).map((k) => [k, args[k]])), ...(look ? { look } : {}), ...(lookVariant ? { lookVariant } : {}), eager: "1" };
const filter = { ...(args.frame ? { frame: args.frame } : {}), ...(args.all ? { all: true } : {}), ...(args.notes ? { notes: args.notes } : {}) };
const fileSafe = (s) => s.replace(/[^\w.-]+/g, "_");
// The notes as the repo holds them now, not as the build bundled them: a note saved or fixed since the last build is read as it is.
const notes = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, "../../src/widgets/widget-qa/notes.json"), "utf8"));

const qa = await startQa({ url: args.url });
const browser = await chromium.launch({ headless: true });
let report;
let md;
try {
  // the overflow runner's page: the same clock, zone and image rule, so the issues read as its do
  const page = await openQaPage(browser, { base: qa.base, viewport: { width: 1800, height: 1000 }, clock: "2026-01-15T12:00:00Z", stubImages: true });
  await page.addInitScript((n) => (window.__qaNotes = n), notes);
  await page.goto(qaUrl(qa.base, params), { timeout: 120_000 });
  if (!(await mountAll(page, { needs: ["__qaMountAll", "__qa"], timeout: 120_000 }))) console.warn("report: the page did not settle; read as it is");
  // a worn Look's frames check themselves once they settle and a pack's motion runs a while (as adoption.mjs waits)
  if (look) await page.waitForTimeout(2000);
  report = await page.evaluate((f) => window.__qa.report(f), filter);
  if (shotDir) {
    fs.mkdirSync(shotDir, { recursive: true });
    const shoot = args["shots-all"] ? (await page.evaluate((f) => window.__qa.report(f), { ...filter, all: true })).frames : report.frames;
    const shots = new Map();
    for (const f of shoot) {
      const box = page.locator(f.id ? `[id="${f.id}"]` : `[data-qa-surface="${f.key.slice("surface:".length)}"]`).locator("[data-qa-box]").first();
      await box.evaluate((el) => el.scrollIntoView({ block: "center" }));
      const b = await box.boundingBox();
      if (!b) continue;
      const file = path.join(shotDir, `${fileSafe(f.frame)}.png`);
      // the box and a margin, so what pokes out of it is in the shot
      await page.screenshot({ path: file, animations: "disabled", caret: "hide", clip: { x: Math.max(0, b.x - 12), y: Math.max(0, b.y - 12), width: b.width + 24, height: b.height + 24 } });
      shots.set(f.frame, file);
    }
    for (const f of report.frames) if (shots.has(f.frame)) f.shot = shots.get(f.frame);
    report.shots = { dir: shotDir, count: shots.size };
  }
  if (args.md) md = await page.evaluate((f) => window.__qa.markdown(f), filter);
} catch (e) {
  console.error(`report: ${e.message}`);
  process.exitCode = 2;
} finally {
  await browser.close();
  qa.stop();
}
if (!report) process.exit(2);

if (md !== undefined) {
  const shots = report.frames.filter((f) => f.shot);
  console.log(shots.length ? `${md}\n\nShots (${shots.length}):\n${shots.map((f) => `- ${f.frame}: ${f.shot}`).join("\n")}` : md);
} else console.log(JSON.stringify(report, null, 2));

const failing = failOn.filter((k) => report.summary[FAIL_ON[k]] > 0);
if (failing.length) {
  console.error(`report: ${failing.map((k) => `${report.summary[FAIL_ON[k]]} ${report.summary[FAIL_ON[k]] === 1 ? "frame" : "frames"} with ${k}`).join(", ")} (--fail-on ${failOn.join(",")})`);
  process.exit(1);
}

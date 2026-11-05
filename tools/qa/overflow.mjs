#!/usr/bin/env node
// The overflow runner: drives the Widget QA page (`?widget-qa`, a scratch server on seeded demo data with
// DASHBOARD_DEBUG=1) at 1x1, 2x2, 4x2 and 4x4, mounts every widget (`window.__qaMountAll`), reads the probe
// (`window.__qaOverflow`, src/widgets/widget-qa/probe.ts) and records, per widget and span, the card and body rects,
// the descendant count, the text and the issues. Two runs diff (diffRuns): a new issue, or any other change at a span
// that is not roomy (4x4 is), fails. Needs `npm run build` and the debug ips-server first (the `overflow` check does both).
//   node tools/qa/overflow.mjs                          run and print the issue count, exit 0
//   node tools/qa/overflow.mjs --save <file>            also write the run to <file> (how a baseline is refreshed)
//   node tools/qa/overflow.mjs --baseline <file>        diff against <file>; exit 1 on a failing change
//   --module a,b   only those widgets (ids, legacy ones too)      --spans 1x1,2x2   other spans
//   --same-boxes a,b   also run with each surface (`surface=a`) and fail where a card or body rect differs from the default
//                      run: a theme's card paints but never moves or resizes anything (G2); the sample themes' `look-*` cards
//   --markup-baseline <file>   with --looks: also fail where a frame's markup under a pack differs from the file (the pack's parity: a
//                      pack's own markup changes are listed, not hidden by Classic's); --save-markup <file> writes it
//   --looks a,b        also run with each built-in pack applied (`settings` of tools/qa/pack-styles.mjs): fail on an issue the same style
//                      run without the pack does not have, or a card or body rect that differs (a pack paints, it never moves or resizes: G2); the default is the same widget style without the pack, so only the pack is measured
// Known limit: the probe walks elements, so it cannot see pseudo-elements (::before, ::after); a widget that draws
// part of its content there is only checked through its element box.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { startScratch } from "../perf/scratch.mjs";
import { diffRuns } from "./overflow-diff.mjs";
import { PACK_STYLES } from "./pack-styles.mjs";

const VALUED = new Set(["--save", "--baseline", "--module", "--spans", "--same-boxes", "--looks", "--markup-baseline", "--save-markup"]);
const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (!VALUED.has(argv[i]) || !argv[i + 1]) {
    console.error(`overflow: unknown or incomplete argument: ${argv[i]}\nusage: node tools/qa/overflow.mjs [--save file] [--baseline file] [--module a,b] [--spans 1x1,2x2,4x2,4x4] [--same-boxes surface,surface] [--looks pack,pack] [--markup-baseline file] [--save-markup file]`);
    process.exit(2);
  }
  args[argv[i].slice(2)] = argv[++i];
}
const spans = args.spans ?? "1x1,2x2,4x2,4x4";

/** Runs in the page: one record per widget frame, keyed `<module>@<span>`. */
function collect() {
  /**
   * A frame's markup as `<fnv1a hash>:<length>`, with the generated React ids (`:r1:`, `_r_1_`) written alike. Two things move on the clock of
   * the page and are written alike on their own element only: the Ken Burns drift (its `transform`) and a pulsing dot's ring
   * (its `box-shadow`), so a pack's real change to any other transform or shadow still shows. A style React cleared reads as none.
   */
  const markupOf = (box) => {
    const copy = box.cloneNode(true);
    for (const el of copy.querySelectorAll("[data-qa-bleed] > div[style*='scale(']")) el.setAttribute("style", el.getAttribute("style").replace(/transform: [^;]*/, "transform: ~"));
    for (const el of copy.querySelectorAll("span[style*='box-shadow: color-mix(']")) el.setAttribute("style", el.getAttribute("style").replace(/box-shadow: color-mix\([^;]*;/, "box-shadow: ~;"));
    for (const el of copy.querySelectorAll("[style='']")) el.removeAttribute("style");
    // An inline style's and an element's order is the order React first wrote them, which moves with when a measure or a pack's part lands: the same properties and attributes are the same markup.
    for (const el of copy.querySelectorAll("[style]")) el.setAttribute("style", el.getAttribute("style").split(/;s*/).filter(Boolean).sort().join("; "));
    for (const el of copy.querySelectorAll("*")) for (const attr of [...el.attributes].sort((x, y) => (x.name < y.name ? -1 : 1))) el.setAttributeNode(el.removeAttributeNode(attr));
    const text = copy.innerHTML.replace(/:r[0-9a-z]+:|_r_[0-9a-z]+_|«r[0-9a-z]+»/g, ":r:");
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
    return `${h.toString(16)}:${text.length}`;
  };
  const report = window.__qaOverflow();
  const figs = [...document.querySelectorAll("figure[data-qa-module]")];
  const round = (v) => Math.round(v * 100) / 100;
  const frames = {};
  report.forEach((r, i) => {
    const box = figs[i].querySelector("[data-qa-box]");
    const rect = (el) => {
      if (!el) return null;
      const a = el.getBoundingClientRect();
      const o = box.getBoundingClientRect();
      return [a.left - o.left, a.top - o.top, a.width, a.height].map(round);
    };
    const card = box.querySelector("[data-wp-tier]");
    frames[`${r.module}@${r.span}`] = {
      span: r.span,
      issues: r.issues.map((x) => `${x.kind}|${x.selector}|${x.dx}|${x.dy}`),
      card: rect(card),
      body: rect(box.querySelector("[data-wp-body]")),
      n: box.querySelectorAll("*").length,
      text: box.textContent.replace(/\s+/g, " ").trim(),
      view: card?.getAttribute("data-wp-view") ?? null,
      markup: markupOf(box),
    };
  });
  return frames;
}

/** One transparent pixel: what an off-site image answers with. */
const PIXEL = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

const scratch = await startScratch({ env: { DASHBOARD_DEBUG: "1" } });
const browser = await chromium.launch({ headless: true });
let frames;
const withSurface = {};
const withLook = {};
try {
  // A fixed clock and zone: reset times and clocks on the fixtures are "now plus", so the text would differ per run.
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 }, timezoneId: "UTC", locale: "en-US" });
  await page.clock.setFixedTime(new Date("2026-01-15T12:00:00Z"));
  // The fixtures' art lives on other hosts (a Steam logo on localhost:39482): loaded or not changes a widget's text, so each one answers here, on every machine.
  await page.route("**/*", (route) => {
    const request = route.request();
    if (request.resourceType() !== "image" || request.url().startsWith(scratch.base)) return route.fallback();
    return route.fulfill({ contentType: "image/png", body: PIXEL });
  });
  const module = args.module ? `&module=${args.module}` : "";
  const run = async (surface, look) => {
    const style = look && PACK_STYLES[look];
    const settings = look ? `&settings=${encodeURIComponent(JSON.stringify(style))}` : "";
    await page.goto(`${scratch.base}/?widget-qa${module}&spans=${spans}&eager=1${surface ? `&surface=${surface}` : ""}${settings}`);
    await page.waitForFunction(() => window.__qaMountAll && window.__qaOverflow, null, { timeout: 30_000 });
    // A page that never settled would be read half-built (ledger L50): fail rather than diff it.
    if (!(await page.evaluate(() => window.__qaMountAll()))) throw new Error(`overflow: the Widget QA page did not settle${surface ? ` (surface ${surface})` : ""}`);
    // A name the page does not know falls back to the default card, which would pass for the right one.
    if (surface && !(await page.evaluate((name) => !!document.querySelector(`[data-wp-tier][data-mat="${name}"]`), surface))) throw new Error(`overflow: no card drew the surface ${surface}`);
    // The pack must be on the cards: its chunk loaded and its `data-look` written (a pack that failed to load draws Classic and would pass).
    if (look && !(await page.evaluate((id) => !!document.querySelector(`[data-wp-tier][data-look="${id}"]`), look))) throw new Error(`overflow: no card wore the pack ${look}`);
    const found = await page.evaluate(collect);
    // only a pack's markup is kept for the parity file; Classic's is the v8 parity suite's
    if (!look) for (const f of Object.values(found)) delete f.markup;
    return found;
  };
  frames = await run();
  for (const surface of (args["same-boxes"] ?? "").split(",").filter(Boolean)) withSurface[surface] = await run(surface);
  for (const look of (args.looks ?? "").split(",").filter(Boolean)) {
    if (!Object.hasOwn(PACK_STYLES, look)) throw new Error(`overflow: no styles for the pack ${look} (tools/qa/pack-styles.mjs)`);
    withLook[look] = await run(undefined, look);
  }
} finally {
  await browser.close();
  scratch.stop();
}

const issueCount = Object.values(frames).reduce((n, f) => n + f.issues.length, 0);
console.log(`overflow: ${Object.keys(frames).length} frames, ${issueCount} issues`);
if (args.save) {
  fs.mkdirSync(path.dirname(path.resolve(args.save)), { recursive: true });
  fs.writeFileSync(args.save, `${JSON.stringify({ version: 1, spans, frames }, null, 1)}\n`);
  console.log(`overflow: saved ${args.save}`);
}
if (args.baseline) {
  const base = JSON.parse(fs.readFileSync(args.baseline, "utf8"));
  // A partial run (--module) compares only the frames it made.
  const scoped = args.module ? Object.fromEntries(Object.entries(base.frames).filter(([k]) => k in frames)) : base.frames;
  const d = diffRuns(scoped, frames);
  const show = (title, list) => list.length && console.log(`${title} (${list.length}):\n${list.slice(0, 40).map((x) => `  ${x.slice(0, 240)}`).join("\n")}`);
  show("new issues", d.newIssues);
  show("issues gone", d.goneIssues);
  show("changed", d.changes);
  for (const x of d.details.slice(0, 40)) console.log(`  ${x}`);
  show("missing frames", d.missing);
  show("added frames", d.added);
  if (d.failing.length) {
    console.error(`overflow: ${d.failing.length} failing change(s) against ${args.baseline}; if they are intended, refresh it with --save`);
    process.exit(1);
  }
  console.log(`overflow: matches ${args.baseline}`);
}

if (args["same-boxes"]) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  let moved = 0;
  for (const [surface, run] of Object.entries(withSurface)) {
    const bad = Object.entries(frames).filter(([key, f]) => !same(f.card, run[key]?.card) || !same(f.body, run[key]?.body));
    moved += bad.length;
    console.log(`overflow: ${surface}: ${Object.keys(run).length} frames, ${bad.length} with a card or body rect that differs from the default`);
    for (const [key, f] of bad.slice(0, 20)) console.error(`  ${key}: card ${JSON.stringify(f.card)} -> ${JSON.stringify(run[key]?.card)}, body ${JSON.stringify(f.body)} -> ${JSON.stringify(run[key]?.body)}`);
  }
  if (moved) process.exit(1);
}

if (args.looks) {
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  let bad = 0;
  for (const [look, run] of Object.entries(withLook)) {
    const moved = Object.entries(frames).filter(([key, f]) => !same(f.card, run[key]?.card) || !same(f.body, run[key]?.body));
    const issues = Object.entries(run).flatMap(([key, f]) => f.issues.filter((i) => !frames[key]?.issues.includes(i)).map((i) => `${key} ${i}`));
    bad += moved.length + issues.length;
    console.log(`overflow: pack ${look}: ${Object.keys(run).length} frames, ${moved.length} with a card or body rect that differs from Classic, ${issues.length} issues Classic does not have`);
    for (const [key, f] of moved.slice(0, 20)) console.error(`  ${key}: card ${JSON.stringify(f.card)} -> ${JSON.stringify(run[key]?.card)}, body ${JSON.stringify(f.body)} -> ${JSON.stringify(run[key]?.body)}`);
    for (const i of issues.slice(0, 40)) console.error(`  new issue ${i.slice(0, 240)}`);
  }
  if (args["save-markup"]) {
    const packs = Object.fromEntries(Object.entries(withLook).map(([look, run]) => [look, Object.fromEntries(Object.entries(run).map(([key, f]) => [key, f.markup]))]));
    fs.mkdirSync(path.dirname(path.resolve(args["save-markup"])), { recursive: true });
    fs.writeFileSync(args["save-markup"], `${JSON.stringify({ version: 1, spans, packs }, null, 1)}
`);
    console.log(`overflow: saved ${args["save-markup"]}`);
  }
  if (args["markup-baseline"]) {
    const base = JSON.parse(fs.readFileSync(args["markup-baseline"], "utf8"));
    for (const [look, run] of Object.entries(withLook)) {
      const was = base.packs?.[look];
      if (!was) {
        console.error(`overflow: no markup baseline for the pack ${look} in ${args["markup-baseline"]}`);
        bad++;
        continue;
      }
      // a partial run (--module) compares only the frames it made
      const keys = Object.keys(run);
      const differ = keys.filter((k) => was[k] !== run[k].markup);
      const missing = args.module ? [] : Object.keys(was).filter((k) => !(k in run));
      bad += differ.length + missing.length;
      console.log(`overflow: pack ${look} markup: ${keys.length} frames, ${differ.length} differ from ${args["markup-baseline"]}, ${missing.length} missing`);
      for (const k of differ.slice(0, 20)) console.error(`  ${k}: ${was[k]} -> ${run[k].markup}`);
    }
    if (bad) console.error("overflow: a pack's markup changed; if that is intended, refresh it with --save-markup");
  }
  if (bad) process.exit(1);
}

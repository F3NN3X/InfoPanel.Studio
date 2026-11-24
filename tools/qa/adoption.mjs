#!/usr/bin/env node
// The theme-adoption report and the switch round trip, from the Widget QA page (`?widget-qa&look=<id>`, a scratch server with
// DASHBOARD_DEBUG=1 on the seeded demo data, or `--url` for a page already served: a Vite dev server, the app's debug server).
// It wears each Look as a screen does, mounts every frame (`window.__qaMountAll`) and prints `window.__qaAdoption()`: per frame the
// colours that are not the Look's, the text outside the pack's fonts and pack decoration on the rail's items
// (src/widgets/widget-qa/adoption.ts). `--round-trip <look>` then wears that Look and comes back (`window.__qaRoundTrip`) and lists
// what stayed against the fresh load. Needs `npm run build` and the debug ips-server unless `--url` is given.
//   node tools/qa/adoption.mjs --look cyberspec/crimson                  the report under Cyberspec Crimson
//   node tools/qa/adoption.mjs --look cyberspec,term --spans 2x2,4x2     several Looks, other spans
//   --module a,b   only those widgets (the surfaces are drawn without it)   --data live   the server's own data
//   --round-trip classic   also A -> classic -> A; a `look/variant` names a variant on either side
//   --save <dir>   write each report (and trip) to <dir>/<look>.txt          --strict   exit 1 when any frame is flagged
//   --no-script    leave the pack's effect script out (a Vite dev page: React's dev double mount hands the script's canvas over twice)
import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { startScratch } from "../perf/scratch.mjs";

const VALUED = new Set(["--look", "--spans", "--module", "--data", "--round-trip", "--save", "--url"]);
const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--strict" || argv[i] === "--no-script") args[argv[i].slice(2)] = true;
  else if (VALUED.has(argv[i]) && argv[i + 1]) args[argv[i].slice(2)] = argv[++i];
  else {
    console.error(`adoption: unknown or incomplete argument: ${argv[i]}\nusage: node tools/qa/adoption.mjs --look id[/variant][,id] [--spans 2x2,4x2] [--module a,b] [--data live] [--round-trip id[/variant]] [--save dir] [--url base] [--strict] [--no-script]`);
    process.exit(2);
  }
}
if (!args.look) {
  console.error("adoption: --look is required (a Look id, a pack id, optionally /variant)");
  process.exit(2);
}
const split = (s) => {
  const [look, variant = ""] = s.split("/");
  return { look, variant };
};
const looks = args.look.split(",").filter(Boolean).map(split);
const spans = args.spans ?? "2x2,4x2";

const scratch = args.url ? undefined : await startScratch({ env: { DASHBOARD_DEBUG: "1" } });
const base = (args.url ?? scratch.base).replace(/\/$/, "");
const browser = await chromium.launch({ headless: true });
let flagged = 0;
try {
  for (const { look, variant } of looks) {
    const page = await browser.newPage({ viewport: { width: 1800, height: 1100 }, timezoneId: "UTC", locale: "en-US" });
    const query = new URLSearchParams({ look, ...(variant ? { lookVariant: variant } : {}), spans, eager: "1", ...(args.module ? { module: args.module } : {}), ...(args.data ? { data: args.data } : {}), ...(args["no-script"] ? { script: "0" } : {}) });
    await page.goto(`${base}/?widget-qa&${query.toString().replace(/%2C/gi, ",")}`, { timeout: 120_000 });
    await page.waitForFunction(() => window.__qaMountAll && window.__qaAdoption, null, { timeout: 120_000 });
    if (!(await page.evaluate(() => window.__qaMountAll()))) console.warn(`adoption: the page did not settle under ${look}`);
    // a page that threw draws nothing and would report nothing flagged
    if (!(await page.locator("[data-qa-box]").count())) throw new Error(`adoption: the page drew no frames under ${look} (a Vite dev page wearing a scripted pack needs --no-script)`);
    // the frames run the check once they settle; the report reads them all again now
    await page.waitForTimeout(2000);
    const { report, text } = await page.evaluate(() => window.__qaAdoption());
    flagged += report.filter((r) => r.flags.length).length;
    let out = `== ${look}${variant ? `/${variant}` : ""}\n${text}\n`;
    if (args["round-trip"]) {
      const via = split(args["round-trip"]);
      const trip = await page.evaluate(([l, v]) => window.__qaRoundTrip(l, v), [via.look, via.variant]);
      const d = trip.diff;
      out += `\n== round trip ${trip.from} -> ${trip.via} -> ${trip.from}: ${d.colours.length} frames with colours that stayed, ${d.vars.length} custom properties, ${d.attrs.length} attributes, ${d.sheets.length} sheets\n`;
      for (const c of d.colours) out += `${c.frame}: ${c.changed}\n${c.sample.map((s) => `  ${s}`).join("\n")}\n`;
      for (const line of [...d.vars, ...d.attrs, ...d.sheets]) out += `  ${line}\n`;
    }
    console.log(out);
    if (args.save) {
      fs.mkdirSync(args.save, { recursive: true });
      fs.writeFileSync(path.join(args.save, `${look}${variant ? `-${variant}` : ""}.txt`), out);
    }
    await page.close();
  }
} finally {
  await browser.close();
  scratch?.stop();
}
if (args.strict && flagged) {
  console.error(`adoption: ${flagged} flagged frame(s)`);
  process.exit(1);
}

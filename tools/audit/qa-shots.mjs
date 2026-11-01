#!/usr/bin/env node
// Screenshots of the widget QA page (`?widget-qa`), one PNG per widget and span, per view and per skin, for comparing a
// redesign before and after. Report-only: it never gates. Runs on a scratch server (DASHBOARD_DEBUG=1, fixture data) and
// serves dist/, so run `npm run build` first.
//   npm run qa:shots -- [--label before] [--skins default,cyber|all] [--spans 2x2,4x4] [--module CpuMonitor,Clock] [--data stress]
// Writes .cache/qa-shots/<label>/<skin>/<module>_<span>.png and <module>_view-<id>.png (label: the short commit).
//   npm run qa:shots -- --compare before after
// Writes .cache/qa-shots/compare-<before>-<after>.html: each shot of both runs side by side, the changed ones first.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";
import { startScratch } from "../perf/scratch.mjs";
import { compareRuns } from "./qa-shots-compare.mjs";

const ROOT = path.resolve(import.meta.dirname, "../..");
const { values: opts, positionals } = parseArgs({
  options: {
    label: { type: "string" },
    skins: { type: "string", default: "default" },
    spans: { type: "string", default: "2x2,4x4" },
    module: { type: "string", default: "" },
    data: { type: "string", default: "fixtures" },
    compare: { type: "boolean", default: false },
  },
  allowPositionals: true,
});
const SHOTS = path.join(ROOT, ".cache/qa-shots");

if (opts.compare) {
  const [before, after] = positionals;
  if (!before || !after) {
    console.error("qa-shots: --compare needs two labels, e.g. --compare before after");
    process.exit(2);
  }
  for (const label of [before, after])
    if (!fs.existsSync(path.join(SHOTS, label))) {
      console.error(`qa-shots: no run labelled ${label} in .cache/qa-shots/`);
      process.exit(2);
    }
  const { file, changed, total } = compareRuns(SHOTS, before, after);
  console.log(`qa-shots: ${changed} of ${total} shots differ; ${path.relative(ROOT, file)}`);
  process.exit(0);
}

if (!fs.existsSync(path.join(process.env.DASHBOARD_DIST ?? path.join(ROOT, "dist"), "index.html"))) {
  console.error("qa-shots: no built page in dist/; run `npm run build` first.");
  process.exit(2);
}
const label = opts.label ?? execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
const outDir = path.join(SHOTS, label);
const fileSafe = (s) => s.replace(/[^\w.-]+/g, "-");

const qa = await startScratch({ env: { DASHBOARD_DEBUG: "1" } });
const browser = await chromium.launch();
try {
  // Reduced motion stops the ticker-driven motion (pulse dots, marquees) that animations: "disabled" cannot reach.
  const page = await browser.newPage({ viewport: { width: 1500, height: 900 }, reducedMotion: "reduce" });
  // One fixed time for every run, so clocks, countdowns and "x min ago" draw the same and --compare shows real changes.
  await page.clock.setFixedTime(new Date("2026-06-01T12:00:00"));
  const load = async (skin) => {
    const query = new URLSearchParams({ eager: "1", spans: opts.spans, ...(skin !== "default" && { skin }), ...(opts.module && { module: opts.module }), ...(opts.data !== "fixtures" && { data: opts.data }) });
    await page.goto(`${qa.base}/?widget-qa&${query}`);
    await page.waitForSelector("figure [data-qa-box] *");
    await page.evaluate(() => window.__qaMountAll?.());
    // The issue badges land as each frame settles; give the last ones time to draw.
    await page.waitForTimeout(500);
  };

  await load("default");
  // "all" reads the skins from the toolbar's skin list, so new skins are covered without touching this script.
  const skins =
    opts.skins === "all"
      ? await page.$$eval("header label", (labels) => [...(labels.find((l) => l.firstElementChild?.textContent === "skin")?.querySelectorAll("option") ?? [])].map((o) => o.value).filter(Boolean))
      : opts.skins.split(",").map((s) => s.trim()).filter(Boolean);

  let count = 0;
  for (const skin of skins) {
    if (skin !== "default") await load(skin);
    const dir = path.join(outDir, fileSafe(skin));
    // Placeholders below a widget's minimum have no box, so they are skipped.
    for (const fig of await page.locator("figure[data-qa-module]:has([data-qa-box]), figure[data-qa-view]").all()) {
      const [mod, span, view, viewOf] = await Promise.all(["data-qa-module", "data-qa-span", "data-qa-view", "data-qa-view-of"].map((a) => fig.getAttribute(a)));
      const name = view ? `${viewOf}_view-${view}` : `${mod}_${span}`;
      await fig.screenshot({ path: path.join(dir, `${fileSafe(name)}.png`), animations: "disabled" });
      count++;
    }
    console.log(`qa-shots: ${skin} done`);
  }
  console.log(`qa-shots: ${count} PNGs in ${path.relative(ROOT, outDir)}`);
} finally {
  await browser.close();
  qa.stop();
}

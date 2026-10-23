#!/usr/bin/env node
// What each kind of drawing costs on a page: loads it fresh in a headed Chromium (WebView2 is Edge, the same engine) once per
// variant, each variant switching one thing off, and prints renderer and GPU CPU, their private memory, and the
// page's blur layers, canvas memory and decoded image memory. Windows only. Read-only.
//   PW_CORE=<path to playwright-core> CHROME=<chrome.exe or msedge.exe> [CLICK=<button name>] node tools/perf/render-bench.cjs <url> [variants=all] [seconds=60] [WxH=1920x550]
// variants: a comma list of the names in VARIANTS. Never point it at the live server: start a scratch one on a copy
// of the data (docs/performance.md, "How to measure").
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require(process.env.PW_CORE || "playwright-core");

// Edge refuses automation where policy disallows remote debugging; Playwright's Chromium then stands in.
const BROWSER = process.env.CHROME || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const OFF_BACKDROP = "*,*::before,*::after{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}";
const OFF_FILTER = "*,*::before,*::after{filter:none!important}";
const OFF_CSS_MOTION = "*,*::before,*::after{animation:none!important;transition:none!important}";
/** Each variant: CSS added before the page's own, and query parameters. */
const VARIANTS = {
  base: {},
  noBackdrop: { css: OFF_BACKDROP },
  noFilter: { css: OFF_FILTER },
  noCssMotion: { css: OFF_CSS_MOTION },
  noCanvas: { css: "canvas{display:none!important}" },
  fps30: { query: { fps: "30" } },
  reduce: { query: { motion: "reduce" } },
  allOff: { css: OFF_BACKDROP + OFF_FILTER + OFF_CSS_MOTION, query: { motion: "reduce" } },
};

const [url, which = "all", seconds = "60", size = "1920x550"] = process.argv.slice(2);
if (!url) throw new Error("usage: render-bench.cjs <url> [variants] [seconds] [WxH]");
const [width, height] = size.split("x").map(Number);
const names = which === "all" ? Object.keys(VARIANTS) : which.split(",");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "render-bench-"));

/** CPU seconds and private MB of this run's renderer and GPU processes, found by the profile folder. */
function processes() {
  const tag = path.basename(profile);
  const ps = `Get-CimInstance Win32_Process -Filter "Name='msedge.exe' or Name='chrome.exe'" | ? { $_.CommandLine -like '*${tag}*' } | % { $t = if ($_.CommandLine -match '--type=([a-z-]+)') { $matches[1] } else { 'browser' }; '{0} {1} {2}' -f $t, (($_.KernelModeTime + $_.UserModeTime) / 1e7), ($_.PrivatePageCount / 1MB) }`;
  const out = { renderer: { cpu: 0, mb: 0 }, gpu: { cpu: 0, mb: 0 } };
  for (const line of execFileSync("powershell", ["-NoProfile", "-Command", ps]).toString().trim().split(/\r?\n/)) {
    const [type, cpu, mb] = line.split(" ");
    const role = type === "renderer" ? "renderer" : type === "gpu-process" ? "gpu" : null;
    if (role) {
      out[role].cpu += Number(cpu);
      out[role].mb += Number(mb);
    }
  }
  return out;
}

/** What the page holds: layers that blur what's behind them, canvas backing stores, decoded <img> pixels. */
function pageStats() {
  let backdrop = 0;
  let filtered = 0;
  for (const el of document.querySelectorAll("*")) {
    const s = getComputedStyle(el);
    if (s.backdropFilter && s.backdropFilter !== "none") backdrop++;
    if (s.filter && s.filter !== "none") filtered++;
  }
  const canvases = [...document.querySelectorAll("canvas")];
  const canvasMb = canvases.reduce((n, c) => n + c.width * c.height * 4, 0) / 1048576;
  const imgs = [...document.images].filter((i) => i.complete && i.naturalWidth);
  const imgMb = imgs.reduce((n, i) => n + i.naturalWidth * i.naturalHeight * 4, 0) / 1048576;
  const shownMb = imgs.reduce((n, i) => n + i.clientWidth * i.clientHeight * devicePixelRatio ** 2 * 4, 0) / 1048576;
  return { backdrop, filtered, canvases: canvases.length, canvasMb, imgs: imgs.length, imgMb, shownMb, anims: document.getAnimations().length };
}

(async () => {
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: false,
    executablePath: BROWSER,
    viewport: { width, height },
    args: ["--disable-features=CalculateNativeWinOcclusion", "--disable-backgrounding-occluded-windows", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"],
  });
  console.log(["variant", "render cores", "gpu cores", "render MB", "gpu MB", "blur layers", "filtered", "canvas MB", "img MB (shown)", "anims"].join("\t"));
  for (const name of names) {
    const v = VARIANTS[name];
    if (!v) throw new Error(`unknown variant ${name}`);
    for (const p of ctx.pages()) await p.close();
    const page = await ctx.newPage();
    if (v.css) await page.addInitScript((css) => document.addEventListener("DOMContentLoaded", () => document.head.append(Object.assign(document.createElement("style"), { textContent: css }))), v.css);
    const u = new URL(url);
    for (const [k, val] of Object.entries(v.query ?? {})) u.searchParams.set(k, val);
    await page.goto(u.href);
    // CLICK=<name>: a button to press once loaded, e.g. the Studio's Design view.
    if (process.env.CLICK) await page.getByRole("button", { name: process.env.CLICK, exact: true }).first().click();
    await page.waitForTimeout(15000);
    const s = Number(seconds);
    const a = processes();
    await page.waitForTimeout(s * 1000);
    const b = processes();
    const st = await page.evaluate(pageStats);
    const f = (n) => n.toFixed(2);
    console.log([name, f((b.renderer.cpu - a.renderer.cpu) / s), f((b.gpu.cpu - a.gpu.cpu) / s), b.renderer.mb.toFixed(0), b.gpu.mb.toFixed(0), st.backdrop, st.filtered, st.canvasMb.toFixed(1), `${st.imgMb.toFixed(1)} (${st.shownMb.toFixed(1)})`, st.anims].join("\t"));
  }
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
})();

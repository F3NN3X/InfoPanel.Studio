#!/usr/bin/env node
// Measures a page's idle cost in a headed Chromium: renderer and GPU process CPU (Windows), and with
// `trace`, a 3 s devtools trace of frames, paints and the style/layout invalidations behind them.
//   PW_CORE=<path to playwright-core> CHROME=<chrome.exe> node tools/perf/studio-cpu.cjs <url> [cpu|trace] [seconds=15]
// Never point it at the live server: start a scratch one on a copy of the data (docs/desktop/webview-performance.md).
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require(process.env.PW_CORE || "playwright-core");

const [url, mode = "cpu", seconds = "15"] = process.argv.slice(2);
if (!url) throw new Error("usage: studio-cpu.cjs <url> [cpu|trace] [seconds]");
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "studio-cpu-"));

/** CPU seconds of this run's renderer and GPU processes, found by the profile folder in their command line. */
function cpu() {
  const tag = path.basename(profile);
  const ps = `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | ? { $_.CommandLine -like '*${tag}*' } | % { $p = Get-Process -Id $_.ProcessId -EA 0; $t = if ($_.CommandLine -match '--type=([a-z-]+)') { $matches[1] } else { 'browser' }; '{0} {1}' -f $t, $p.CPU }`;
  const out = { renderer: 0, gpu: 0 };
  for (const line of execFileSync("powershell", ["-NoProfile", "-Command", ps]).toString().trim().split(/\r?\n/)) {
    const [type, value] = line.split(" ");
    if (type === "renderer") out.renderer += Number(value);
    if (type === "gpu-process") out.gpu += Number(value);
  }
  return out;
}

(async () => {
  const ctx = await chromium.launchPersistentContext(profile, { headless: false, executablePath: process.env.CHROME, viewport: { width: 1440, height: 860 } });
  const page = ctx.pages()[0] || (await ctx.newPage());
  await page.goto(url);
  await page.waitForTimeout(6000);
  if (mode === "trace") {
    const cdp = await ctx.newCDPSession(page);
    const events = [];
    cdp.on("Tracing.dataCollected", (d) => events.push(...d.value));
    await cdp.send("Tracing.start", { categories: "devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-devtools.timeline.invalidationTracking,cc", transferMode: "ReportEvents" });
    await page.waitForTimeout(3000);
    await new Promise((done) => { cdp.once("Tracing.tracingComplete", done); cdp.send("Tracing.end"); });
    const count = {};
    const why = {};
    for (const e of events) {
      count[e.name] = (count[e.name] || 0) + 1;
      if (/InvalidationTracking/.test(e.name)) {
        const d = e.args?.data || {};
        const key = `${e.name.replace("InvalidationTracking", "")} ${d.nodeName || ""} ${d.reason || ""}`.slice(0, 110);
        why[key] = (why[key] || 0) + 1;
      }
    }
    console.log(["BeginMainFrame", "FireAnimationFrame", "UpdateLayoutTree", "Layout", "Paint", "RasterTask"].map((k) => `${k}=${count[k] || 0}`).join(" "), "(per 3 s)");
    for (const [k, v] of Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(String(v).padStart(7), k);
  } else {
    const s = Number(seconds);
    const a = cpu();
    await page.waitForTimeout(s * 1000);
    const b = cpu();
    console.log(`renderer ${((b.renderer - a.renderer) / s).toFixed(2)} cores, gpu ${((b.gpu - a.gpu) / s).toFixed(2)} cores over ${s} s`);
  }
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
})();

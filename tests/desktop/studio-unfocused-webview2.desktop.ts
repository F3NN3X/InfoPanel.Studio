import { type ChildProcess, spawn } from "node:child_process";
import { test } from "@playwright/test";
import { appTree, processes } from "../../tools/perf/process-sampler.mjs";
import { openDesign, RAF_INIT, summarize, writeResult } from "../perf/measure";
import { prepareApp } from "./app";

// The visible, unfocused studio in the real WebView2 (docs/desktop/webview-performance.md, "Overnight check" in
// short): the debug build's Design view on the heavy profile, then a small window of our own takes the focus without
// covering the studio, and the app's tree is sampled every minute for PERF_SAMPLER_MS (30 min by default): WebView2
// renderer, GPU and the rest in cores and private MB, and the page's rAF callbacks a second.

const DURATION_MS = Number(process.env.PERF_SAMPLER_MS) || 30 * 60_000;
const EVERY_MS = Number(process.env.PERF_SAMPLER_EVERY_MS) || 60_000;

/** A small, activated window in the screen's corner: the studio stays visible but loses focus. */
function takeFocus(): ChildProcess {
  const script = [
    "Add-Type -AssemblyName System.Windows.Forms",
    "$f = New-Object Windows.Forms.Form",
    "$f.Text = 'perf: focus elsewhere'",
    "$f.StartPosition = 'Manual'",
    "$f.Location = New-Object Drawing.Point(0, 0)",
    "$f.Size = New-Object Drawing.Size(240, 120)",
    "$f.Add_Shown({ $f.Activate() })",
    "[Windows.Forms.Application]::Run($f)",
  ].join("; ");
  return spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { stdio: "ignore" });
}

function byRole(): Record<string, { cpu: number; mb: number }> {
  const out: Record<string, { cpu: number; mb: number }> = {};
  for (const p of appTree(processes())) {
    const r = (out[p.role] ??= { cpu: 0, mb: 0 });
    r.cpu += p.cpu100ns / 1e7;
    r.mb += p.bytes / 1048576;
  }
  return out;
}

test("studio-unfocused-webview2", async () => {
  test.setTimeout(DURATION_MS + 5 * 60_000);
  const app = await prepareApp();
  let focus: ChildProcess | undefined;
  try {
    app.launch();
    const { browser, page } = await app.studio(60_000);
    // Phase 2's throttle on the live studio: not the default's frozen preview after a minute unfocused.
    await page.evaluate(() => localStorage.setItem("studio.previewData", "live"));
    await page.reload();
    await page.evaluate(RAF_INIT);
    await openDesign({ page });
    await page.waitForTimeout(5000);
    focus = takeFocus();
    await page.waitForTimeout(3000);
    const hasFocus = await page.evaluate(() => document.hasFocus());
    const samples: Record<string, number>[] = [];
    let prev = byRole();
    let prevRaf = await page.evaluate(() => (window as unknown as { __raf: { callbacks: number } }).__raf.callbacks);
    let prevAt = Date.now();
    for (let at = EVERY_MS; at <= DURATION_MS; at += EVERY_MS) {
      await page.waitForTimeout(EVERY_MS);
      const now = byRole();
      const raf = await page.evaluate(() => (window as unknown as { __raf: { callbacks: number } }).__raf.callbacks);
      const s = (Date.now() - prevAt) / 1000;
      const row: Record<string, number> = { minute: at / 60_000, rafPerS: (raf - prevRaf) / s };
      for (const [role, v] of Object.entries(now)) {
        row[`${role}Cores`] = (v.cpu - (prev[role]?.cpu ?? 0)) / s;
        row[`${role}MB`] = v.mb;
      }
      samples.push(row);
      [prev, prevRaf, prevAt] = [now, raf, Date.now()];
    }
    await browser.close().catch(() => {});
    const first = samples[0];
    const last = samples[samples.length - 1];
    const hours = (last.minute - first.minute) / 60 || 1;
    const growth = Object.fromEntries(Object.keys(last).filter((k) => k.endsWith("MB")).map((k) => [k.replace(/MB$/, "MBPerHour"), (last[k] - (first[k] ?? 0)) / hours]));
    writeResult("studio-unfocused-webview2", { durationMs: DURATION_MS, studioHadFocus: hasFocus, cases: { unfocused: summarize(samples.slice(1)) }, growth, samples });
  } finally {
    focus?.kill();
    app.stop();
  }
});

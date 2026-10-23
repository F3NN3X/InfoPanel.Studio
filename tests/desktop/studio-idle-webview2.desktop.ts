import { test } from "@playwright/test";
import { appTree, processes } from "../../tools/perf/process-sampler.mjs";
import { measureIdle, openDesign, RAF_INIT, REPEATS, type Sample, summarize, WARMUP_MS, WINDOW_MS, writeResult } from "../perf/measure";
import { prepareApp } from "./app";

// studio-idle in the real WebView2: the desktop debug build's Design view on the heavy profile, the page metrics of
// tests/perf/measure.ts plus the WebView2 renderer and GPU processes' CPU (cores) over the same window.

/** CPU seconds per WebView2 role of the app's tree. */
function cpuByRole(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of appTree(processes())) out[p.role] = (out[p.role] ?? 0) + p.cpu100ns / 1e7;
  return out;
}

test("studio-idle-webview2", async () => {
  test.setTimeout(10 * 60_000);
  const app = await prepareApp();
  try {
    app.launch();
    const { browser, page } = await app.studio(60_000);
    await page.evaluate(RAF_INIT);
    await openDesign({ page });
    const cdp = await page.context().newCDPSession(page);
    await page.waitForTimeout(WARMUP_MS);
    const samples: Sample[] = [];
    for (let i = 0; i < REPEATS; i++) {
      const before = cpuByRole();
      const t0 = Date.now();
      const sample = await measureIdle(page, cdp);
      const after = cpuByRole();
      const s = (Date.now() - t0) / 1000;
      const cores = (role: string) => ((after[role] ?? 0) - (before[role] ?? 0)) / s;
      samples.push({ ...sample, rendererCores: cores("renderer"), gpuCores: cores("gpu"), appCores: cores("app"), sidecarCores: cores("sidecar") });
    }
    await browser.close().catch(() => {});
    writeResult("studio-idle-webview2", { windowMs: WINDOW_MS, cases: { design: summarize(samples) } });
  } finally {
    app.stop();
  }
});

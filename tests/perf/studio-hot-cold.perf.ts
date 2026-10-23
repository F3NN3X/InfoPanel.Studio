import type { CDPSession, Page } from "@playwright/test";
import { manifest, test } from "../e2e/fixtures";
import type { TickerStats } from "../../src/lib/ticker";
import { measureIdle, openDesign, openMeasured, REPEATS, STUDIO_READY, type Sample, summarize, WARMUP_MS, writeResult } from "./measure";

type Win = { __rafStacks: boolean; __raf: { callers: Record<string, number> }; __tickerStats?: () => TickerStats };
interface Probe {
  raf: Record<string, number>;
  ticker: TickerStats | null;
}

// docs/desktop/webview-performance.md, "Hot and cold": the Design view on first load ("hot"), then after
// Design → Help → Screens → Design ("cold"), on the heavy profile and on the visualisers'. Help opens in its own window (in the
// desktop app too); the studio's window is minimized meanwhile, as a window behind Help is occluded and hidden on
// Windows, so the round trip hides the studio and brings it back. Each state records the rAF callers, the ticker's
// subscribers (with a stats build: npm run build:stats, then DASHBOARD_DIST=.cache/dist-stats) and whether the
// visualiser's canvas still moves.

const PROFILES = { heavy: manifest.profiles.heavy, viz: manifest.profiles.viz };

/** 2 s of rAF callers, and the ticker's subscribers over the same span when the build has the debug stats. */
async function probe(page: Page): Promise<Probe> {
  await page.evaluate(() => {
    const w = window as unknown as Win;
    w.__raf.callers = {};
    w.__rafStacks = true;
    w.__tickerStats?.();
  });
  await page.waitForTimeout(2000);
  return page.evaluate(() => {
    const w = window as unknown as Win;
    w.__rafStacks = false;
    return { raf: w.__raf.callers, ticker: w.__tickerStats?.() ?? null };
  });
}

/** 1 when the zone's first canvas draws something different 500 ms later, 0 when it holds, NaN without one. */
async function canvasMoves(page: Page, zone: string): Promise<number> {
  const canvas = page.locator(`[data-zone-id="${zone}"] canvas`).first();
  if ((await canvas.count()) === 0) return Number.NaN;
  const shot = () => canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const a = await shot();
  await page.waitForTimeout(500);
  return a === (await shot()) ? 0 : 1;
}

async function setWindow(cdp: CDPSession, windowState: "minimized" | "normal"): Promise<void> {
  const { windowId } = (await cdp.send("Browser.getWindowForTarget")) as { windowId: number };
  await cdp.send("Browser.setWindowBounds", { windowId, bounds: { windowState } });
}

/**
 * Hide the studio while Help is up: minimize its window, and where Playwright's Chromium keeps a minimized page
 * visible (it does), report the page hidden the way the browser would (visibilityState, hidden, visibilitychange).
 * Returns how it was hidden.
 */
async function hideStudio(page: Page, cdp: CDPSession): Promise<"window" | "emulated"> {
  await setWindow(cdp, "minimized");
  await page.waitForTimeout(300);
  if ((await page.evaluate(() => document.visibilityState)) === "hidden") return "window";
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  return "emulated";
}

async function showStudio(page: Page, cdp: CDPSession): Promise<void> {
  await setWindow(cdp, "normal");
  await page.evaluate(() => {
    const doc = document as unknown as Record<string, unknown>;
    if (!Object.hasOwn(doc, "visibilityState")) return;
    delete doc.visibilityState;
    delete doc.hidden;
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

for (const [name, profile] of Object.entries(PROFILES)) {
  test(`studio-hot-cold ${name}`, async ({ browser, scratch }, info) => {
    const viewport = info.project.use.viewport ?? { width: 1440, height: 860 };
    const vizZone = name === "viz" ? manifest.zones.viz[1] : null;
    const hot: Sample[] = [];
    const cold: Sample[] = [];
    const probes: { hot: Probe; cold: Probe }[] = [];
    for (let i = 0; i < REPEATS; i++) {
      const run = await openMeasured(browser, `${scratch.base}/?studio=1&profile=${profile}`, STUDIO_READY, viewport);
      const { page, cdp } = run;
      try {
        await openDesign(run);
        await page.waitForTimeout(WARMUP_MS);
        hot.push({ ...(await measureIdle(page, cdp)), ...(vizZone ? { vizMoves: await canvasMoves(page, vizZone) } : {}) });
        const hotProbe = await probe(page);

        const [help] = await Promise.all([page.waitForEvent("popup"), page.locator('[aria-label="Help"]').click()]);
        const hiddenBy = await hideStudio(page, cdp);
        await help.waitForLoadState();
        await help.waitForTimeout(2000);
        const hidden = await page.evaluate(() => document.visibilityState);
        await help.close();
        await showStudio(page, cdp);
        await page.bringToFront();
        // Help no longer leaves Design (it opens a window), so a hop through Screens remounts the canvas.
        await page.locator('[aria-label="Screens"]').click();
        await page.locator(STUDIO_READY).click();
        await page.locator("[data-zone-id]").first().waitFor();
        await page.waitForTimeout(WARMUP_MS);
        cold.push({
          ...(await measureIdle(page, cdp)),
          ...(vizZone ? { vizMoves: await canvasMoves(page, vizZone) } : {}),
          studioHiddenDuringHelp: hidden === "hidden" ? 1 : 0,
          hiddenByEmulation: hiddenBy === "emulated" ? 1 : 0,
        });
        probes.push({ hot: hotProbe, cold: await probe(page) });
      } finally {
        await run.context.close();
      }
    }
    writeResult(name === "heavy" ? "studio-hot-cold" : `studio-hot-cold-${name}`, { profile, cases: { hot: summarize(hot), cold: summarize(cold) }, probes });
  });
}

import type { Page } from "@playwright/test";
import { expect, test } from "../e2e/fixtures";
import { measureIdle, openDesign, openMeasured, STUDIO_READY, summarize, writeResult } from "./measure";

// The unfocused studio (src/lib/studio-focus.ts): Design view on the heavy profile, the window blurred (focus
// emulation keeps the page from taking real focus back, then a blur event), 65 s for the 60 s delay, then an idle
// window: at most 6 rAF callbacks a second. Focus back must restore the frame rate within a second.

const UNFOCUSED_WAIT_MS = Number(process.env.PERF_UNFOCUSED_WAIT_MS) || 65_000;

const rafCount = (page: Page) => page.evaluate(() => (window as unknown as { __raf: { callbacks: number } }).__raf.callbacks);

test("studio-unfocused", async ({ browser, scratch }, info) => {
  test.setTimeout(UNFOCUSED_WAIT_MS + 120_000);
  const viewport = info.project.use.viewport ?? { width: 1440, height: 860 };
  const run = await openMeasured(browser, `${scratch.base}/?studio=1`, STUDIO_READY, viewport);
  const { page, cdp } = run;
  try {
    await openDesign(run);
    await page.waitForTimeout(3000);
    const focused = await measureIdle(page, cdp, 5000);

    await cdp.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.waitForTimeout(UNFOCUSED_WAIT_MS);
    const unfocused = await measureIdle(page, cdp);

    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    const before = await rafCount(page);
    await page.waitForTimeout(1000);
    const refocusedRafPerS = (await rafCount(page)) - before;

    writeResult("studio-unfocused", { cases: { focused: summarize([focused]), unfocused: summarize([unfocused]), refocused: summarize([{ rafPerS: refocusedRafPerS }]) } });
    expect(unfocused.rafPerS).toBeLessThanOrEqual(6);
    // Back to the focused rate (the heavy profile's weather runs at 30 fps).
    expect(refocusedRafPerS).toBeGreaterThanOrEqual(Math.min(20, focused.rafPerS * 0.6));
  } finally {
    await run.context.close();
  }
});

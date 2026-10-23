import { test } from "../e2e/fixtures";
import { measureIdle, openDesign, openMeasured, REPEATS, STUDIO_READY, type Sample, summarize, WARMUP_MS, writeResult } from "./measure";

// docs/desktop/webview-performance.md, open item 3: the Design view on first load ("hot"), then after
// Design → Help → Design ("cold"). Help opens in its own tab (its own window in the desktop app), so the round trip
// hides the studio tab and brings it back. Each state records the rAF callers too.

test("studio-hot-cold", async ({ browser, scratch }, info) => {
  const viewport = info.project.use.viewport ?? { width: 1440, height: 860 };
  const hot: Sample[] = [];
  const cold: Sample[] = [];
  const callers: { hot: Record<string, number>; cold: Record<string, number> }[] = [];
  for (let i = 0; i < REPEATS; i++) {
    const run = await openMeasured(browser, `${scratch.base}/?studio=1`, STUDIO_READY, viewport);
    const { page } = run;
    const rafCallers = async (): Promise<Record<string, number>> => {
      await page.evaluate(() => {
        const w = window as unknown as { __rafStacks: boolean; __raf: { callers: Record<string, number> } };
        w.__raf.callers = {};
        w.__rafStacks = true;
      });
      await page.waitForTimeout(2000);
      return page.evaluate(() => {
        const w = window as unknown as { __rafStacks: boolean; __raf: { callers: Record<string, number> } };
        w.__rafStacks = false;
        return w.__raf.callers;
      });
    };
    try {
      await openDesign(run);
      await page.waitForTimeout(WARMUP_MS);
      hot.push(await measureIdle(page, run.cdp));
      const hotCallers = await rafCallers();

      const [help] = await Promise.all([page.waitForEvent("popup"), page.locator('[aria-label="Help"]').click()]);
      await help.bringToFront();
      await help.waitForLoadState();
      await help.waitForTimeout(2000);
      const hidden = await page.evaluate(() => document.visibilityState);
      await help.close();
      await page.bringToFront();
      await page.locator(STUDIO_READY).click();
      await page.locator("[data-zone-id]").first().waitFor();
      await page.waitForTimeout(WARMUP_MS);
      cold.push({ ...(await measureIdle(page, run.cdp)), studioHiddenDuringHelp: hidden === "hidden" ? 1 : 0 });
      callers.push({ hot: hotCallers, cold: await rafCallers() });
    } finally {
      await run.context.close();
    }
  }
  writeResult("studio-hot-cold", { cases: { hot: summarize(hot), cold: summarize(cold) }, rafCallers: callers });
});

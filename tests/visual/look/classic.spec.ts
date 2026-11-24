import { startScratch, type Scratch } from "../../../tools/perf/scratch.mjs";
import { expect, test } from "@playwright/test";

// The Classic look (today's default skin) on the Widget QA page: every widget kind at 1x1, 2x2, 4x2 and 4x4, once per
// material, as one image per kind and material (its four frames side by side) in tests/visual/look/baselines/. Windows
// only and outside CI (_docs/TESTING.md, "The look baselines"): the pixels are those of this machine's text rendering.
// Refresh with `npx playwright test --project=look-visual --update-snapshots` after `npm run build`, and say why.
const MATERIALS = ["glass", "matte-light"] as const;
const SPANS = "1x1,2x2,4x2,4x4";
// A small cell keeps the committed images under about 5 MB; the frames are still the exact spans.
const CELL = "cell=64&gap=6";

let qa: Scratch;
test.beforeAll(async () => {
  qa = await startScratch({ env: { DASHBOARD_DEBUG: "1" } });
});
test.afterAll(() => qa.stop());

for (const material of MATERIALS) {
  test(`every widget kind on ${material}`, async ({ page }) => {
    test.setTimeout(180_000);
    // A fixed clock and zone: reset times and clocks on the fixtures are "now plus".
    await page.clock.setFixedTime(new Date("2026-01-15T12:00:00Z"));
    await page.setViewportSize({ width: 1800, height: 1000 });
    // below=1: the sizes under a widget's minimum stay in its row as placeholders, as the baselines have them.
    await page.goto(`${qa.base}/?widget-qa&spans=${SPANS}&${CELL}&eager=1&surface=${material}&below=1`);
    // The sticky toolbar and the captions would be in the shots; the frames are what is compared.
    await page.addStyleTag({ content: "main > header, figcaption { display: none !important; }" });
    await page.waitForFunction(() => window.__qaMountAll);
    // An unsettled page would be compared half-built (ledger L50).
    expect(await page.evaluate(() => window.__qaMountAll?.())).toBe(true);
    const ids = await page.$$eval("section[id]", (all) => all.map((s) => s.id));
    expect(ids.length).toBeGreaterThan(60);
    for (const id of ids) {
      // The row of span frames: the parent of the first figure.
      const row = page.locator(`section[id="${id}"] [data-qa-span]`).first().locator("..");
      await expect.soft(row, id).toHaveScreenshot(`${material}/${id}.png`);
    }
  });
}

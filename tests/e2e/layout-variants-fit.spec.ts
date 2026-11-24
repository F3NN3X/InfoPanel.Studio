import { PACK_STYLES } from "../../tools/qa/pack-styles.mjs";
import { startScratch, type Scratch } from "../../tools/perf/scratch.mjs";
import { expect, test } from "./fixtures";

// A layout variant a Look names (src/widgets/layouts.ts) stays inside its card at the spans a screen gives it, with the
// fixtures of `?widget-qa&data=fixtures`, at the cell sizes from a short wide screen to a tall one: nothing pokes out,
// overlaps or is cut off by overflow (the probe's three kinds, `window.__qaOverflow`). System Overview's power draw drops
// its ruler rows by what fits, so the temperatures under them and the card's edge are never drawn over.

// The QA page is served in debug mode only, so these run on their own scratch server with DASHBOARD_DEBUG=1.
test.describe.configure({ mode: "parallel" });

let qa: Scratch;
test.beforeAll(async () => {
  qa = await startScratch({ env: { DASHBOARD_DEBUG: "1" } });
});
test.afterAll(() => qa.stop());

const SPANS = "2x1,3x1,4x1,2x2,3x2,4x2,2x3,4x3,4x4";

for (const cell of [90, 110, 140, 160]) {
  test(`System Overview's power draw fits under Cyberspec at cell ${cell}`, async ({ page }) => {
    const settings = encodeURIComponent(JSON.stringify(PACK_STYLES.cyberspec));
    await page.goto(`${qa.base}/?widget-qa&data=fixtures&module=SystemOverview&spans=${SPANS}&cell=${cell}&eager=1&settings=${settings}`);
    await page.waitForSelector("figure[data-qa-module] [data-qa-box] *");
    await page.evaluate(() => window.__qaMountAll?.());
    // the layout drew, at every span but one too small for it (where the card shows its compact reading)
    await page.waitForSelector("[data-qa-box] [data-layout=power]");
    expect(await page.locator("[data-qa-box] [data-layout=power]").count()).toBeGreaterThanOrEqual(8);
    const report = await page.evaluate(() => window.__qaOverflow?.() ?? []);
    expect(report.length).toBe(9);
    expect(report.filter((r) => r.issues.length).map((r) => ({ span: r.span, issues: r.issues }))).toEqual([]);
  });
}

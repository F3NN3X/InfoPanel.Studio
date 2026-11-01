import { startScratch, type Scratch } from "../../tools/perf/scratch.mjs";
import { expect, test } from "./fixtures";

// The QA page is the testing and reference page for every widget, so every widget on it draws content from the fixture
// data (and the demo streams and settings): a frame with nothing in it, or an empty state (`Empty`, marked
// `data-wp-empty` inside the QA frames), fails. tests/widgets/widget-qa/plan.test.ts holds the page to the whole
// registry; this holds each widget on it to drawing something. 2x2 and 4x4 between them fit every widget's minimum.

// The QA page is served in debug mode only, so this runs on its own scratch server with DASHBOARD_DEBUG=1.
let qa: Scratch;
test.beforeAll(async () => {
  qa = await startScratch({ env: { DASHBOARD_DEBUG: "1" } });
});
test.afterAll(() => qa.stop());

test("every widget on the QA page draws content on fixture data", async ({ page }) => {
  await page.goto(`${qa.base}/?widget-qa&eager=1&spans=2x2,4x4`);
  await page.waitForSelector("figure[data-qa-module] [data-qa-box] *");
  await page.evaluate(() => window.__qaMountAll?.());
  const sections = await page.$$eval("section[id]", (all) => all.map((s) => s.id));
  const frames = await page.$$eval("figure[data-qa-module]", (figs) =>
    figs.map((f) => {
      const box = f.querySelector("[data-qa-box]");
      return { module: f.getAttribute("data-qa-module") ?? "", span: f.getAttribute("data-qa-span") ?? "", empty: !box || box.childElementCount === 0, emptyState: !!box?.querySelector("[data-wp-empty]") };
    })
  );
  expect(sections.length).toBeGreaterThan(60);
  // Every widget has at least one span at or over its minimum.
  expect(sections.filter((id) => !frames.some((f) => f.module === id))).toEqual([]);
  expect(frames.filter((f) => f.empty).map((f) => `${f.module} ${f.span}`)).toEqual([]);
  expect(frames.filter((f) => f.emptyState).map((f) => `${f.module} ${f.span}`)).toEqual([]);
});

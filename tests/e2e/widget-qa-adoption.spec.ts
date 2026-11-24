import { startScratch, type Scratch } from "../../tools/perf/scratch.mjs";
import { expect, test } from "./fixtures";

// The theme-adoption check (src/widgets/widget-qa/adoption.ts) on the Widget QA page under Cyberspec Crimson, worn as a screen
// wears it: the page rail's items are chrome (no pack frame, band, tab or card edge on a slot widget, the device status included),
// and the mixers draw in the Look's colours, fonts and shapes. tools/qa/adoption.mjs prints the same report for every widget.

// The QA page is served in debug mode only, so this runs on its own scratch server with DASHBOARD_DEBUG=1.
let qa: Scratch;
test.beforeAll(async () => {
  qa = await startScratch({ env: { DASHBOARD_DEBUG: "1" } });
});
test.afterAll(() => qa.stop());

const WORN = "look=cyberspec&lookVariant=crimson";
type Report = { frame: string; flags: { kind: string; prop: string; value: string; at: string }[] }[];
const report = (page: import("@playwright/test").Page, only = ""): Promise<Report> => page.evaluate((o) => window.__qaAdoption!(o).report, only);
const flagsOf = (r: Report, frame: (name: string) => boolean) => r.filter((x) => frame(x.frame)).flatMap((x) => x.flags.map((f) => `${x.frame}: ${f.kind} ${f.prop} ${f.value} at ${f.at}`));

test("the page rail's items wear no pack frame or card edge, and every slot kind and rail widget is drawn", async ({ page }) => {
  test.setTimeout(90_000);
  // no widget frame fits a 9x9 span's placeholder: the page draws the surfaces, the views and the layouts
  await page.goto(`${qa.base}/?widget-qa&${WORN}&spans=9x9&eager=1`);
  await page.waitForFunction(() => window.__qaMountAll && window.__qaAdoption);
  await page.evaluate(() => window.__qaMountAll!());
  const rail = page.locator('[data-qa-surface="rail"]');
  await expect(rail.locator('[data-wp-tier][data-look="cyberspec"]').first()).toBeAttached({ timeout: 15_000 });
  await expect(rail.locator('[data-rail-slot^="widget:DeviceBatteries"]').first()).toBeAttached();
  for (const kind of ["page:", "action:", "widget:", "logo"]) await expect(rail.locator(`[data-rail-slot^="${kind}"]`).first()).toBeAttached();
  expect(await rail.locator("[data-rail-slot] [data-pack-decor]").count()).toBe(0);
  const rails = await report(page, "surface:rail");
  expect(rails.map((r) => r.frame)).toEqual(["surface:rail", "surface:rail-kiosk"]);
  expect(flagsOf(rails, () => true).filter((f) => f.includes(": frame "))).toEqual([]);
});

test("the mixers draw in the Look's colours and fonts under a pack", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto(`${qa.base}/?widget-qa&${WORN}&module=StreamMixer,VolumeMixer,WaveLink&spans=2x2,4x2&eager=1`);
  await page.waitForFunction(() => window.__qaMountAll && window.__qaAdoption);
  await page.evaluate(() => window.__qaMountAll!());
  await expect(page.locator('[data-wp-tier][data-look="cyberspec"]').first()).toBeAttached({ timeout: 15_000 });
  // the frames check themselves once they settle; the report reads them all again
  await page.waitForTimeout(2000);
  const r = await report(page);
  expect(r.length).toBeGreaterThan(6);
  expect(flagsOf(r, () => true)).toEqual([]);
  // the strips' fader caps take the Look's square knob
  const thumb = page.locator('figure[data-qa-view="strips"][data-qa-view-of="StreamMixer"] [data-slot="fader-thumb"]').first();
  await expect(thumb).toBeAttached();
  expect(await thumb.evaluate((el) => getComputedStyle(el).borderRadius)).toBe("0px");
});

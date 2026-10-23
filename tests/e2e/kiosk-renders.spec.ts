import { expect, manifest, test, watchErrors } from "./fixtures";

// The heavy profile renders every zone, with no console errors or failed requests, and the gauge canvas draws its
// centre icon's SVG paths (src/lib/infopanel/gauges/icon-markup.ts; guards the react-dom/server removal).

test("the heavy kiosk renders every zone cleanly", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  await page.goto(`${scratch.base}/?kiosk=1&profile=${manifest.profiles.heavy}`);
  const zones = page.locator(manifest.kioskZoneSelector);
  await expect(zones).toHaveCount(manifest.zones.heavy.length);
  for (const zone of await zones.all()) await expect(zone).toBeVisible();

  // The canvas zone is last in placement order; its gauge icon is a <g> of lucide strokes with real paths.
  const gauge = zones.nth(manifest.zones.heavy.indexOf(manifest.gaugeIconZone));
  const iconShapes = gauge.locator('g[style*="stroke-linecap:round"] > :is(path, rect, circle, line, polyline)');
  await expect(iconShapes.first()).toBeAttached();
  expect(await iconShapes.count()).toBeGreaterThan(1);

  // Live values arrive from the fake Data API, then the page has a moment to settle.
  await page.waitForTimeout(2000);
  expect(errors).toEqual([]);
});

test("the light kiosk renders every zone cleanly", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  await page.goto(`${scratch.base}/?kiosk=1&profile=${manifest.profiles.light}`);
  await expect(page.locator(manifest.kioskZoneSelector)).toHaveCount(manifest.zones.light.length);
  await page.waitForTimeout(1500);
  expect(errors).toEqual([]);
});

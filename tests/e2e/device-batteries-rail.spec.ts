import fs from "node:fs";
import { expect, saveConfig, settled, test, watchErrors } from "./fixtures";

// Device Batteries in a pinned page rail (#365): the "three devices" preset draws a row per device in the rail's 72 px
// slot, its kind icon, charge and a charge bar, from the dashboard server's own stream (/events/devices). The scratch
// server polls no devices, so the stream is answered with the widget fixtures' two devices.

const W = 1024;
const H = 600;
const zone = { id: "a", module: "Clock", colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 2, visible: true };
const config = (settings: Record<string, unknown>) => ({
  version: 21,
  activeProfile: "desk",
  profiles: [
    {
      id: "desk",
      name: "Desk",
      width: W,
      height: H,
      cols: 2,
      rows: 2,
      fit: "fill",
      padding: 12,
      gap: 12,
      pages: [{ id: "one", name: "One", placements: [zone] }],
      pinned: {
        items: [
          {
            id: "rail",
            edge: "left",
            mode: "room",
            thickness: 84,
            show: "all",
            visible: true,
            placement: { id: "rail-w", module: "PageRail" },
            rail: [{ id: "bat", group: "widgets", target: { kind: "widget", module: "DeviceBatteries", settings } }],
          },
        ],
      },
    },
  ],
});

/** The fixtures' battery keys (a mouse charging at 93 %, a keyboard asleep and low at 12 %), as one stream event. */
const batteries = () => {
  const { sensors } = JSON.parse(fs.readFileSync("src/widgets/__fixtures__/extra.json", "utf8")) as { sensors: Record<string, unknown> };
  return Object.fromEntries(Object.entries(sensors).filter(([k]) => k.startsWith("battery.")));
};

test("the rail's battery item draws each device's icon, charge and bar from the server's devices stream", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  await page.route("**/events/devices*", (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body: `data: ${JSON.stringify({ timestamp: 1, sensors: batteries() })}\n\n`,
    })
  );
  expect((await saveConfig(scratch.base, { ...config({ view: "list", compact: "full" }), dataApiUrl: scratch.dataApi })).status).toBe(200);
  await page.setViewportSize({ width: W, height: H });
  await page.goto(`${scratch.base}/?kiosk=1&profile=desk`);
  await settled(page, "[data-page-grid] > *, [data-pinned-item] [data-device]");

  const rail = page.locator('[data-pinned-item="rail"]');
  const rows = rail.locator("[data-device]");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("93%");
  await expect(rows.nth(1)).toContainText("12%");
  await expect(rail.locator('[data-part="charge-bar"]')).toHaveCount(2);
  // the rows fit the slot: nothing past the rail's width
  const railBox = (await rail.boundingBox())!;
  for (const row of await rows.all()) {
    const r = (await row.boundingBox())!;
    expect(r.x + r.width).toBeLessThanOrEqual(railBox.x + railBox.width);
  }
  expect(errors).toEqual([]);
});

test("the one-device rail item stacks the picked device's glyph and charge inside the slot", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  await page.route("**/events/devices*", (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body: `data: ${JSON.stringify({ timestamp: 1, sensors: batteries() })}

`,
    })
  );
  expect((await saveConfig(scratch.base, { ...config({ view: "single", compact: "full", singleDevice: "2078156601" }), dataApiUrl: scratch.dataApi })).status).toBe(200);
  await page.setViewportSize({ width: W, height: H });
  await page.goto(`${scratch.base}/?kiosk=1&profile=desk`);
  await settled(page, "[data-page-grid] > *, [data-pinned-item] [data-device]");

  const rail = page.locator('[data-pinned-item="rail"]');
  const one = rail.locator("[data-device]");
  await expect(one).toHaveCount(1);
  await expect(one).toContainText("12%");
  await expect(rail.locator('[data-part="charge-bar"]')).toHaveCount(1);
  // it fits the slot: inside the rail on both axes, nothing clipped
  const railBox = (await rail.boundingBox())!;
  const r = (await one.boundingBox())!;
  expect(r.x + r.width).toBeLessThanOrEqual(railBox.x + railBox.width);
  expect(r.y + r.height).toBeLessThanOrEqual(railBox.y + railBox.height);
  expect(await one.evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  // the stack: the kind icon above the glyph above the charge, each inside the slot
  const icon = (await one.locator('[data-part="icon"]').first().boundingBox())!;
  const glyph = (await one.locator('[data-part="battery-glyph"]').boundingBox())!;
  const pct = (await one.locator('[data-part="num"]').boundingBox())!;
  expect(icon.y + icon.height).toBeLessThanOrEqual(glyph.y + 1);
  expect(glyph.y + glyph.height).toBeLessThanOrEqual(pct.y + 1);
  for (const part of [icon, glyph, pct]) {
    expect(part.x).toBeGreaterThanOrEqual(railBox.x);
    expect(part.x + part.width).toBeLessThanOrEqual(railBox.x + railBox.width);
    expect(part.y + part.height).toBeLessThanOrEqual(railBox.y + railBox.height);
  }
  expect(errors).toEqual([]);
});

// A 1x1 zone on a wide, short grid (1920 x 550, 12 x 9 with a 6 px gap and padding: about 154 x 54 px, a strip): the
// device on one line, not the summary card.
const wide = (settings: Record<string, unknown>, span = { colSpan: 1, rowSpan: 1 }) => ({
  version: 21,
  activeProfile: "wide",
  profiles: [
    {
      id: "wide",
      name: "Wide",
      width: 1920,
      height: 550,
      cols: 12,
      rows: 9,
      fit: "fill",
      padding: 6,
      gap: 6,
      pages: [{ id: "one", name: "One", placements: [{ id: "a", module: "DeviceBatteries", colStart: 1, rowStart: 1, ...span, visible: true, settings }] }],
    },
  ],
});

test("a 1x1 zone on a wide, short row draws the device on one line and nothing overflows", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  await page.route("**/events/devices*", (route) =>
    route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream", "cache-control": "no-cache" },
      body: `data: ${JSON.stringify({ timestamp: 1, sensors: batteries() })}\n\n`,
    })
  );
  expect((await saveConfig(scratch.base, { ...wide({ view: "list" }), dataApiUrl: scratch.dataApi })).status).toBe(200);
  await page.setViewportSize({ width: 1920, height: 550 });
  await page.goto(`${scratch.base}/?kiosk=1&profile=wide`);
  await settled(page, "[data-page-grid] > *, [data-device]");

  const zone = page.locator("[data-page-grid] > *").first();
  const one = zone.locator("[data-device]");
  await expect(one).toHaveCount(1);
  await expect(one).toContainText("12%");
  const z = (await zone.boundingBox())!;
  expect(z.height).toBeLessThan(90);
  const glyph = (await one.locator('[data-part="battery-glyph"]').boundingBox())!;
  const pct = (await one.locator('[data-part="num"]').boundingBox())!;
  // one line: the glyph's box and the charge's overlap vertically, the glyph first
  expect(glyph.y).toBeLessThan(pct.y + pct.height);
  expect(pct.y).toBeLessThan(glyph.y + glyph.height);
  expect(glyph.x + glyph.width).toBeLessThanOrEqual(pct.x + 1);
  for (const part of [glyph, pct, (await one.locator('[data-part="icon"]').first().boundingBox())!]) {
    expect(part.x).toBeGreaterThanOrEqual(z.x);
    expect(part.x + part.width).toBeLessThanOrEqual(z.x + z.width);
    expect(part.y).toBeGreaterThanOrEqual(z.y);
    expect(part.y + part.height).toBeLessThanOrEqual(z.y + z.height);
  }
  expect(await one.evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && el.scrollHeight <= el.clientHeight + 1)).toBe(true);
  expect(errors).toEqual([]);
});

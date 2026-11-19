import fs from "node:fs";
import { expect, saveConfig, settled, test, watchErrors } from "./fixtures";

// Device Batteries in a pinned page rail (#365): the "three devices" preset draws a row per device in the rail's 72 px
// slot, its kind icon, charge and a charge bar, from the dashboard server's own stream (/events/devices). The scratch
// server polls no devices, so the stream is answered with the widget fixtures' two devices.

const W = 1024;
const H = 600;
const zone = { id: "a", module: "Clock", colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 2, visible: true };
const config = {
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
            rail: [{ id: "bat", group: "widgets", target: { kind: "widget", module: "DeviceBatteries", settings: { view: "list", compact: "full" } } }],
          },
        ],
      },
    },
  ],
};

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
  expect((await saveConfig(scratch.base, { ...config, dataApiUrl: scratch.dataApi })).status).toBe(200);
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

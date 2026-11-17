import { expect, saveConfig, settled, test, watchErrors } from "./fixtures";

// The pinned layer on the kiosk (config v20): a "make room" item pads the page on its edge, so the zones lay out in the
// space left; a "float" item lies over the page; a page with hidePinned draws none; and a page change leaves the layer
// where it is (the same element, at the same place).

const W = 1024;
const H = 600;
const zone = (id: string, col: number, row: number) => ({ id, module: "Clock", colStart: col, rowStart: row, colSpan: 1, rowSpan: 1, visible: true });
const item = (id: string, edge: string, mode: string, thickness: number, extra: object = {}) => ({
  id,
  edge,
  mode,
  thickness,
  show: "all",
  visible: true,
  placement: { id: `${id}-w`, module: "Clock" },
  ...extra,
});
const config = {
  version: 20,
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
      pages: [
        { id: "one", name: "One", placements: [zone("a", 1, 1), zone("b", 2, 2)] },
        { id: "two", name: "Two", placements: [zone("c", 1, 1), zone("d", 2, 2)] },
        { id: "bare", name: "Bare", hidePinned: true, placements: [zone("e", 1, 1), zone("f", 2, 2)] },
      ],
      pinned: {
        items: [
          item("rail", "left", "room", 84),
          item("bar", "bottom", "room", 84, { inset: 12 }),
          item("float", "right", "float", 200, { show: { pages: ["one"] } }),
        ],
      },
    },
  ],
};

const box = (page: import("@playwright/test").Page, sel: string) =>
  page.locator(sel).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [r.x, r.y, r.width, r.height].map(Math.round);
  });

async function switchTo(base: string, page: string) {
  const res = await fetch(`${base}/api/control/page`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-dashboard-control": "1" },
    body: JSON.stringify({ profile: "desk", page }),
  });
  expect(res.status).toBe(200);
}

test("pinned items make room, float over the page, stay put on a page change and hide where a page says", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  // the scratch server's fake Data API, as the seeded config names it
  expect((await saveConfig(scratch.base, { ...config, dataApiUrl: scratch.dataApi })).status).toBe(200);
  await page.setViewportSize({ width: W, height: H });
  await page.goto(`${scratch.base}/?kiosk=1&profile=desk`);
  await settled(page, "[data-page-grid] > *, [data-pinned-item]");

  // the rail is flush on the left, full height; the bar sits 12 px off the bottom, between the rail and the right edge plus the padding
  expect(await box(page, '[data-pinned-item="rail"]')).toEqual([0, 0, 84, H]);
  expect(await box(page, '[data-pinned-item="bar"]')).toEqual([84 + 12, H - 12 - 84, W - 84 - 24, 84]);
  // the page lays out in what they leave: 84 + 12 on the left, 12 + 84 + 12 at the bottom
  const grid = await box(page, "[data-page-grid]");
  expect(grid).toEqual([96, 12, W - 96 - 12, H - 12 - 108]);
  // the float lies over the page's right edge and takes no room from it
  expect(await box(page, '[data-pinned-item="float"]')).toEqual([W - 200, 0, 200, H]);

  // a page change: the rail is the same element at the same place; the float shows on page one only
  await page.evaluate(() => {
    (window as unknown as { __rail: Element | null }).__rail = document.querySelector('[data-pinned-item="rail"]');
  });
  await expect.poll(async () => ((await (await fetch(`${scratch.base}/api/control`)).json()) as { kiosks: unknown[] }).kiosks.length).toBe(1);
  await switchTo(scratch.base, "two");
  await expect(page.locator('[data-pinned-item="float"]')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __rail: Element }).__rail === document.querySelector('[data-pinned-item="rail"]'))).toBe(true);
  expect(await box(page, '[data-pinned-item="rail"]')).toEqual([0, 0, 84, H]);
  expect(await box(page, "[data-page-grid]")).toEqual(grid);

  // a page that hides the pinned layer: no items, and the page takes the whole screen again
  await switchTo(scratch.base, "bare");
  await expect(page.locator("[data-pinned-item]")).toHaveCount(0);
  await expect.poll(() => box(page, "[data-page-grid]")).toEqual([12, 12, W - 24, H - 24]);
  expect(errors).toEqual([]);
});

import { expect, saveConfig, settled, test, watchErrors } from "./fixtures";

// The page rail on the kiosk (pinned layer P2): pinned to the left, it draws one slot per page (none stored), marks the
// page shown and taps to a page; a drag on the page moves it with the finger and brings the next page in beside it under
// the still rail, and a release past a quarter of the width lands there. With reduced motion a swipe switches at once.

const W = 1024;
const H = 600;
const zone = (id: string) => ({ id, module: "Clock", colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 2, visible: true });
const config = {
  version: 21,
  activeProfile: "desk",
  general: { kioskPageNav: true },
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
        { id: "one", name: "One", icon: "zap", placements: [zone("a")] },
        { id: "two", name: "Two", icon: "bot", placements: [zone("b")] },
        { id: "three", name: "Three", placements: [zone("c")] },
      ],
      pinned: { items: [{ id: "rail", edge: "left", mode: "room", thickness: 84, show: "all", visible: true, placement: { id: "rail-w", module: "PageRail" } }] },
    },
  ],
};

const box = (page: import("@playwright/test").Page, sel: string) =>
  page.locator(sel).evaluate((el) => {
    const r = el.getBoundingClientRect();
    return [r.x, r.y, r.width, r.height].map(Math.round);
  });

test("the rail taps to a page, and a drag moves the page under the still rail", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  expect((await saveConfig(scratch.base, { ...config, dataApiUrl: scratch.dataApi })).status).toBe(200);
  await page.setViewportSize({ width: W, height: H });
  await page.goto(`${scratch.base}/?kiosk=1&profile=desk`);
  await settled(page, '[data-page-grid] > *, [data-pinned-item] [data-rail-slot]');

  const rail = page.locator('[data-pinned-item="rail"]');
  const slot = (name: string) => rail.getByRole("button", { name, exact: true });
  await expect(rail.locator("button[data-rail-slot]")).toHaveCount(3);
  await expect(slot("One")).toHaveAttribute("aria-current", "page");
  // every target is at least 44 px
  for (const b of await rail.locator("button").all()) {
    const r = (await b.boundingBox())!;
    expect(Math.min(r.width, r.height)).toBeGreaterThanOrEqual(44);
  }

  // a tap shows the page and moves the marker
  await slot("Two").click();
  await expect(page.locator("main")).toHaveAttribute("aria-label", "Two");
  await expect(slot("Two")).toHaveAttribute("aria-current", "page");
  const railBox = await box(page, '[data-pinned-item="rail"]');
  const grid = await box(page, "[data-page-grid]");

  // a slow drag left: the page follows, the next page comes in beside it, the rail stays where it is
  await page.mouse.move(600, 300);
  await page.mouse.down();
  for (const x of [580, 540, 480, 420, 360]) await page.mouse.move(x, 300);
  await expect(page.locator('[data-page-peek="three"]')).toHaveCount(1);
  const moved = await box(page, "[data-page-grid]");
  expect(moved[0]).toBe(grid[0] - 240);
  expect(await box(page, "[data-page-peek]")).toEqual([grid[0] - 240 + (W - 84), grid[1], grid[2], grid[3]]);
  expect(await box(page, '[data-pinned-item="rail"]')).toEqual(railBox);
  // past a quarter of the page's width: the release lands on the next page, in place
  await page.mouse.move(300, 300);
  await page.mouse.up();
  await expect(page.locator("main")).toHaveAttribute("aria-label", "Three");
  await expect(page.locator("[data-page-peek]")).toHaveCount(0);
  await expect.poll(() => box(page, "[data-page-grid]")).toEqual(grid);
  await expect(slot("Three")).toHaveAttribute("aria-current", "page");

  // a short drag springs back
  await page.mouse.move(600, 300);
  await page.mouse.down();
  for (const x of [580, 560, 540]) await page.mouse.move(x, 300);
  await page.waitForTimeout(650);
  await page.mouse.up();
  await expect(page.locator("[data-page-peek]")).toHaveCount(0);
  await expect.poll(() => box(page, "[data-page-grid]")).toEqual(grid);
  await expect(page.locator("main")).toHaveAttribute("aria-label", "Three");
  expect(errors).toEqual([]);
});

test("with reduced motion a swipe switches at once, with no page following the finger", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  expect((await saveConfig(scratch.base, { ...config, dataApiUrl: scratch.dataApi })).status).toBe(200);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: W, height: H });
  await page.goto(`${scratch.base}/?kiosk=1&profile=desk`);
  await settled(page, '[data-page-grid] > *, [data-pinned-item] [data-rail-slot]');
  await page.mouse.move(600, 300);
  await page.mouse.down();
  await page.mouse.move(500, 300);
  await page.mouse.move(420, 300);
  await expect(page.locator("[data-page-peek]")).toHaveCount(0);
  await page.mouse.up();
  await expect(page.locator("main")).toHaveAttribute("aria-label", "Two");
  expect(errors).toEqual([]);
});

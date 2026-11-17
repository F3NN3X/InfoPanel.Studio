import { expect, saveConfig, settled, test, watchErrors } from "./fixtures";

// A widget's own touch actions on the kiosk (Placement.touch, pinned layer P6): a tap on a widget runs its tap action, a
// hold its hold action, and a double tap waits out the tap; a widget without a touch map does nothing.

const W = 1024;
const H = 600;
const clock = (id: string, touch?: object) => ({ id, module: "Clock", colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 2, visible: true, ...(touch ? { touch } : {}) });
const plain = (id: string) => ({ ...clock(id), colStart: 2 });
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
        { id: "one", name: "One", placements: [clock("a", { tap: { op: "page", to: "next" } }), plain("p1")] },
        { id: "two", name: "Two", placements: [clock("b", { hold: { op: "page", to: "one" }, doubleTap: { op: "page", to: "three" } }), plain("p2")] },
        { id: "three", name: "Three", placements: [clock("c")] },
      ],
    },
  ],
};

test("a widget's tap, hold and double tap run their actions on the kiosk", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  expect((await saveConfig(scratch.base, { ...config, dataApiUrl: scratch.dataApi })).status).toBe(200);
  await page.setViewportSize({ width: W, height: H });
  await page.goto(`${scratch.base}/?kiosk=1&profile=desk`);
  await settled(page, "[data-page-grid] > *");
  const main = page.locator("main");
  await expect(main).toHaveAttribute("aria-label", "One");

  // a widget without a map does nothing; the one with a tap goes to the next page
  const center = async (sel: string) => {
    const r = (await page.locator(sel).first().boundingBox())!;
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  };
  const p1 = await center("[data-page-grid] > :nth-child(2)");
  await page.mouse.click(p1.x, p1.y);
  await page.waitForTimeout(400);
  await expect(main).toHaveAttribute("aria-label", "One");
  await expect(page.locator("[data-touch]")).toHaveCount(1);
  await page.locator("[data-touch]").click();
  await expect(main).toHaveAttribute("aria-label", "Two");

  // a hold on page two's widget goes back to One; its tap does nothing (none set)
  const b = await center("[data-touch]");
  await page.mouse.click(b.x, b.y);
  await page.waitForTimeout(400);
  await expect(main).toHaveAttribute("aria-label", "Two");
  await page.mouse.move(b.x, b.y);
  await page.mouse.down();
  await page.waitForTimeout(800);
  await page.mouse.up();
  await expect(main).toHaveAttribute("aria-label", "One");

  // back on Two, a double tap sent the instant the page shows goes to Three (QUESTIONS P-B12: its widget was deaf until a
  // promise settled, so this needed a 400 ms wait)
  await page.locator("[data-touch]").click();
  await expect(main).toHaveAttribute("aria-label", "Two");
  const d = await center("[data-touch]");
  await page.mouse.dblclick(d.x, d.y);
  await expect(main).toHaveAttribute("aria-label", "Three");
  expect(errors).toEqual([]);
});

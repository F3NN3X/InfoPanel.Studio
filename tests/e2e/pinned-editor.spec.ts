import { expect, saveConfig, test, watchErrors } from "./fixtures";

// Edit's pinned layer (P3): Pinned in the top bar shows the layer over the dimmed page; a rail pinned from the list makes
// room on the canvas as on the kiosk; its edge moves it; Undo puts it back; a save stores it in the profile's `pinned`
// (config v20), and the page drawn with Page on lays out beside it.

const W = 1024;
const H = 600;
const zone = (id: string, col: number, row: number) => ({ id, module: "Clock", colStart: col, rowStart: row, colSpan: 1, rowSpan: 1, visible: true });
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
        { id: "two", name: "Two", placements: [zone("c", 1, 1)] },
      ],
    },
  ],
};

const stored = async (base: string) => (await (await fetch(`${base}/api/config`)).json()) as { version: number; profiles: { pinned?: { items: { edge: string; thickness: number; placement: { module: string } }[] } }[] };

test("pin a rail in Edit, move it, undo, save it into v20", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  expect((await saveConfig(scratch.base, { ...config, dataApiUrl: scratch.dataApi })).status).toBe(200);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${scratch.base}/?studio=1`);
  await page.getByRole("navigation", { name: "Studio views" }).getByRole("button", { name: /^Edit / }).click();
  await expect(page.locator("[data-zone-id]")).toHaveCount(2);

  const layerToggle = page.getByRole("radiogroup", { name: "Edit the page or the pinned layer" });
  await layerToggle.getByRole("radio", { name: "Pinned" }).click();
  const list = page.getByRole("complementary", { name: "Pinned layer" });
  await list.getByRole("button", { name: "Pin a widget" }).click();
  await page.getByRole("menuitem", { name: "Page rail" }).click();

  // the rail sits on the canvas's left edge, the full height, and the page's grid starts past it
  const canvasPage = page.locator("[data-studio-page]");
  const rail = canvasPage.locator("[data-pinned-item]");
  await expect(rail).toHaveCount(1);
  const box = async () => {
    const [p, r] = await Promise.all([canvasPage.boundingBox(), rail.boundingBox()]);
    const k = p!.width / W;
    return { left: Math.round((r!.x - p!.x) / k), width: Math.round(r!.width / k), height: Math.round(r!.height / k) };
  };
  await expect.poll(box).toEqual({ left: 0, width: 84, height: H });
  // the page is dimmed and takes no clicks while Pinned shows
  await expect(canvasPage.locator(".grid[inert]")).toHaveCount(1);

  // its edge, from the inspector: the right
  await page.getByRole("radiogroup", { name: "Edge" }).getByRole("radio", { name: "Right" }).click();
  await expect.poll(box).toEqual({ left: W - 84, width: 84, height: H });
  // Undo (the canvas has the focus, not a field) puts it back on the left
  await page.locator("[data-studio-page]").click({ position: { x: 400, y: 5 } });
  await page.keyboard.press("Control+z");
  await expect.poll(box).toEqual({ left: 0, width: 84, height: H });

  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await stored(scratch.base)).profiles[0].pinned?.items.map((i) => [i.placement.module, i.edge, i.thickness]), { timeout: 5000 }).toEqual([["PageRail", "left", 84]]);
  expect((await stored(scratch.base)).version).toBe(20);

  // Page on: the page is live again, laid out beside the rail
  await layerToggle.getByRole("radio", { name: "Page" }).click();
  await expect(canvasPage.locator(".grid[inert]")).toHaveCount(0);
  const grid = await canvasPage.locator(".grid").first().boundingBox();
  const p = await canvasPage.boundingBox();
  expect(Math.round((grid!.x - p!.x) / (p!.width / W))).toBe(84 + 12);
  expect(errors).toEqual([]);
});

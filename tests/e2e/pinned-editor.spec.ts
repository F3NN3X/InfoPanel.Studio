import { expect, saveConfig, settled, test, watchErrors } from "./fixtures";

// Edit's pinned layer (P3): Pinned in the top bar shows the layer over the dimmed page; a rail pinned from the list makes
// room on the canvas as on the kiosk; its edge moves it; Undo puts it back; a save stores it in the profile's `pinned`
// (config v20), and the page drawn with Page on lays out beside it. Pin here (config v21) pins three widgets in a row on
// their cells: they stay mounted and in place across a page change in Edit and on the kiosk, and a widget added on another
// page goes around them.

const W = 1024;
const H = 600;
const zone = (id: string, col: number, row: number) => ({ id, module: "Clock", colStart: col, rowStart: row, colSpan: 1, rowSpan: 1, visible: true });
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
      pages: [
        { id: "one", name: "One", placements: [zone("a", 1, 1), zone("b", 2, 2)] },
        { id: "two", name: "Two", placements: [zone("c", 1, 1)] },
      ],
    },
  ],
};

const stored = async (base: string) => (await (await fetch(`${base}/api/config`)).json()) as { version: number; profiles: { pinned?: { items: { edge: string; thickness: number; placement: { module: string } }[] } }[] };

test("pin a rail in Edit, move it, undo, save it into v21", async ({ page, scratch }) => {
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
  expect((await stored(scratch.base)).version).toBe(21);

  // Page on: the page is live again, laid out beside the rail
  await layerToggle.getByRole("radio", { name: "Page" }).click();
  await expect(canvasPage.locator(".grid[inert]")).toHaveCount(0);
  const grid = await canvasPage.locator(".grid").first().boundingBox();
  const p = await canvasPage.boundingBox();
  expect(Math.round((grid!.x - p!.x) / (p!.width / W))).toBe(84 + 12);
  expect(errors).toEqual([]);
});

test("pin a page widget from its right-click menu, take it off with Delete, undo, move it back to the page", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  expect((await saveConfig(scratch.base, { ...config, dataApiUrl: scratch.dataApi })).status).toBe(200);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${scratch.base}/?studio=1`);
  await page.getByRole("navigation", { name: "Studio views" }).getByRole("button", { name: /^Edit / }).click();
  await expect(page.locator("[data-zone-id]")).toHaveCount(2);

  // right-click a widget: Pin to edge > Top moves it into the pinned layer, which Edit then shows with it selected
  await page.locator('[data-zone-id="a"]').click({ button: "right" });
  await page.getByRole("menuitem", { name: "Pin to edge" }).click();
  await page.getByRole("menuitem", { name: "Top" }).click();
  const canvasPage = page.locator("[data-studio-page]");
  await expect(canvasPage.locator("[data-pinned-item]")).toHaveCount(1);
  const list = page.getByRole("complementary", { name: "Pinned layer" });
  await expect(list.getByRole("button", { name: "Unpin" })).toHaveCount(1);
  await expect(page.getByRole("complementary", { name: "Inspector" }).getByRole("button", { name: "Unpin" })).toBeVisible();

  // Delete on the selected item deletes it; one Undo brings it back
  await canvasPage.locator("[data-pinned-item] button").click();
  await page.keyboard.press("Delete");
  await expect(canvasPage.locator("[data-pinned-item]")).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(canvasPage.locator("[data-pinned-item]")).toHaveCount(1);

  // Unpin puts it back onto the page (never deletes it), where Edit shows it selected
  await list.getByText("Clock").first().click({ button: "right" });
  await page.getByRole("menuitem", { name: "Unpin" }).click();
  await expect(canvasPage.locator("[data-pinned-item]")).toHaveCount(0);
  await expect(page.locator("[data-zone-id]")).toHaveCount(2);
  expect(errors).toEqual([]);
});

// Three Clocks in a row on a 3 x 2 grid, and an empty second page.
const row = {
  version: 21,
  activeProfile: "desk",
  profiles: [
    {
      id: "desk",
      name: "Desk",
      width: W,
      height: H,
      cols: 3,
      rows: 2,
      fit: "fill",
      padding: 12,
      gap: 12,
      pages: [
        { id: "one", name: "One", placements: [zone("a", 1, 1), zone("b", 2, 1), zone("c", 3, 1)] },
        { id: "two", name: "Two", placements: [] },
      ],
    },
  ],
};

type Saved = { version: number; profiles: { pinned?: { items: { at?: { colStart: number; rowStart: number; colSpan: number; rowSpan: number }; placement: { id: string } }[] }; pages: { id: string; placements: { colStart: number; rowStart: number; colSpan: number; rowSpan: number }[] }[] }[] };

/** An element's box in the canvas page's design px. */
const designBox = async (page: import("@playwright/test").Page, selector: string) =>
  page.locator(selector).evaluate((el, w) => {
    const p = document.querySelector("[data-studio-page]")!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const k = p.width / w;
    return [r.x - p.x, r.y - p.y, r.width, r.height].map((n) => Math.round(n / k));
  }, W);

/** Marks the pinned items' elements, then whether each is still the element it was. */
const mark = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    (window as unknown as { __pins: Element[] }).__pins = [...document.querySelectorAll("[data-pinned-item]")];
  });
const sameElements = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const was = (window as unknown as { __pins: Element[] }).__pins;
    return was.length > 0 && was.every((el) => el.isConnected && document.querySelector(`[data-pinned-item="${el.getAttribute("data-pinned-item")}"]`) === el);
  });

test("pin three widgets in a row with Pin here: they stay on their cells across pages, and a new widget goes around them", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  expect((await saveConfig(scratch.base, { ...row, dataApiUrl: scratch.dataApi })).status).toBe(200);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${scratch.base}/?studio=1`);
  await page.getByRole("navigation", { name: "Studio views" }).getByRole("button", { name: /^Edit / }).click();
  await expect(page.locator("[data-zone-id]")).toHaveCount(3);
  const before = await Promise.all(["a", "b", "c"].map((id) => designBox(page, `[data-zone-id="${id}"]`)));

  // select the three, right-click one: Pin here comes first, then Pin to edge (one widget only, so not for three)
  await page.locator('[data-zone-id="a"]').click();
  await page.locator('[data-zone-id="b"]').click({ modifiers: ["Control"] });
  await page.locator('[data-zone-id="c"]').click({ modifiers: ["Control"] });
  await page.locator('[data-zone-id="c"]').click({ button: "right" });
  const menu = page.getByTestId("layer-menu");
  await expect(menu.getByRole("menuitem", { name: "Pin to edge" })).toHaveCount(0);
  await menu.getByRole("menuitem", { name: "Pin here" }).click();

  // the page has none of them now; the pinned layer draws them where they were, Edit staying on the page
  const canvasPage = page.locator("[data-studio-page]");
  await expect(canvasPage.locator('[data-pinned-mode="grid"]')).toHaveCount(3);
  await expect(page.locator("[data-zone-id]")).toHaveCount(0);
  await expect(page.getByRole("radiogroup", { name: "Edit the page or the pinned layer" }).getByRole("radio", { name: "Page" })).toBeChecked();

  // one Undo puts all three back on the page; Redo pins them again
  await canvasPage.click({ position: { x: 400, y: 5 } });
  await page.keyboard.press("Control+z");
  await expect(page.locator("[data-zone-id]")).toHaveCount(3);
  await expect(canvasPage.locator('[data-pinned-mode="grid"]')).toHaveCount(0);
  await page.keyboard.press("Control+Shift+z");
  await expect(canvasPage.locator('[data-pinned-mode="grid"]')).toHaveCount(3);

  // in place: each pinned box is the box its widget had on the page
  const boxes = () => canvasPage.locator('[data-pinned-mode="grid"]').evaluateAll((els, w) => {
    const p = document.querySelector("[data-studio-page]")!.getBoundingClientRect();
    const k = p.width / w;
    return els.map((el) => {
      const r = el.getBoundingClientRect();
      return [r.x - p.x, r.y - p.y, r.width, r.height].map((n) => Math.round(n / k));
    });
  }, W);
  expect(await boxes()).toEqual(before);

  // another page: the same elements at the same cells, not mounted again
  await mark(page);
  await page.getByRole("tablist", { name: "Pages" }).getByRole("tab", { name: /^Two/ }).click();
  await expect(page.getByRole("tablist", { name: "Pages" }).getByRole("tab", { name: /^Two/ })).toHaveAttribute("aria-selected", "true");
  expect(await sameElements(page)).toBe(true);
  expect(await boxes()).toEqual(before);

  // a widget added on that page goes around the pinned cells: into the second row
  await page.getByRole("tab", { name: "Add" }).click();
  await page.getByRole("combobox", { name: /^Search widgets/ }).fill("clock");
  await page.getByTestId("add-tile").filter({ hasText: "Clock" }).first().click();
  await expect(page.locator("[data-zone-id]")).toHaveCount(1);
  await page.keyboard.press("Control+s");
  const stored = async () => (await (await fetch(`${scratch.base}/api/config`)).json()) as Saved;
  await expect.poll(async () => (await stored()).profiles[0].pages[1].placements.length, { timeout: 5000 }).toBe(1);
  const saved = await stored();
  expect(saved.version).toBe(21);
  expect(saved.profiles[0].pinned?.items.map((it) => it.at)).toEqual([1, 2, 3].map((col) => ({ colStart: col, rowStart: 1, colSpan: 1, rowSpan: 1 })));
  expect(saved.profiles[0].pages[1].placements[0].rowStart).toBe(2);

  // the kiosk draws them on their cells over the page grid, and a page change keeps the same elements in place
  await page.setViewportSize({ width: W, height: H });
  await page.goto(`${scratch.base}/?kiosk=1&profile=desk`);
  await settled(page, "[data-pinned-item]");
  const kiosk = () =>
    page.locator("[data-pinned-item]").evaluateAll((els) => els.map((el) => [el.getAttribute("data-pinned-mode"), ...(() => {
      const r = el.getBoundingClientRect();
      return [r.x, r.y, r.width, r.height].map(Math.round);
    })()]));
  // a 3 x 2 grid in the 1000 x 576 page area (12 px padding), 12 px gaps: cells (1000 - 24) / 3 x 282
  const cw = (W - 24 - 24) / 3;
  const expected = [0, 1, 2].map((i) => ["grid", Math.round(12 + i * (cw + 12)), 12, Math.round(cw), 282]);
  await expect.poll(kiosk).toEqual(expected);
  await mark(page);
  await expect.poll(async () => ((await (await fetch(`${scratch.base}/api/control`)).json()) as { kiosks: unknown[] }).kiosks.length).toBe(1);
  const res = await fetch(`${scratch.base}/api/control/page`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-dashboard-control": "1" },
    body: JSON.stringify({ profile: "desk", page: "two" }),
  });
  expect(res.status).toBe(200);
  // page two's own widget, in the second row, is drawn
  await expect(page.locator("[data-page-grid] > *")).toHaveCount(1);
  expect(await sameElements(page)).toBe(true);
  expect(await kiosk()).toEqual(expected);
  expect(errors).toEqual([]);
});

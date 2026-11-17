import type { Locator, Page } from "@playwright/test";
import { expect, test, watchErrors } from "./fixtures";

// Builder plan Phase 5 on the stage (recipe format 2): a grid laid out on tracks, a block dragged a track at a time by its body and
// sized by its handles to the nearest track line, each one undo step, Alt+arrows a track; a block's part of its column set by its side
// handle; a block set as its container's background from the layer menu's Layer flyout. Each result is read back from recipe.json.

async function newWidget(page: Page, base: string, name: string) {
  await page.goto(`${base}/?studio=1`);
  await page.getByRole("navigation", { name: "Studio views" }).getByRole("button", { name: "Widgets", exact: true }).click();
  await page.getByRole("button", { name: "New widget" }).click();
  await page.getByLabel("Widget name").fill(name);
  await page.getByLabel("Widget name").press("Enter");
}
const layer = (page: Page, path: string) => page.locator(`[data-layer="${path}"]`);
const block = (page: Page, path: string) => page.locator(`[data-recipe-zone] [data-recipe-path="${path}"]`);
const add = async (page: Page, into: string, type: string) => {
  await layer(page, into).click();
  await page.locator(`[data-add-block="${type}"]`).click();
};
const stored = async (base: string, key: string) => (await fetch(`${base}/api/widgets/${key}/recipe.json`)).json();
const said = (page: Page) => page.locator("[data-announce]");
async function save(page: Page, name: string) {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(`Saved ${name}`).first()).toBeVisible();
}
const centre = async (l: Locator) => {
  const b = (await l.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
/** Presses at `from`, moves past the drag threshold and on to `to` in steps, leaving the button down. */
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 6, from.y + 6, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
}

test("a grid on tracks: a block dragged by its body moves a track at a time and its handle sizes it, each one undo step", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  await newWidget(page, scratch.base, "Areas");
  await add(page, "", "grid");
  await add(page, "0", "value");
  await add(page, "0", "value");
  // tracks on: each block takes the next free cell
  await layer(page, "0").click();
  await page.getByRole("switch", { name: "Lay out on tracks" }).click();
  await page.getByLabel("Column tracks").fill("1 1 1");
  await page.getByLabel("Column tracks").press("Enter");
  await save(page, "Areas");
  let r = await stored(scratch.base, "recipe.areas");
  expect(r.format).toBe(2);
  expect(r.root.children[0].tracks).toEqual({ cols: [1, 1, 1], rows: [1, 1] });
  expect(r.root.children[0].children.map((c: { area: number[] }) => c.area)).toEqual([[1, 1, 1, 1], [2, 1, 1, 1]]);

  // the body: dragged to the third column, it lands there; the track lines show while it is selected
  await block(page, "0.0").click();
  await expect(page.locator("[data-track-lines] > div")).toHaveCount(3);
  const grid = (await page.locator('[data-recipe-zone] [data-recipe-grid="0"]').boundingBox())!;
  await drag(page, await centre(block(page, "0.0")), { x: grid.x + grid.width * (5 / 6), y: grid.y + grid.height / 4 });
  await page.mouse.up();
  await expect(said(page)).toHaveText("Moved Value to column 3, row 1");
  await expect(page.getByLabel("Area column", { exact: true })).toHaveValue("3");

  // the bottom handle to the grid's bottom edge: two rows
  const bottom = await centre(page.locator('[data-area-handle="bottom"]'));
  await drag(page, bottom, { x: bottom.x, y: grid.y + grid.height - 2 });
  await expect(page.locator("[data-area-text]")).toHaveText("Columns 3 to 3, rows 1 to 2");
  await page.mouse.up();
  await expect(page.getByLabel("Area rows", { exact: true })).toHaveValue("2");
  await save(page, "Areas");
  r = await stored(scratch.base, "recipe.areas");
  expect(r.root.children[0].children[0].area).toEqual([3, 1, 1, 2]);

  // one undo step each: the size, then the move
  await page.getByRole("button", { name: "Undo (Ctrl+Z)" }).click();
  await expect(page.getByLabel("Area rows", { exact: true })).toHaveValue("1");
  await page.getByRole("button", { name: "Undo (Ctrl+Z)" }).click();
  await expect(page.getByLabel("Area column", { exact: true })).toHaveValue("1");

  // Alt+arrows on the stage move it a track; at the edge they say why not
  await block(page, "0.0").click();
  await page.locator("[data-builder-stage]").focus();
  await page.keyboard.press("Alt+ArrowRight");
  await expect(page.getByLabel("Area column", { exact: true })).toHaveValue("2");
  await page.keyboard.press("Alt+ArrowUp");
  await expect(said(page)).toHaveText("It is at the grid's edge");
  // a corner handle by keyboard: a track wider and taller
  await page.locator('[data-area-handle="bottom-right"]').focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByLabel("Area columns", { exact: true })).toHaveValue("2");
  await expect(page.getByLabel("Area rows", { exact: true })).toHaveValue("2");
  expect(errors).toEqual([]);
});

test("a side handle sets a block's part of its column, snapped, in one undo step", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  await newWidget(page, scratch.base, "Parts");
  await add(page, "", "value");
  await block(page, "0").click();
  const card = (await block(page, "0").boundingBox())!;
  const right = await centre(page.locator('[data-fill-handle="right"]'));
  await drag(page, right, { x: card.x + card.width * 0.51, y: right.y });
  await expect(page.locator("[data-fill-text]")).toHaveText("50 %");
  await page.mouse.up();
  await expect(said(page)).toHaveText("Value: 50 % of its column's width");
  await expect(page.locator('[data-fill-handle="right"]')).toHaveAttribute("aria-valuenow", "50");
  await save(page, "Parts");
  const r = await stored(scratch.base, "recipe.parts");
  expect(r.root.children[0].fill).toBe(0.5);
  expect(r.format).toBe(2);
  // by keyboard: the next part up
  await page.locator('[data-fill-handle="right"]').focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator('[data-fill-handle="right"]')).toHaveAttribute("aria-valuenow", "67");
  expect(errors).toEqual([]);
});

test("Set as background from the layer menu puts a block under its container's blocks, last in Layers, with a scrim warning", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  await newWidget(page, scratch.base, "Layers");
  await add(page, "", "ring");
  await add(page, "", "value");
  await layer(page, "0").click({ button: "right" });
  await page.getByTestId("builder-layer-menu").getByRole("menuitem", { name: "Layer" }).click();
  await page.getByTestId("builder-layer-menu").getByRole("menuitem", { name: "Set as background" }).click();
  await expect(said(page)).toHaveText("Ring set as the background");
  // listed at the bottom of the card, marked as a background
  await expect(page.locator("[data-layer]")).toHaveText([/New widget|Layers/, /Value/, /Ring/]);
  await expect(layer(page, "0").locator("[data-layer-background]")).toBeVisible();
  await expect(page.locator('[data-recipe-zone] [data-recipe-layer="background"]')).toHaveCount(1);
  // text over it at full opacity: a warning, not a refusal
  await expect(page.locator("[data-validation]")).toContainText("opacity to 60 % or lower");
  await save(page, "Layers");
  const r = await stored(scratch.base, "recipe.layers");
  expect(r.root.children[0].background).toEqual({});
  expect(errors).toEqual([]);
});

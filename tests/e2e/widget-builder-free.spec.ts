import type { Locator, Page } from "@playwright/test";
import { expect, test, watchErrors } from "./fixtures";

// The free layout on the stage (recipe format 2): the card set to Place freely, a block dragged onto the same line as another by the
// guide snap (the guide and the readout shown while it moves), one undo step; a rubber band selecting both shows the Arrange bar; a
// locked block does not move when dragged, Ctrl+Shift+L locks from the stage. Each result is read back from recipe.json.

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

test("free blocks: dragged onto one line by the guide snap, selected by a rubber band, and a locked one stays put", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  await newWidget(page, scratch.base, "Free");
  // the card placed freely, then two values: each takes the next default box
  await layer(page, "").click();
  await page.getByRole("switch", { name: "Place freely" }).click();
  await add(page, "", "value");
  await add(page, "", "value");
  await save(page, "Free");
  let r = await stored(scratch.base, "recipe.free");
  expect(r.format).toBe(2);
  expect(r.root.layout).toBe("free");
  const [a, b] = [r.root.children[0].box, r.root.children[1].box];
  expect(b[1]).not.toBe(a[1]);

  // the second value dragged right and up to 3 px under the first one's top: it snaps onto its line, with the guide and the readout
  const frame = (await page.locator('[data-recipe-zone] [data-recipe-free=""]').boundingBox())!;
  const from = await centre(block(page, "1"));
  const to = { x: from.x + frame.width * 0.4, y: from.y + (a[1] - b[1]) * frame.height + 3 };
  await drag(page, from, to);
  await expect(page.locator('[data-free-guides] [data-guide="y"]').first()).toBeVisible();
  await expect(page.locator("[data-free-readout]")).toContainText(`y ${Math.round(a[1] * 1000) / 10} %`);
  await page.mouse.up();
  await expect(said(page)).toContainText("Moved Value:");
  await save(page, "Free");
  r = await stored(scratch.base, "recipe.free");
  expect(r.root.children[1].box[1]).toBe(a[1]);
  // one undo step: back where it was
  await page.getByRole("button", { name: "Undo (Ctrl+Z)" }).click();
  await expect(page.getByLabel("Box y", { exact: true })).toHaveValue(String(Math.round(b[1] * 1000) / 10));
  await page.getByRole("button", { name: "Redo (Ctrl+Shift+Z)" }).click();

  // a rubber band from the empty bottom of the card over both: the Arrange bar
  await drag(page, { x: frame.x + 4, y: frame.y + frame.height - 4 }, { x: frame.x + frame.width - 4, y: frame.y + 4 });
  await expect(page.locator("[data-band]")).toBeVisible();
  await page.mouse.up();
  await expect(page.locator("[data-selection-also]")).toHaveCount(1);
  await expect(page.getByRole("toolbar", { name: "Arrange" })).toContainText("Arrange 2");

  // the first value alone locked from the stage's menu: a drag on it moves nothing, and its lock shows in Layers
  await block(page, "0").click({ position: { x: 8, y: 8 } });
  await block(page, "0").click({ button: "right", position: { x: 8, y: 8 } });
  await page.getByTestId("builder-stage-menu").getByRole("menuitem", { name: "Lock" }).click();
  await expect(layer(page, "0")).toHaveAttribute("data-locked", "");
  const locked = (await block(page, "0").boundingBox())!;
  await drag(page, { x: locked.x + 8, y: locked.y + 8 }, { x: locked.x + 80, y: locked.y + 60 });
  await page.mouse.up();
  expect(await block(page, "0").boundingBox()).toEqual(locked);
  await expect(layer(page, "1")).not.toHaveAttribute("data-locked", "");
  // nothing changed, so there is nothing to save
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();

  // Ctrl+Shift+L on the stage locks the selection and unlocks it again
  await block(page, "1").click({ position: { x: frame.width * 0.3, y: 8 } });
  await page.keyboard.press("Control+Shift+L");
  await expect(layer(page, "1")).toHaveAttribute("data-locked", "");
  await layer(page, "1").click();
  await page.locator("[data-builder-stage]").focus();
  await page.keyboard.press("Control+Shift+L");
  await expect(layer(page, "1")).not.toHaveAttribute("data-locked", "");

  // a Label tile dropped low in the card lands centred at the pointer at its default size; Ctrl+D puts its copy 2 % down and right
  const tile = (await page.locator('[data-add-block="label"]').boundingBox())!;
  const drop = { x: frame.x + frame.width / 2, y: frame.y + frame.height * 0.8 };
  await page.mouse.move(tile.x + tile.width / 2, tile.y + tile.height / 2);
  await page.mouse.down();
  await page.mouse.move(drop.x, drop.y, { steps: 10 });
  // the browser sends the drag's dragover to where it rests only after a further move
  await page.mouse.move(drop.x + 1, drop.y);
  await page.mouse.move(drop.x, drop.y);
  await page.mouse.up();
  await expect(said(page)).toContainText("Added Label");
  await page.keyboard.press("Control+d");
  await expect(said(page)).toHaveText("Duplicated Label");
  await save(page, "Free");
  r = await stored(scratch.base, "recipe.free");
  const [added, copy] = [r.root.children[2].box, r.root.children[3].box];
  expect(added[0]).toBeCloseTo(0.25, 2);
  expect(added[1]).toBeCloseTo(0.8 - added[3] / 2, 2);
  expect(copy).toEqual([added[0] + 0.02, added[1] + 0.02, added[2], added[3]].map((n) => Math.round(n * 10000) / 10000));
  expect(errors).toEqual([]);
});

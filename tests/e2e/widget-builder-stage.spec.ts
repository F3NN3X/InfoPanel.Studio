import type { Locator, Page } from "@playwright/test";
import { expect, test, watchErrors } from "./fixtures";

// Builder plan Phase 1, direct edits on the stage in the flow model: a block dragged to another container (one undo step, Esc
// cancels, a refusal names its reason), a share handle dragged to 2:1 and moved by its arrows, Ctrl and Shift click, and the arrows on
// the focused stage. Each stored result is read back from the recipe.json the server holds.

/** The Widgets page on a fresh scratch server, a new recipe open in the builder. */
async function newWidget(page: Page, base: string) {
  await page.goto(`${base}/?studio=1`);
  await page.getByRole("navigation", { name: "Studio views" }).getByRole("button", { name: "Widgets", exact: true }).click();
  await page.getByRole("button", { name: "New widget" }).click();
}
const layer = (page: Page, path: string) => page.locator(`[data-layer="${path}"]`);
const block = (page: Page, path: string) => page.locator(`[data-recipe-zone] [data-recipe-path="${path}"]`);
const add = (page: Page, type: string) => page.locator(`[data-add-block="${type}"]`).click();
/** Layers as "path name" lines, top first. */
const layers = async (page: Page) => page.locator("[data-layer]").evaluateAll((els) => els.map((e) => `${e.getAttribute("data-layer")} ${e.textContent?.trim()}`));
const stored = async (base: string, key: string) => (await fetch(`${base}/api/widgets/${key}/recipe.json`)).json();
const said = (page: Page) => page.locator("[data-announce]");
const undo = (page: Page) => page.getByRole("button", { name: "Undo (Ctrl+Z)" }).click();

/** Adds blocks of `types` into the block at `into` (the root card: ""), in order. */
async function blocks(page: Page, into: string, types: string[]) {
  for (const type of types) {
    await layer(page, into).click();
    await add(page, type);
  }
}
/** The recipe's name (its id when it is first saved): an undo step of its own. */
async function rename(page: Page, name: string) {
  await page.getByLabel("Widget name").fill(name);
  await page.getByLabel("Widget name").press("Enter");
}
async function save(page: Page, name: string) {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(`Saved ${name}`).first()).toBeVisible();
}
const centre = async (l: Locator) => {
  const b = (await l.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b };
};
/** Presses on `from`'s centre and moves to `to` in steps, leaving the button down. */
async function dragTo(page: Page, from: Locator, to: { x: number; y: number }) {
  const a = await centre(from);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 8, a.y + 8, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 8 });
}

test("a block dragged on the stage moves into a Card in one undo step; Esc cancels a drag", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  await newWidget(page, scratch.base);
  await blocks(page, "", ["row"]);
  await blocks(page, "0", ["value", "ring"]);
  await blocks(page, "", ["card"]);
  const before = [" New widget", "0 Row", "0.0 Value", "0.1 Ring", "1 Card"];
  expect(await layers(page)).toEqual(before);

  // Esc while dragging: nothing moves
  await dragTo(page, block(page, "0.0"), await centre(block(page, "1")));
  await expect(page.locator("[data-stage-drop]")).toHaveText("Move into Card");
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator("[data-stage-drop]")).toHaveCount(0);
  expect(await layers(page)).toEqual(before);
  await expect(said(page)).toHaveText("Move cancelled");

  await dragTo(page, block(page, "0.0"), await centre(block(page, "1")));
  await expect(page.locator('[data-stage-drop="inside"]')).toBeVisible();
  await page.mouse.up();
  const after = [" New widget", "0 Row", "0.0 Ring", "1 Card", "1.0 Value"];
  expect(await layers(page)).toEqual(after);
  await expect(said(page)).toHaveText("Moved Value into Card");
  // the moved block stays selected
  await expect(layer(page, "1.0")).toHaveAttribute("aria-selected", "true");
  await undo(page);
  expect(await layers(page)).toEqual(before);
  await page.getByRole("button", { name: "Redo (Ctrl+Shift+Z)" }).click();
  expect(await layers(page)).toEqual(after);
  await rename(page, "Stage move");
  await save(page, "Stage move");
  const r = await stored(scratch.base, "recipe.stage-move");
  expect(r.root.children.map((b: { type: string }) => b.type)).toEqual(["row", "card"]);
  expect(r.root.children[1].children[0].type).toBe("value");
  expect(errors).toEqual([]);
});

test("a Repeat dragged onto another Repeat is refused with its reason", async ({ page, scratch }) => {
  await newWidget(page, scratch.base);
  await blocks(page, "", ["repeat", "repeat"]);
  const before = await layers(page);
  await dragTo(page, block(page, "1"), await centre(block(page, "0")));
  await expect(page.locator('[data-stage-drop="refused"]')).toHaveText("A Repeat can't go inside another Repeat");
  await page.mouse.up();
  await expect(page.locator("[data-move-why]")).toHaveText("A Repeat can't go inside another Repeat");
  expect(await layers(page)).toEqual(before);
});

test("a share handle dragged to 2:1 sets the two shares in one undo step; its arrows move it 5 %", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  await newWidget(page, scratch.base);
  await rename(page, "Shares");
  await blocks(page, "", ["row"]);
  await blocks(page, "0", ["ring", "ring"]);
  await block(page, "0.0").click();
  const handle = page.locator('[data-share-handle="0.0|0.1"]');
  await expect(handle).toHaveAttribute("aria-valuenow", "50");
  const a = (await block(page, "0.0").boundingBox())!;
  const b = (await block(page, "0.1").boundingBox())!;
  const h = await centre(handle);
  await page.mouse.move(h.x, h.y);
  await page.mouse.down();
  await page.mouse.move(a.x + (b.x + b.width - a.x) * 0.65, h.y, { steps: 8 });
  // snapped to 2:1
  await expect(page.locator("[data-share-text]")).toHaveText("67 % | 33 %");
  await page.mouse.up();
  await expect(handle).toHaveAttribute("aria-valuenow", "67");
  await expect(said(page)).toHaveText("Shares 67 % | 33 %");
  await save(page, "Shares");
  let r = await stored(scratch.base, "recipe.shares");
  expect(r.root.children[0].children.map((c: { grow?: number }) => c.grow)).toEqual([1.33, 0.67]);
  // one step back
  await undo(page);
  await expect(handle).toHaveAttribute("aria-valuenow", "50");
  // by keyboard: Right adds 5 % to the first
  await handle.focus();
  await page.keyboard.press("ArrowRight");
  await expect(handle).toHaveAttribute("aria-valuenow", "55");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(async () => (await stored(scratch.base, "recipe.shares")).root.children[0].children.map((c: { grow?: number }) => c.grow)).toEqual([1.1, 0.9]);
  r = await stored(scratch.base, "recipe.shares");
  expect(r.format).toBe(1);
  expect(errors).toEqual([]);
});

test("Ctrl and Shift click on the stage add to the selection; the focused stage walks and moves by the arrows", async ({ page, scratch }) => {
  await newWidget(page, scratch.base);
  await blocks(page, "", ["value", "label", "ring"]);
  await block(page, "0").click();
  await block(page, "2").click({ modifiers: ["Control"] });
  await expect(layer(page, "0")).toHaveAttribute("aria-selected", "true");
  await expect(layer(page, "2")).toHaveAttribute("aria-selected", "true");
  await expect(layer(page, "1")).toHaveAttribute("aria-selected", "false");
  await expect(page.locator("[data-selection-also]")).toHaveCount(1);
  await block(page, "0").click({ modifiers: ["Shift"] });
  for (const k of ["0", "1", "2"]) await expect(layer(page, k)).toHaveAttribute("aria-selected", "true");

  // a plain click picks one and focuses the stage: Down walks, Alt+Up moves, Esc steps up to the card, Del deletes
  await block(page, "0").click();
  const stage = page.locator("[data-builder-stage]");
  await expect(stage).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(layer(page, "1")).toHaveAttribute("aria-current", "true");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Alt+ArrowUp");
  expect(await layers(page)).toEqual([" New widget", "0 Value", "1 Ring", "2 Label"]);
  await expect(layer(page, "1")).toHaveAttribute("aria-current", "true");
  await expect(stage).toBeFocused();
  await page.keyboard.press("Delete");
  expect(await layers(page)).toEqual([" New widget", "0 Value", "1 Label"]);
  await expect(stage).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(layer(page, "")).toHaveAttribute("aria-current", "true");
  // F2 renames in Layers
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("F2");
  await page.getByLabel("Rename Value").fill("Temp");
  await page.keyboard.press("Enter");
  expect(await layers(page)).toEqual([" New widget", "0 Temp", "1 Label"]);
});

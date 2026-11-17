import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, test, watchErrors } from "./fixtures";

// Builder audit Phase B1, what is expected of an editor: the layer menu by mouse and by keyboard (G9), Copy, Cut and Paste across
// open recipes (G10), a selection of several blocks and Wrap in a row (G11), tiles dragged onto Layers and the stage (G12), Close and
// Discard (G13), Ctrl+S (G14), Layers as an APG tree with warning dots (G24, G6), and the studio's keys kept off the hidden screen
// (B17). Each stored result is read back from the recipe.json the server holds.

/** The Widgets page on a fresh scratch server, a new recipe open in the builder. */
async function newWidget(page: Page, base: string) {
  await page.goto(`${base}/?studio=1`);
  await widgetsPage(page);
  await page.getByRole("button", { name: "New widget" }).click();
}
const widgetsPage = (page: Page) => page.getByRole("navigation", { name: "Studio views" }).getByRole("button", { name: "Widgets", exact: true }).click();
const layer = (page: Page, path: string) => page.locator(`[data-layer="${path}"]`);
const add = (page: Page, type: string) => page.locator(`[data-add-block="${type}"]`).click();
/** Layers as "path name" lines, top first. */
const layers = async (page: Page) => page.locator("[data-layer]").evaluateAll((els) => els.map((e) => `${e.getAttribute("data-layer")} ${e.textContent?.trim()}`));
const stored = async (base: string, key: string) => (await fetch(`${base}/api/widgets/${key}/recipe.json`)).json();
const said = (page: Page) => page.locator("[data-announce]");

/** Adds blocks of `types` to the root card, in order. */
async function blocks(page: Page, types: string[]) {
  for (const type of types) {
    await layer(page, "").click();
    await add(page, type);
  }
}

/** Runs a layer menu item on a row: right-click and click (mouse), or Shift+F10 and the arrows to it, then Enter (keyboard). */
async function menu(page: Page, row: string, item: string, by: "mouse" | "keyboard") {
  if (by === "mouse") {
    await layer(page, row).click({ button: "right" });
    await page.getByTestId("builder-layer-menu").getByRole("menuitem", { name: item }).click();
  } else {
    await layer(page, row).focus();
    await page.keyboard.press("Shift+F10");
    const menuEl = page.getByTestId("builder-layer-menu");
    await expect(menuEl).toBeVisible();
    for (let n = 0; n < 14; n++) {
      if ((await page.evaluate(() => document.activeElement?.textContent ?? "")).startsWith(item)) break;
      await page.keyboard.press("ArrowDown");
    }
    await page.keyboard.press("Enter");
  }
  await expect(page.getByTestId("builder-layer-menu")).toHaveCount(0);
}

for (const by of ["mouse", "keyboard"] as const) {
  test(`every layer menu action works by ${by}`, async ({ page, scratch }) => {
    const { errors } = watchErrors(page);
    await newWidget(page, scratch.base);
    await blocks(page, ["ring", "value"]);
    // Rename, then Duplicate and Delete
    await menu(page, "0", "Rename", by);
    await page.getByLabel("Rename Ring").fill("Big ring");
    await page.keyboard.press("Enter");
    expect(await layers(page)).toEqual([" New widget", "0 Big ring", "1 Value"]);
    await menu(page, "0", "Duplicate", by);
    expect(await layers(page)).toEqual([" New widget", "0 Big ring", "1 Big ring", "2 Value"]);
    await menu(page, "1", "Delete", by);
    expect(await layers(page)).toEqual([" New widget", "0 Big ring", "1 Value"]);
    // Copy and Paste (after a leaf), Cut and Paste
    await menu(page, "1", "Copy", by);
    await menu(page, "1", "Paste", by);
    expect(await layers(page)).toEqual([" New widget", "0 Big ring", "1 Value", "2 Value"]);
    await menu(page, "0", "Cut", by);
    expect(await layers(page)).toEqual([" New widget", "0 Value", "1 Value"]);
    await menu(page, "1", "Paste", by);
    expect(await layers(page)).toEqual([" New widget", "0 Value", "1 Value", "2 Big ring"]);
    // Wrap in a row, Move out, Move up, Move down
    await menu(page, "2", "Wrap in a row", by);
    expect(await layers(page)).toEqual([" New widget", "0 Value", "1 Value", "2 Row", "2.0 Big ring"]);
    await menu(page, "2.0", "Move out", by);
    expect(await layers(page)).toEqual([" New widget", "0 Value", "1 Value", "2 Row", "3 Big ring"]);
    await menu(page, "3", "Move up", by);
    expect(await layers(page)).toEqual([" New widget", "0 Value", "1 Value", "2 Big ring", "3 Row"]);
    await menu(page, "2", "Move down", by);
    expect(await layers(page)).toEqual([" New widget", "0 Value", "1 Value", "2 Row", "3 Big ring"]);
    await expect(said(page)).toHaveText(/Moved Big ring down/);
    // the root: only Paste applies
    await layer(page, "").click({ button: "right" });
    const items = page.getByTestId("builder-layer-menu").getByRole("menuitem");
    await expect(items.filter({ hasNotText: "Paste" }).and(page.locator(":enabled"))).toHaveCount(0);
    await page.keyboard.press("Escape");
    expect(errors).toEqual([]);
  });
}

test("Layers is an APG tree: roles, levels, selected and expanded states, arrows, Home and End, F2, type-ahead, Escape", async ({ page, scratch }) => {
  await newWidget(page, scratch.base);
  await blocks(page, ["row", "value"]);
  await layer(page, "0").click();
  await add(page, "ring");
  const tree = page.getByRole("tree", { name: "Layers" });
  await expect(tree).toHaveAttribute("aria-multiselectable", "true");
  const items = tree.getByRole("treeitem");
  await expect(items).toHaveCount(5);
  // the card's Header pseudo-row (Phase D, G37) is its first row, a level under it
  expect(await items.evaluateAll((els) => els.map((e) => [e.getAttribute("data-layer") ?? (e.hasAttribute("data-layer-header") ? "header" : null), e.getAttribute("aria-level"), e.getAttribute("aria-expanded"), e.getAttribute("aria-selected")]))).toEqual([
    ["", "1", "true", "false"],
    ["header", "2", null, "false"],
    ["0", "2", "true", "false"],
    ["0.0", "3", null, "true"],
    ["1", "2", null, "false"],
  ]);
  // one tab stop: the selection's row
  expect(await items.evaluateAll((els) => els.map((e) => e.getAttribute("tabindex")))).toEqual(["-1", "-1", "-1", "0", "-1"]);
  await layer(page, "").click();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator("[data-layer-header]")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(layer(page, "0")).toBeFocused();
  await page.keyboard.press("End");
  await expect(layer(page, "1")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(layer(page, "")).toBeFocused();
  // Left closes a container (its rows go), Right opens it, then steps into it; Left on a leaf goes to its parent
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowLeft");
  await expect(layer(page, "0")).toHaveAttribute("aria-expanded", "false");
  await expect(items).toHaveCount(4);
  await page.keyboard.press("ArrowRight");
  await expect(layer(page, "0")).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowRight");
  await expect(layer(page, "0.0")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(layer(page, "0")).toBeFocused();
  // Enter selects the focused row; Shift+Down extends the selection
  await page.keyboard.press("Enter");
  await expect(layer(page, "0")).toHaveAttribute("aria-selected", "true");
  await expect(layer(page, "")).toHaveAttribute("aria-selected", "false");
  await page.keyboard.press("Shift+ArrowDown");
  await expect(layer(page, "0.0")).toHaveAttribute("aria-selected", "true");
  await expect(layer(page, "0")).toHaveAttribute("aria-selected", "true");
  // F2 renames the focused row in place; Escape in the field keeps the name, Enter commits
  await layer(page, "0").focus();
  await page.keyboard.press("F2");
  await page.keyboard.type("Nope");
  await page.keyboard.press("Escape");
  await expect(layer(page, "0")).toHaveText("Row");
  await expect(layer(page, "0")).toBeFocused();
  await page.keyboard.press("F2");
  await page.keyboard.type("Top");
  await page.keyboard.press("Enter");
  await expect(layer(page, "0")).toHaveText("Top");
  await expect(layer(page, "0")).toBeFocused();
  // double-click renames too
  await layer(page, "1").locator("span").filter({ hasText: "Value" }).dblclick();
  await page.getByLabel("Rename Value").fill("Temp");
  await page.keyboard.press("Enter");
  await expect(layer(page, "1")).toHaveText("Temp");
  // type-ahead: "t" goes to the next row starting with it, "te" to Temp
  await layer(page, "").focus();
  await page.keyboard.type("te");
  await expect(layer(page, "1")).toBeFocused();
  // Escape: back to the widget's card
  await page.keyboard.press("Escape");
  await expect(layer(page, "")).toHaveAttribute("aria-selected", "true");
  await expect(layer(page, "")).toBeFocused();
});

test("Copy and Paste within a recipe and into another; a refused paste says why; Cut and Paste is one undo step", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  await newWidget(page, scratch.base);
  await blocks(page, ["ring", "repeat"]);
  expect(await layers(page)).toEqual([" New widget", "0 Ring", "1 Repeat · Locations"]);
  // Ctrl+C on the ring's row, Ctrl+V on the root's: at the card's end
  await layer(page, "0").click();
  await page.keyboard.press("Control+c");
  await expect(said(page)).toHaveText("Copied Ring");
  await layer(page, "").click();
  await page.keyboard.press("Control+v");
  expect(await layers(page)).toEqual([" New widget", "0 Ring", "1 Repeat · Locations", "2 Ring"]);
  await expect(said(page)).toHaveText("Pasted Ring into New widget");
  // a Repeat into the Repeat: refused, with the reason under Layers and said
  await layer(page, "1").click();
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  await expect(page.locator("[data-move-why]")).toHaveText("A Repeat can't go inside another Repeat");
  await expect(said(page)).toHaveText("A Repeat can't go inside another Repeat");
  expect(await layers(page)).toHaveLength(4);
  // Cut the first ring, paste it after the Repeat: a move, and one Undo puts it back
  const before = await layers(page);
  await layer(page, "0").click();
  await page.keyboard.press("Control+x");
  await layer(page, "1").click();
  await page.keyboard.press("Control+v");
  expect(await layers(page)).toEqual([" New widget", "0 Repeat · Locations", "1 Ring", "2 Ring"]);
  await page.getByRole("button", { name: "Undo (Ctrl+Z)" }).click();
  expect(await layers(page)).toEqual(before);
  await expect(page.getByRole("button", { name: "Undo (Ctrl+Z)" })).toBeEnabled();

  // into a second recipe: the Repeat brings its Locations option along
  await layer(page, "1").click();
  await page.keyboard.press("Control+c");
  await page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("button", { name: "Widgets" }).click();
  // the bar's New widget (the banner below it names the open draft "New widget" too)
  await page.getByRole("button", { name: "New widget" }).first().click();
  await page.getByLabel("Widget name").fill("Places");
  await page.getByLabel("Widget name").press("Enter");
  await layer(page, "").click();
  await page.keyboard.press("Control+v");
  expect(await layers(page)).toEqual([" Places", "0 Repeat · Locations"]);
  await expect(said(page)).toHaveText("Pasted Repeat · Locations into Places; added the option Locations");
  await expect(page.locator("[data-validation]")).toContainText("No code · 2 blocks · 1 option");
  await page.keyboard.press("Control+s");
  await expect(page.getByText("Saved Places").first()).toBeVisible();
  const r = await stored(scratch.base, "recipe.places");
  expect(r.options).toMatchObject([{ key: "places", type: "place-list" }]);
  expect(r.root.children).toMatchObject([{ type: "repeat", over: "places" }]);
  expect(errors).toEqual([]);
});

test("a selection of several blocks: Wrap in a row is one undo step, stored as it shows; a selection drags and deletes together", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  await newWidget(page, scratch.base);
  await page.getByLabel("Widget name").fill("Wrapped");
  await page.getByLabel("Widget name").press("Enter");
  await blocks(page, ["ring", "value", "label"]);
  // Shift+click a range, Ctrl+click one out of it
  await layer(page, "0").click();
  await layer(page, "2").click({ modifiers: ["Shift"] });
  expect(await page.locator('[data-layer][aria-selected="true"]').count()).toBe(3);
  await expect(page.locator("[data-multi]")).toContainText("3 blocks selected");
  await layer(page, "1").click({ modifiers: ["Control"] });
  expect(await page.locator('[data-layer][aria-selected="true"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-layer")))).toEqual(["0", "2"]);
  await page.keyboard.press("Control+g");
  expect(await layers(page)).toEqual([" Wrapped", "0 Row", "0.0 Ring", "0.1 Label", "1 Value"]);
  await expect(said(page)).toHaveText("Wrapped 2 blocks in a row");
  await page.keyboard.press("Control+z");
  expect(await layers(page)).toEqual([" Wrapped", "0 Ring", "1 Value", "2 Label"]);
  await page.keyboard.press("Control+Shift+z");
  expect(await layers(page)).toEqual([" Wrapped", "0 Row", "0.0 Ring", "0.1 Label", "1 Value"]);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved Wrapped").first()).toBeVisible();
  const r = await stored(scratch.base, "recipe.wrapped");
  expect(r.root.children).toMatchObject([{ type: "row", name: "Row", children: [{ type: "ring" }, { type: "label" }] }, { type: "value" }]);
  expect(r.root.children).toHaveLength(2);

  // the Label (in the Row) and the Value (beside it) dragged together onto the Row's middle: into it, in tree order
  await layer(page, "0.1").click();
  await layer(page, "1").click({ modifiers: ["Control"] });
  const from = (await layer(page, "1").boundingBox())!;
  const to = (await layer(page, "0").boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
  expect(await layers(page)).toEqual([" Wrapped", "0 Row", "0.0 Ring", "0.1 Label", "0.2 Value"]);
  // and deleted together
  await layer(page, "0.0").click();
  await layer(page, "0.2").click({ modifiers: ["Control"] });
  await page.keyboard.press("Delete");
  expect(await layers(page)).toEqual([" Wrapped", "0 Row", "0.0 Label"]);
  expect(errors).toEqual([]);
});

/** Drags an "Add a block" tile to a point, by the mouse. */
async function dragTile(page: Page, type: string, x: number, y: number) {
  const t = (await page.locator(`[data-add-block="${type}"]`).boundingBox())!;
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 10 });
  // the browser sends the drag's dragover to where it rests only after a further move
  await page.mouse.move(x + 1, y);
  await page.mouse.move(x + 2, y);
}

test("a tile dragged onto Layers lands at the line, onto the widget by the block it is over; a refused drop says why", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  await newWidget(page, scratch.base);
  await blocks(page, ["value", "label", "repeat"]);
  // onto the top edge of the Label's row: before it
  const label = (await layer(page, "1").boundingBox())!;
  await dragTile(page, "gauge", label.x + label.width / 2, label.y + 3);
  await expect(layer(page, "1")).toHaveAttribute("data-drop", "above");
  await page.mouse.up();
  expect(await layers(page)).toEqual([" New widget", "0 Value", "1 Gauge", "2 Label", "3 Repeat · Locations"]);
  await expect(layer(page, "1")).toHaveAttribute("aria-current", "true");
  // onto the widget, over the lower half of the Value: after it
  const value = (await page.locator('[data-builder-stage] [data-recipe-path="0"]').first().boundingBox())!;
  await dragTile(page, "bar", value.x + value.width / 2, value.y + value.height * 0.75);
  await expect(page.locator("[data-stage-drop]")).toHaveAttribute("data-stage-drop", "after");
  await page.mouse.up();
  expect(await layers(page)).toEqual([" New widget", "0 Value", "1 Bar", "2 Gauge", "3 Label", "4 Repeat · Locations"]);
  await expect(said(page)).toHaveText("Added Bar after Value");
  // a Repeat onto the Repeat's middle: refused at the line, and the reason stays when the drag ends
  const rep = (await layer(page, "4").boundingBox())!;
  await dragTile(page, "repeat", rep.x + rep.width / 2, rep.y + rep.height / 2);
  await expect(layer(page, "4")).toHaveAttribute("data-drop", "refused");
  await expect(page.locator("[data-drop-why]")).toHaveText("A Repeat can't go inside another Repeat");
  await page.mouse.up();
  await expect(page.locator("[data-move-why]")).toHaveText("A Repeat can't go inside another Repeat");
  expect(await layers(page)).toHaveLength(6);
  // a click still adds
  await layer(page, "").click();
  await add(page, "label");
  expect(await layers(page)).toHaveLength(7);
  expect(errors).toEqual([]);
});

test("Ctrl+S saves the recipe (not the page), Discard goes back to the stored version, Close asks when there are unsaved changes", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  await newWidget(page, scratch.base);
  await add(page, "ring");
  // the key's default (the browser's Save page dialog) is prevented before the page's own listeners see it
  await page.evaluate(() => window.addEventListener("keydown", (e) => e.key === "s" && ((window as unknown as { saveKey: boolean }).saveKey = e.defaultPrevented)));
  await layer(page, "0").click();
  await page.keyboard.press("Control+s");
  await expect(page.getByText("Saved New widget").first()).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { saveKey: boolean }).saveKey)).toBe(true);
  await expect(page.getByText("Recipe · saved")).toBeVisible();
  const first = await (await fetch(`${scratch.base}/api/widgets/recipe.new-widget/recipe.json`)).text();
  expect(JSON.parse(first).root.children).toMatchObject([{ type: "ring" }]);
  // untouched, Ctrl+S stores nothing: the stored bytes stay as they are
  await page.keyboard.press("Control+s");
  await expect(said(page)).toHaveText("Saved already");
  expect(await (await fetch(`${scratch.base}/api/widgets/recipe.new-widget/recipe.json`)).text()).toBe(first);
  // Ctrl+S while a field is typed: it commits first, then saves (1.0.1)
  await layer(page, "").click();
  await page.getByLabel("Title", { exact: true }).fill("Typed title");
  await page.keyboard.press("Control+s");
  await expect.poll(async () => (await stored(scratch.base, "recipe.new-widget")).root.title).toBe("Typed title");
  expect((await stored(scratch.base, "recipe.new-widget")).version).toBe("1.0.1");

  // an edit, then Discard: it asks, then goes back to the stored version (one undo step)
  await layer(page, "").click();
  await add(page, "value");
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await page.getByRole("button", { name: "Discard changes" }).click();
  const ask = page.getByRole("alertdialog");
  await expect(ask).toContainText("Discard your changes to New widget?");
  await expect(ask).toContainText("It goes back to the saved 1.0.1");
  await ask.getByRole("button", { name: "Discard changes" }).click();
  expect(await layers(page)).toEqual([" Typed title", "0 Ring"]);
  await expect(page.getByText("Recipe · saved")).toBeVisible();
  await page.getByRole("button", { name: "Undo (Ctrl+Z)" }).click();
  expect(await layers(page)).toEqual([" Typed title", "0 Ring", "1 Value"]);

  // Close with unsaved changes asks; Keep it open keeps it, Close without saving drops the draft
  await page.getByRole("button", { name: "Close New widget" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Close New widget without saving?");
  await page.getByRole("button", { name: "Keep it open" }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(await layers(page)).toHaveLength(3);
  await page.getByRole("button", { name: "Close New widget" }).click();
  await page.getByRole("button", { name: "Close without saving" }).click();
  await expect(page.locator("[data-layer]")).toHaveCount(0);
  await expect(page.locator("[data-unsaved-recipes]")).toHaveCount(0);
  expect((await stored(scratch.base, "recipe.new-widget")).root.children).toHaveLength(1);
  // a draft in the browse banner: Discard asks, then it is gone (the bar's New widget: the saved recipe's card has the name too)
  await page.getByRole("button", { name: "New widget" }).first().click();
  await add(page, "label");
  await widgetsPage(page);
  await page.getByRole("button", { name: "Discard New widget" }).click();
  await page.getByRole("button", { name: "Close without saving" }).click();
  await expect(page.locator("[data-unsaved-recipes]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a warning dot marks each Layers row the problem list names, and leaves when the problem is fixed", async ({ page, scratch }) => {
  await newWidget(page, scratch.base);
  await blocks(page, ["ring", "value"]);
  const decimals = page.getByLabel("Decimals", { exact: true });
  await decimals.fill("9");
  await decimals.press("Enter");
  await layer(page, "0").click();
  await decimals.fill("8");
  await decimals.press("Enter");
  // the errors, then what the stage measures at its size: a 9-decimal value is too long for a ring at 3×2
  await expect(page.locator("[data-problems] button")).toHaveText(["Ring · Decimals: from 0 to 4", "Value · Decimals: from 0 to 4", "At 3×2, Ring is too small for its value"]);
  const dots = page.locator("[data-layer]:has([data-problem-dot])");
  expect(await dots.evaluateAll((els) => els.map((e) => e.getAttribute("data-layer")))).toEqual(["0", "1"]);
  await expect(layer(page, "0").getByRole("img", { name: "Has a problem" })).toHaveAttribute("title", "Ring · Decimals: from 0 to 4\nAt 3×2, Ring is too small for its value");
  await decimals.fill("1");
  await decimals.press("Enter");
  // the stage measures its crowding after it redraws, so the Ring's dot leaves a moment after its error does
  await expect.poll(() => dots.evaluateAll((els) => els.map((e) => e.getAttribute("data-layer")))).toEqual(["1"]);
  await layer(page, "1").click();
  await decimals.fill("2");
  await decimals.press("Enter");
  await expect(dots).toHaveCount(0);
});

// builder plan Phase 4: Layers' search, "Move to" and "Select" in the layer menu, and hide and lock kept across a reload (D Q3)
test("Layers: search, Move to and Select from the menu, and hide and lock kept across a reload", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  await newWidget(page, scratch.base);
  await blocks(page, ["row", "value"]);
  await layer(page, "0").click();
  await add(page, "ring");
  expect(await layers(page)).toEqual([" New widget", "0 Row", "0.0 Ring", "1 Value"]);
  // the search: the matches with the rows holding them (dimmed), then none, then Escape brings every row back
  const search = page.getByRole("searchbox", { name: "Search layers" });
  await search.fill("ring");
  expect(await layers(page)).toEqual([" New widget", "0 Row", "0.0 Ring"]);
  await expect(page.locator("[data-layer-header]")).toHaveCount(0);
  await search.press("ArrowDown");
  await expect(layer(page, "")).toBeFocused();
  await search.fill("nothing like it");
  await expect(page.locator("[data-layers-none]")).toHaveText("No block is named like that");
  expect(await layers(page)).toEqual([]);
  await search.press("Escape");
  await expect(search).toHaveValue("");
  expect(await layers(page)).toEqual([" New widget", "0 Row", "0.0 Ring", "1 Value"]);
  // Move to, by mouse: the Value into the Row (the card it is in is not offered)
  await layer(page, "1").click({ button: "right" });
  const menuEl = page.getByTestId("builder-layer-menu");
  await menuEl.getByRole("menuitem", { name: "Move to" }).click();
  await expect(menuEl.locator('[data-sub="move-to"]').getByRole("menuitem")).toHaveText(["Row"]);
  await menuEl.locator('[data-sub="move-to"]').getByRole("menuitem", { name: "Row" }).click();
  expect(await layers(page)).toEqual([" New widget", "0 Row", "0.0 Ring", "0.1 Value"]);
  await expect(said(page)).toHaveText(/Moved Value into Row/);
  // and by keyboard, back to the card: Shift+F10, down to Move to, Right opens it, Enter picks
  await layer(page, "0.1").focus();
  await page.keyboard.press("Shift+F10");
  for (let n = 0; n < 16; n++) {
    if ((await page.evaluate(() => document.activeElement?.textContent ?? "")).startsWith("Move to")) break;
    await page.keyboard.press("ArrowDown");
  }
  await page.keyboard.press("ArrowRight");
  await expect(menuEl.locator('[data-sub="move-to"] [role="menuitem"]').first()).toBeFocused();
  await page.keyboard.press("Enter");
  expect(await layers(page)).toEqual([" New widget", "0 Row", "0.0 Ring", "1 Value"]);
  // Select children of the Row, then Select parent of its Ring
  await layer(page, "0").click({ button: "right" });
  await menuEl.getByRole("menuitem", { name: "Select", exact: true }).click();
  await menuEl.getByRole("menuitem", { name: "Select children" }).click();
  await expect(layer(page, "0.0")).toHaveAttribute("aria-selected", "true");
  await expect(layer(page, "0")).toHaveAttribute("aria-selected", "false");
  await layer(page, "0.0").click({ button: "right" });
  await menuEl.getByRole("menuitem", { name: "Select", exact: true }).click();
  await menuEl.getByRole("menuitem", { name: "Select parent" }).click();
  await expect(layer(page, "0")).toHaveAttribute("aria-selected", "true");
  await expect(layer(page, "0.0")).toHaveAttribute("aria-selected", "false");
  // hide the Ring and lock the Value; after a reload the draft opens with both as they were
  await page.getByRole("button", { name: "Hide Ring on the stage" }).click();
  await page.getByRole("button", { name: "Lock Value" }).click();
  await page.reload();
  await widgetsPage(page);
  await page.locator("[data-unsaved-recipes]").getByRole("button", { name: "New widget", exact: true }).click();
  await expect(layer(page, "0.0")).toHaveAttribute("data-hidden", "");
  await expect(layer(page, "1")).toHaveAttribute("data-locked", "");
  await expect(page.locator('[data-builder-stage] [data-recipe-path="0.0"]')).toHaveCSS("visibility", "hidden");
  expect(errors).toEqual([]);
});

test("B17: from the Widgets page the studio's keys leave the screen in Edit alone (Delete in browse, Ctrl+Z in the builder)", async ({ page, scratch }) => {
  const local = fs.readFileSync(path.join(scratch.dataDir, "config.json"), "utf8");
  await page.addInitScript((value) => localStorage.setItem("infopanel-dashboard:config:v1", value), local);
  await page.goto(`${scratch.base}/?studio=1`);
  const edit = () => page.getByRole("navigation", { name: "Studio views" }).getByRole("button", { name: /^Edit / }).click();
  await edit();
  await page.locator('[data-zone-id="perf-statusbar"]').click();
  const name = page.getByLabel("Widget name");
  await name.fill("Edited zone");
  await name.press("Enter");
  // the zone stays selected in Edit while the Widgets page is open: Delete there removed it (main 74863892)
  await widgetsPage(page);
  await expect(page.getByRole("button", { name: "New widget" })).toBeVisible();
  await page.keyboard.press("Delete");
  await edit();
  await expect(page.locator('[data-zone-id="perf-statusbar"]')).toHaveCount(1);
  // Ctrl+Z in the builder undid the builder's step and the screen's last edit (the zone's name) both
  await widgetsPage(page);
  await page.getByRole("button", { name: "New widget" }).click();
  await add(page, "ring");
  await layer(page, "0").click();
  await page.keyboard.press("Control+z");
  expect(await layers(page)).toEqual([" New widget"]);
  await edit();
  await page.locator('[data-zone-id="perf-statusbar"]').click();
  await expect(page.getByLabel("Widget name")).toHaveValue("Edited zone");
});

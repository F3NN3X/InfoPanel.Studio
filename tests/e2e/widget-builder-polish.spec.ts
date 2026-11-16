import type { Page } from "@playwright/test";
import { expect, test, watchErrors } from "./fixtures";

// Builder audit Phase D: the polish only a browser shows. Hide and lock on the stage, never saved (G25), the Header row (G37), a new
// Image that asks for its picture first (G32), snippets (G35), the offer to remove what a delete left unused (G34) and B22; and the saved
// controls of Phase D (G28-G31) set by clicks, read back from the recipe.json the server holds, exported and imported byte for byte.

const CPU = "amd_ryzen_9_9950x3d";
/** A 1x1 PNG. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

const widgetsPage = (page: Page) => page.getByRole("navigation", { name: "Studio views" }).getByRole("button", { name: "Widgets", exact: true }).click();
async function newWidget(page: Page, base: string, name: string) {
  await page.goto(`${base}/?studio=1`);
  await widgetsPage(page);
  await page.getByRole("button", { name: "New widget" }).click();
  await type(page, "Widget name", name);
}
/** Types into a builder field and commits it (Enter). */
async function type(page: Page, label: string, value: string) {
  const field = page.getByLabel(label, { exact: true });
  await field.fill(value);
  await field.press("Enter");
}
const layer = (page: Page, path: string) => page.locator(`[data-layer="${path}"]`);
const add = (page: Page, type: string) => page.locator(`[data-add-block="${type}"]`).click();
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true }).click();
const onStage = (page: Page, path: string) => page.locator(`[data-recipe-zone] [data-recipe-path="${path}"]`);
const storedText = async (base: string, key: string) => (await fetch(`${base}/api/widgets/${key}/recipe.json`)).text();
/**
 * Saves and waits for the save to be done: the bar's chip says saved only once the server has stored it. A second save's "Saved …"
 * toast is no sign, since the first one's may still be up.
 */
async function save(page: Page, name: string) {
  await expect(page.getByText("Recipe · saved", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Recipe · saved", { exact: true })).toBeVisible();
  await expect(page.getByText(`Saved ${name}`).first()).toBeVisible();
}

test("hide and lock act on the stage only and never reach recipe.json; the Header row opens the card's title, sub-title and icon (G25, G37)", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  await newWidget(page, scratch.base, "Flag card");
  await add(page, "ring");
  await layer(page, "").click();
  await add(page, "value");
  await expect(onStage(page, "1")).toBeVisible();

  // the eye hides the Value on the stage (it keeps its room); its row says so
  await layer(page, "1").hover();
  await page.getByRole("button", { name: "Hide Value on the stage" }).click();
  await expect(layer(page, "1")).toHaveAttribute("data-hidden", "");
  await expect(onStage(page, "1")).toHaveCSS("visibility", "hidden");
  await expect(onStage(page, "0")).toHaveCSS("visibility", "visible");
  // the lock: a click on the Ring on the stage picks the card instead, and its row does not drag
  await layer(page, "0").hover();
  await page.getByRole("button", { name: "Lock Ring" }).click();
  await expect(layer(page, "0")).toHaveAttribute("draggable", "false");
  await onStage(page, "0").click();
  await expect(layer(page, "")).toHaveAttribute("aria-current", "true");
  // a hidden block still follows its block through an edit: Alt+↑ moves the Value above the Ring
  await layer(page, "1").click();
  await layer(page, "1").press("Alt+ArrowUp");
  await expect(layer(page, "0")).toHaveAttribute("data-hidden", "");
  await expect(onStage(page, "0")).toHaveCSS("visibility", "hidden");
  await expect(layer(page, "1")).toHaveAttribute("data-locked", "");
  await page.locator("[data-builder-stage]").screenshot({ path: test.info().outputPath("hidden-and-locked.png") });

  // the Header row: the card's title, sub-title and icon on their own, picked in Layers or on the stage's header
  await page.locator("[data-layer-header]").click();
  await expect(page.locator("[data-header-tab]")).toBeVisible();
  await type(page, "Title", "Flags");
  await expect(page.locator("[data-recipe-zone] [data-part='header']")).toContainText("Flags");
  await layer(page, "1").click();
  await expect(page.locator("[data-header-tab]")).toHaveCount(0);
  await page.locator("[data-recipe-zone] [data-part='header']").click();
  await expect(page.locator("[data-layer-header]")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Flags");

  await save(page, "Flag card");
  const text = await storedText(scratch.base, "recipe.flag-card");
  expect(text).not.toMatch(/hidden|locked|visibility/i);
  const r = JSON.parse(text);
  expect(r.root).toMatchObject({ title: "Flags", children: [{ type: "value" }, { type: "ring" }] });
  expect(Object.keys(r.root.children[0]).sort()).toEqual(["bind", "label", "type"]);
  expect(Object.keys(r.root.children[1]).sort()).toEqual(["bind", "color", "max", "min", "type"]);
  expect(errors).toEqual([]);
});

test("a new Image asks for its picture first, snippets add a Row of blocks, a delete offers to remove the option it left unused, and a deleted picture is not saved (G32, G34, G35, B22)", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  await newWidget(page, scratch.base, "Odds");
  // the chooser closed with no file: no block, Save stays as it was
  const [none] = await Promise.all([page.waitForEvent("filechooser"), add(page, "image")]);
  await none.setFiles([]);
  await expect(layer(page, "0")).toHaveCount(0);
  // a picture picked: the Image is added with it, and the recipe is valid at once
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), add(page, "image")]);
  await chooser.setFiles({ name: "Logo.png", mimeType: "image/png", buffer: PNG });
  await expect(layer(page, "0")).toHaveAttribute("aria-current", "true");
  await expect(onStage(page, "0").locator("img")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();

  // a snippet: a Row with its blocks, where Add puts a block
  await layer(page, "").click();
  await page.locator('[data-add-snippet="ring-caption"]').click();
  await expect(layer(page, "1")).toContainText("Ring with a caption");
  await expect(layer(page, "1.0")).toContainText("Ring");
  await expect(layer(page, "1.1")).toContainText("Caption");
  await layer(page, "").click();
  await page.locator('[data-add-snippet="label-value-bar"]').click();
  await expect(layer(page, "2.2")).toContainText("Bar");

  // a Repeat brings its Locations option; deleting it (with the Image) offers to remove the option, as one undo step with the delete
  await layer(page, "").click();
  await add(page, "repeat");
  await expect(layer(page, "3")).toContainText("Repeat · Locations");
  await layer(page, "0").click();
  await layer(page, "3").click({ modifiers: ["Control"] });
  await layer(page, "3").press("Delete");
  const offer = page.locator("[data-clean-up]");
  await expect(offer).toContainText("Not used by a block now: Locations");
  await page.locator("[data-builder-stage]").screenshot({ path: test.info().outputPath("snippets.png") });
  await offer.getByRole("button", { name: "Also remove Locations (not used now)" }).click();
  await expect(offer).toHaveCount(0);
  await tab(page, "Options");
  await expect(page.locator("[data-option]")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo (Ctrl+Z)" }).click();
  await expect(page.locator('[data-option="places"]')).toHaveCount(1);
  await expect(layer(page, "3")).toContainText("Repeat · Locations");
  await expect(layer(page, "0")).toContainText("Image");
  // Keep leaves them, and the offer goes with the next edit
  await layer(page, "3").click();
  await layer(page, "3").press("Delete");
  await expect(offer).toContainText("Locations");
  await offer.getByRole("button", { name: "Keep" }).click();
  await expect(offer).toHaveCount(0);
  await tab(page, "Options");
  await expect(page.locator('[data-option="places"]')).toHaveCount(1);
  await save(page, "Odds");
  let r = JSON.parse(await storedText(scratch.base, "recipe.odds"));
  expect(r.format).toBe(1);
  expect(r.root.children.map((b: { type: string; name?: string }) => b.name ?? b.type)).toEqual(["image", "Ring with a caption", "Label, value and bar"]);
  expect(r.root.children[0]).toEqual({ type: "image", file: "images/logo.png", fit: "contain" });
  expect((await fetch(`${scratch.base}/api/widgets/recipe.odds/images/logo.png`)).status).toBe(200);

  // B22: the Image deleted, the next save leaves its picture out of the package (it stayed in on main)
  await layer(page, "0").click();
  await layer(page, "0").press("Delete");
  await expect(layer(page, "0")).toContainText("Ring with a caption");
  await save(page, "Odds");
  r = JSON.parse(await storedText(scratch.base, "recipe.odds"));
  expect(r.root.children.map((b: { type: string; name?: string }) => b.name ?? b.type)).toEqual(["Ring with a caption", "Label, value and bar"]);
  expect((await fetch(`${scratch.base}/api/widgets/recipe.odds/images/logo.png`)).status).toBe(404);
  expect(errors).toEqual([]);
});

test("the saved controls of Phase D round-trip: up to the size, an option's hint, group and step, a preset's blurb and text value, an image's alt; a weather icon picks text readings (G28-G31, G33)", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  await newWidget(page, scratch.base, "Saved bits");
  await add(page, "value");
  // Up to the size: the Value shows up to 3 columns
  await page.getByLabel("Largest columns", { exact: true }).selectOption("3");
  await expect(page.getByLabel("Largest rows", { exact: true })).toHaveValue("");

  // a weather icon outside a Repeat: no Let people pick, and the picker lists no number reading
  await layer(page, "").click();
  await add(page, "weather-icon");
  await expect(page.getByRole("switch", { name: /Let people pick/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Change the data" }).click();
  await page.getByLabel("Search data points").fill("cpu_total");
  await expect(page.locator(`button[role="option"][title="libre.${CPU}_cpu_total"]`)).toHaveCount(0);
  await page.keyboard.press("Escape");
  await layer(page, "1").press("Delete");

  // an option's hint, group and step
  await tab(page, "Options");
  await page.getByRole("button", { name: "Add an option" }).click();
  await page.getByRole("menuitem", { name: "Number" }).click();
  await page.getByLabel("New option name").fill("Hours");
  await page.getByLabel("New option name").press("Enter");
  await type(page, "Step", "2");
  await type(page, "Hint", "Of forecast, from now");
  await type(page, "Group", "Weather");
  await page.getByRole("button", { name: "Add an option" }).click();
  await page.getByRole("menuitem", { name: "Text" }).click();
  await page.getByLabel("New option name").fill("Note");
  await page.getByLabel("New option name").press("Enter");

  // a preset's blurb and its text value
  await tab(page, "Presets");
  await page.getByRole("button", { name: "Save current as a preset" }).click();
  await page.getByLabel("New preset name").fill("Noted");
  await page.getByLabel("New preset name").press("Enter");
  await type(page, "Blurb", "With a note");
  await type(page, "Note", "Hello");
  await expect(page.locator('[data-preset="noted"]')).toContainText("With a note · 3×2");

  // an image's alt text
  await tab(page, "Block");
  await layer(page, "").click();
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), add(page, "image")]);
  await chooser.setFiles({ name: "chip.png", mimeType: "image/png", buffer: PNG });
  await type(page, "Alt text", "The chip");
  await expect(onStage(page, "1").locator("img")).toHaveAttribute("alt", "The chip");

  await save(page, "Saved bits");
  const text = await storedText(scratch.base, "recipe.saved-bits");
  await test.info().attach("recipe.json", { body: text, contentType: "application/json" });
  const r = JSON.parse(text);
  expect(r.format).toBe(1);
  expect(r.root.children[0].when).toEqual({ size: { max: [3, 12] } });
  expect(r.options).toEqual([
    { key: "hours", label: "Hours", type: "number", default: 8, min: 1, max: 24, step: 2, hint: "Of forecast, from now", group: "Weather" },
    { key: "note", label: "Note", type: "text", default: "" },
  ]);
  expect(r.presets[1]).toEqual({ id: "noted", name: "Noted", settings: { note: "Hello" }, size: [3, 2], blurb: "With a note" });
  expect(r.root.children[1]).toEqual({ type: "image", file: "images/chip.png", fit: "contain", alt: "The chip" });

  // export, take it off the server, import the file: the same bytes again
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export" }).click()]);
  const zip = test.info().outputPath(file.suggestedFilename());
  await file.saveAs(zip);
  expect((await fetch(`${scratch.base}/api/widgets/recipe.saved-bits`, { method: "DELETE", headers: { "X-Dashboard-Widget": "1" } })).ok).toBe(true);
  await page.reload();
  await widgetsPage(page);
  await expect(page.locator('[data-widget-card="recipe:saved-bits"]')).toHaveCount(0);
  await page.getByLabel("Import a widget package").setInputFiles(zip);
  await expect(page.getByText("Imported Saved bits").first()).toBeVisible();
  expect(await storedText(scratch.base, "recipe.saved-bits")).toBe(text);
  expect(errors).toEqual([]);
});

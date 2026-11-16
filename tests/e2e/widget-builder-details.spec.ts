import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, saveConfig, test, watchErrors } from "./fixtures";

// Builder audit Phase B2: a recipe's details set by clicks and shown on its browse card (G7, G8), a sensor option picked with the data
// picker (G15), "Replace sensor…" across the recipe as one undo step (G16), the stage at every size in range (G17), the Sample before
// a save (G18), crowding warnings by Layers name (G19, B11), a row's align stored and drawn on the kiosk (G20), and B16: a column of
// lines stays together. Each stored result is read back from the recipe.json the server holds.

const CPU = "amd_ryzen_9_9950x3d";

const widgetsPage = (page: Page) => page.getByRole("navigation", { name: "Studio views" }).getByRole("button", { name: "Widgets", exact: true }).click();
async function newWidget(page: Page, base: string, query = "") {
  await page.goto(`${base}/?studio=1${query}`);
  await widgetsPage(page);
  await page.getByRole("button", { name: "New widget" }).click();
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
const radio = (page: Page, group: string, name: string) => page.getByRole("radiogroup", { name: group, exact: true }).getByRole("radio", { name, exact: true }).click();
const stored = async (base: string, key: string) => (await fetch(`${base}/api/widgets/${key}/recipe.json`)).json();
/** The data point of `key` in an open data picker. */
async function pick(page: Page, key: string) {
  await page.getByLabel("Search data points").fill(key.split(".")[1]);
  await page.locator(`button[role="option"][title="${key}"]`).click();
}
async function save(page: Page, name: string) {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(`Saved ${name}`).first()).toBeVisible();
}
/** Sets the stage's size in its column and row boxes. */
async function stageSize(page: Page, cols: number, rows: number) {
  await type(page, "Stage columns", String(cols));
  await type(page, "Stage rows", String(rows));
}

test("details: description, category and icons are set by clicks, stored, and shown on the browse card (G7, G8)", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  await newWidget(page, scratch.base);
  await type(page, "Widget name", "Disk card");
  await add(page, "value");
  await layer(page, "").click();
  await type(page, "Description", "Drive load and free space. One glance");
  await type(page, "Category", "Hardware");
  await radio(page, "Icon", "hard drive");
  await radio(page, "Header icon", "memory");
  await expect(page.locator("[data-version]")).toHaveText("1.0.0");
  await save(page, "Disk card");
  await expect(page.locator("[data-version]")).toHaveText("1.0.0 · next save 1.0.1");
  const r = await stored(scratch.base, "recipe.disk-card");
  expect({ description: r.description, category: r.category, icon: r.icon, header: r.root.icon }).toEqual({ description: "Drive load and free space. One glance", category: "Hardware", icon: "hard_drive", header: "memory" });
  // the header icon back to the widget's: the key goes
  await radio(page, "Header icon", "The widget's icon");
  await save(page, "Disk card");
  expect((await stored(scratch.base, "recipe.disk-card")).root.icon).toBeUndefined();
  await page.getByRole("button", { name: "Widgets", exact: true }).first().click();
  const card = page.locator('[data-widget-card="recipe:disk-card"]');
  await expect(card.locator("[data-card-icon]")).toHaveAttribute("data-card-icon", "hard_drive");
  await expect(card.locator("[data-card-line]")).toHaveText("Hardware · Drive load and free space");
  expect(errors).toEqual([]);
});

test("a sensor option's default is picked with the data picker (G15)", async ({ page, scratch }) => {
  await newWidget(page, scratch.base);
  await type(page, "Widget name", "Picked");
  await add(page, "value");
  await tab(page, "Options");
  await page.getByText("Add an option").click();
  await page.getByRole("menuitem", { name: "Sensor", exact: true }).click();
  await page.getByLabel("New option name").fill("Watched");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("button", { name: "Default sensor" })).toContainText("No sensor yet");
  await page.getByRole("button", { name: "Default sensor" }).click();
  await pick(page, `libre.${CPU}_package`);
  await expect(page.getByRole("button", { name: "Default sensor" })).toContainText(`libre.${CPU}_package`);
  await save(page, "Picked");
  expect((await stored(scratch.base, "recipe.picked")).options).toEqual([{ key: "watched", label: "Watched", type: "sensor", default: `libre.${CPU}_package` }]);
});

test("Replace sensor swaps a key across the recipe, lists what it changed, and Undo takes it back in one step (G16)", async ({ page, scratch }) => {
  await newWidget(page, scratch.base);
  await type(page, "Widget name", "Swap");
  for (const t of ["ring", "value", "sparkline"]) {
    await layer(page, "").click();
    await add(page, t);
  }
  await layer(page, "1").click();
  await page.getByRole("button", { name: "Replace sensor…" }).click();
  await pick(page, `libre.${CPU}_package`);
  await expect(page.locator("[data-replaced] li")).toHaveText(["Ring", "Value", "Sparkline"]);
  await save(page, "Swap");
  const binds = async () => (await stored(scratch.base, "recipe.swap")).root.children.map((b: { bind: { sensor: string } }) => b.bind.sensor);
  expect(await binds()).toEqual([`libre.${CPU}_package`, `libre.${CPU}_package`, `libre.${CPU}_package`]);
  await page.getByRole("button", { name: "Undo (Ctrl+Z)" }).click();
  await save(page, "Swap");
  expect(await binds()).toEqual([`libre.${CPU}_cpu_total`, `libre.${CPU}_cpu_total`, `libre.${CPU}_cpu_total`]);
});

test("the stage previews every span from the smallest size to the largest, and no other (G17)", async ({ page, scratch }) => {
  await newWidget(page, scratch.base);
  await add(page, "value");
  const zone = page.locator("[data-recipe-zone]");
  for (const cols of [2, 3, 4])
    for (const rows of [2, 3]) {
      await stageSize(page, cols, rows);
      await expect(zone).toHaveCSS("width", `${cols * 120 + (cols - 1) * 8}px`);
      await expect(zone).toHaveCSS("height", `${rows * 100 + (rows - 1) * 8}px`);
    }
  // outside the range (2×2 to 4×3): the nearest size in it
  await stageSize(page, 9, 1);
  await expect(page.getByLabel("Stage columns")).toHaveValue("4");
  await expect(page.getByLabel("Stage rows")).toHaveValue("2");
});

test("an unsaved new recipe shows sample data on the stage (G18)", async ({ page, scratch }) => {
  await newWidget(page, scratch.base);
  await add(page, "value");
  await radio(page, "Data", "Sample");
  // the reading the Sample took from the live data when the block was bound, not a dash
  await expect(page.locator('[data-recipe-zone] [data-recipe-path="0"]')).toHaveText(/Value\s*\d/);
});

test("crowding: at a crowded size a warning names the block, as a Layers dot; it leaves when the block fits (G19, B11)", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  await newWidget(page, scratch.base);
  await add(page, "label");
  await type(page, "Name in Layers", "Caption");
  await type(page, "Words", "The processor's package temperature, averaged");
  await stageSize(page, 2, 2);
  const line = page.locator("[data-validation]");
  await expect(line.locator("[data-warning]")).toHaveText("At 2×2, Caption is cut");
  await expect(line.locator("[data-fits]")).toHaveCount(0);
  await expect(layer(page, "0").getByRole("img", { name: "Has a problem" })).toHaveAttribute("title", "At 2×2, Caption is cut");
  // a warning does not stop a save
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await stageSize(page, 4, 3);
  await expect(line.locator("[data-fits]")).toHaveText(" · fits at 4×3");
  await expect(line.locator("[data-warning]")).toHaveCount(0);
  await expect(page.locator("[data-problem-dot]")).toHaveCount(0);
  // two blocks over each other: named both ways, and a click selects the one it is on
  await layer(page, "").click();
  await add(page, "ring");
  for (let n = 0; n < 4; n++) {
    await layer(page, "").click();
    await add(page, "gauge");
  }
  await stageSize(page, 2, 2);
  const warnings = page.locator("[data-problems] [data-warning]");
  await expect(warnings.filter({ hasText: /is too small for its value|overlaps/ }).first()).toBeVisible();
  await warnings.filter({ hasText: "Ring is too small for its value" }).click();
  await expect(layer(page, "1")).toHaveAttribute("aria-selected", "true");
  expect(errors).toEqual([]);
});

test("a row's align is stored and drawn on the kiosk (G20)", async ({ page, scratch }) => {
  const config = await (await fetch(`${scratch.base}/api/config`)).json();
  const desk = { ...config.profiles[0], id: "desk", name: "Desk", pages: [{ id: "main", name: "Main", placements: [] }] };
  expect((await saveConfig(scratch.base, { ...config, profiles: [desk, ...config.profiles] })).ok).toBe(true);
  await newWidget(page, scratch.base, "&profile=desk");
  await type(page, "Widget name", "Aligned");
  await add(page, "row");
  await add(page, "ring");
  await layer(page, "0").click();
  await add(page, "value");
  await layer(page, "0").click();
  await radio(page, "Align", "Centre");
  await expect(page.locator('[data-recipe-zone] [data-recipe-path="0.1"]')).toHaveCSS("align-items", "center");
  await save(page, "Aligned");
  expect((await stored(scratch.base, "recipe.aligned")).root.children[0]).toMatchObject({ type: "row", align: "center" });
  await page.getByRole("button", { name: "Add to a screen" }).click();
  await expect(page.getByText("Added Aligned to Desk").first()).toBeVisible();
  await page.keyboard.press("Control+s");
  await expect
    .poll(async () => (await (await fetch(`${scratch.base}/api/config`)).json()).profiles.find((p: { id: string }) => p.id === "desk").pages[0].placements.map((z: { module: string }) => z.module), { timeout: 5000 })
    .toEqual(["recipe:aligned"]);
  await page.goto(`${scratch.base}/?profile=desk`);
  await expect(page.locator('[data-recipe="recipe:aligned"] [data-recipe-path="0.1"]')).toHaveCSS("align-items", "center");
  await expect(page.locator('[data-recipe="recipe:aligned"] [data-recipe-path="0.0"]')).toHaveCSS("align-items", "center");
});

/** Stores a recipe fixture package (`tests/fixtures/recipes/<name>`) on the server, as an import. */
async function storeFixture(base: string, name: string) {
  const dir = path.join("tests/fixtures/recipes", name);
  const files = ["manifest.json", "recipe.json"].map((p) => ({ path: p, data: fs.readFileSync(path.join(dir, p)).toString("base64") }));
  const res = await fetch(`${base}/api/widgets`, { method: "POST", headers: { "Content-Type": "application/json", "X-Dashboard-Widget": "1" }, body: JSON.stringify({ files }) });
  expect(res.ok).toBe(true);
}

test("B16: Weather · places' City and condition stay together, not spread over the place's height", async ({ page, scratch }) => {
  await storeFixture(scratch.base, "weather-places");
  await page.goto(`${scratch.base}/?studio=1`);
  await widgetsPage(page);
  await page.locator('[data-widget-card="recipe:weather-places"]').dblclick();
  await radio(page, "Data", "Sample");
  // One place: the place has the whole card, which the lines used to be spread over (a third each, the text at the top of each)
  await tab(page, "Presets");
  await page.locator('[data-preset="one"] button[aria-pressed]').click();
  await expect(page.locator("[data-recipe-zone] [data-recipe-item]")).toHaveCount(1);
  const item = page.locator("[data-recipe-zone] [data-recipe-item]").first();
  await expect(item).toBeVisible();
  // the city's line and the condition's, in the first place, by their text
  const lines = await item.locator('[data-recipe-path="0.2"] [data-recipe-path]').evaluateAll((els) =>
    els.map((el) => {
      // the text itself, not the element holding it (which fills its share of the column)
      const text = document.createTreeWalker(el, NodeFilter.SHOW_TEXT).nextNode()!;
      const r = document.createRange();
      r.selectNodeContents(text);
      const b = r.getBoundingClientRect();
      return { top: b.top, bottom: b.bottom };
    }),
  );
  const column = await item.locator('[data-recipe-path="0.2"]').evaluate((el) => {
    const b = el.getBoundingClientRect();
    return { top: b.top, bottom: b.bottom };
  });
  // the city, the temperature and the condition
  expect(lines).toHaveLength(3);
  // the column's gap is 2 px: each line starts right under the one before, and the three sit in the middle of the room they have
  for (const k of [1, 2]) expect(lines[k].top - lines[k - 1].bottom).toBeLessThan(8);
  expect(Math.abs((lines[0].top + lines[2].bottom) / 2 - (column.top + column.bottom) / 2)).toBeLessThan(6);
  // opened, looked at and left alone, the format 2 recipe stays as it was stored, byte for byte
  await expect(page.getByText("Recipe · saved")).toBeVisible();
  expect(await (await fetch(`${scratch.base}/api/widgets/recipe.weather-places/recipe.json`)).text()).toBe(fs.readFileSync("tests/fixtures/recipes/weather-places/recipe.json", "utf8"));
});

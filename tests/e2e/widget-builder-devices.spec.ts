import fs from "node:fs";
import type { Page } from "@playwright/test";
import { expect, saveConfig, test, watchErrors } from "./fixtures";

// Builder audit Phase F (G38): a Repeat over the drives, cores, fans, adapters and GPUs the readings name, and a grid container, recipe
// format 2. The three proof recipes are built by clicks, read back from the recipe.json the server holds and drawn on the kiosk on the
// scratch server's readings (the fake Data API's captured snapshot, `src/widgets/__fixtures__`: two drives, a 16-core CPU's 32 threads,
// five fans in RPM). "Drives", "Cores" (with a grid's columns and spacing) and "Adapters and GPUs" are exported and imported byte for
// byte. Crowding still names a block inside a grid's Repeat.

const widgetsPage = (page: Page) => page.getByRole("navigation", { name: "Studio views" }).getByRole("button", { name: "Widgets", exact: true }).click();
/** Types into a builder field and commits it (Enter). */
async function type(page: Page, label: string, value: string) {
  const field = page.getByLabel(label, { exact: true });
  await field.fill(value);
  await field.press("Enter");
}
const layer = (page: Page, path: string) => page.locator(`[data-layer="${path}"]`);
const add = (page: Page, type: string) => page.locator(`[data-add-block="${type}"]`).click();
const radio = (page: Page, group: string, name: string) => page.getByRole("radiogroup", { name: group, exact: true }).getByRole("radio", { name, exact: true }).click();
const storedText = async (base: string, key: string) => (await fetch(`${base}/api/widgets/${key}/recipe.json`)).text();
const repeatOver = (page: Page, source: string) => page.getByLabel("List", { exact: true }).selectOption(source);
const field = (page: Page, name: string) => page.getByLabel("Field", { exact: true }).selectOption(name);

/** A screen "Desk" with an empty page, opened in the studio's Widgets page with a new recipe named `name`. */
async function newWidget(page: Page, base: string, name: string) {
  const config = await (await fetch(`${base}/api/config`)).json();
  const desk = { ...config.profiles[0], id: "desk", name: "Desk", pages: [{ id: "main", name: "Main", placements: [] }] };
  expect((await saveConfig(base, { ...config, profiles: [desk, ...config.profiles] })).ok).toBe(true);
  await page.goto(`${base}/?studio=1&profile=desk`);
  await widgetsPage(page);
  await page.getByRole("button", { name: "New widget" }).click();
  await type(page, "Widget name", name);
}

/** Saves, and returns the recipe.json the server holds (also kept as a test output). */
async function save(page: Page, base: string, name: string, key: string): Promise<string> {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(`Saved ${name}`).first()).toBeVisible();
  const text = await storedText(base, key);
  fs.writeFileSync(test.info().outputPath(`${key}.recipe.json`), text);
  return text;
}

/** Export, take the recipe off the server, import the file: the server holds the same bytes again. */
async function roundTrip(page: Page, base: string, name: string, key: string, text: string) {
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export" }).click()]);
  const zip = test.info().outputPath(file.suggestedFilename());
  await file.saveAs(zip);
  expect((await fetch(`${base}/api/widgets/${key}`, { method: "DELETE", headers: { "X-Dashboard-Widget": "1" } })).ok).toBe(true);
  await page.reload();
  await widgetsPage(page);
  await page.getByLabel("Import a widget package").setInputFiles(zip);
  await expect(page.getByText(`Imported ${name}`).first()).toBeVisible();
  expect(await storedText(base, key)).toBe(text);
}

/** Adds the stored recipe to Desk, saves the screen, and opens the kiosk on it; returns its card. */
async function onKiosk(page: Page, base: string, name: string, id: string) {
  await page.getByRole("button", { name: "Add to a screen" }).click();
  await expect(page.getByText(`Added ${name} to Desk`).first()).toBeVisible();
  await page.keyboard.press("Control+s");
  await expect
    .poll(async () => (await (await fetch(`${base}/api/config`)).json()).profiles.find((p: { id: string }) => p.id === "desk").pages[0].placements.map((z: { module: string }) => z.module), { timeout: 5000 })
    .toEqual([id]);
  await page.goto(`${base}/?profile=desk`);
  return page.locator(`[data-recipe="${id}"]`);
}
const shot = (page: Page, id: string, file: string) => page.locator(`[data-part="card"]:has([data-recipe="${id}"])`).screenshot({ path: test.info().outputPath(file) });

test("Drives: a Repeat over drives with each drive's name, used bar and temperature, by clicks; stored, round-tripped and drawn on the kiosk", async ({ page, scratch }) => {
  test.setTimeout(90_000);
  const { errors } = watchErrors(page);
  await newWidget(page, scratch.base, "Drives");
  await add(page, "repeat");
  await repeatOver(page, "drives");
  // the Repeat no longer reads the place list a new Repeat made: the builder offers to take it out
  await page.getByRole("button", { name: "Also remove Locations (not used now)" }).click();
  await expect(page.getByLabel("Forecast hours", { exact: true })).toHaveCount(0);
  await add(page, "label");
  await layer(page, "0").click();
  await add(page, "bar");
  await layer(page, "0").click();
  await add(page, "value");
  await field(page, "temp");
  await type(page, "Decimals", "0");
  // live on the stage: a row per drive the readings have
  await expect(page.locator("[data-recipe-zone] [data-recipe-item]")).toHaveCount(2);

  const text = await save(page, scratch.base, "Drives", "recipe.drives");
  const r = JSON.parse(text);
  expect(r.format).toBe(2);
  expect(r.options).toEqual([]);
  expect(r.root.children[0]).toMatchObject({ type: "repeat", source: "drives" });
  expect(r.root.children[0]).not.toHaveProperty("over");
  expect(r.root.children[0].children).toEqual([
    { type: "label", bind: { field: "name" } },
    { type: "bar", bind: { field: "used" }, min: 0, max: 100, color: "accent" },
    { type: "value", bind: { field: "temp" }, decimals: 0 },
  ]);
  // the sample keeps the drives' readings, so Sample lists the same drives before any live data
  expect(Object.keys(r.sample.sensors)).toEqual(expect.arrayContaining(["libre.kingston_sfyrd2000g_used_space", "libre.wdc_wds100t2b0a_00sm50_used_space"]));
  await roundTrip(page, scratch.base, "Drives", "recipe.drives", text);

  await page.locator('[data-widget-card="recipe:drives"]').dblclick();
  const card = await onKiosk(page, scratch.base, "Drives", "recipe:drives");
  await expect(card.locator("[data-recipe-item]")).toHaveCount(2);
  await expect(card.locator('[data-recipe-item] [data-recipe-path="0.0"]').first()).toHaveText("Kingston");
  await expect(card.locator('[data-recipe-item] [data-part="bar"]')).toHaveCount(2);
  await expect(card.locator('[data-recipe-item] [data-recipe-path="0.2"]').first()).toContainText("°C");
  await shot(page, "recipe:drives", "kiosk-drives.png");
  expect(errors).toEqual([]);
});

test("Cores: a grid with a Repeat over cores, a load ring each, its columns and spacing by clicks; crowding names the ring in the grid", async ({ page, scratch }) => {
  test.setTimeout(90_000);
  const { errors } = watchErrors(page);
  await newWidget(page, scratch.base, "Cores");
  await type(page, "Opens at columns", "4");
  await type(page, "Opens at rows", "3");
  await add(page, "grid");
  await type(page, "Columns", "8");
  await radio(page, "Spacing", "Tight");
  await add(page, "repeat");
  await repeatOver(page, "cores");
  await page.getByRole("button", { name: "Also remove Locations (not used now)" }).click();
  // a Repeat over devices shows up to 32
  await type(page, "Most shown", "32");
  // in a grid a Repeat has no direction or dividers of its own
  await expect(page.getByRole("radiogroup", { name: "Direction", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Divider lines", { exact: true })).toHaveCount(0);
  await add(page, "ring");
  await expect(page.locator("[data-recipe-zone] [data-recipe-item]")).toHaveCount(32);

  // crowding at a small size names the ring inside the grid's Repeat, by its Layers name
  await type(page, "Stage columns", "2");
  await type(page, "Stage rows", "2");
  const warnings = page.locator("[data-problems] [data-warning]");
  await expect(warnings.filter({ hasText: /^At 2×2, Ring (is too small for its value|overlaps)/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  // off with the centre value it fits: a ring per core, no text to crowd
  await page.getByLabel("Value in the centre", { exact: true }).click();
  await type(page, "Stage columns", "4");
  await type(page, "Stage rows", "3");

  const text = await save(page, scratch.base, "Cores", "recipe.cores");
  const r = JSON.parse(text);
  expect(r.format).toBe(2);
  expect(r.size.default).toEqual([4, 3]);
  expect(r.root.children).toEqual([
    {
      type: "grid",
      name: "Grid",
      columns: 8,
      spacing: "tight",
      children: [{ type: "repeat", name: "Repeat", source: "cores", direction: "rows", max: 32, dividers: true, children: [{ type: "ring", bind: { field: "load" }, min: 0, max: 100, color: "accent", center: false }] }],
    },
  ]);
  await roundTrip(page, scratch.base, "Cores", "recipe.cores", text);

  await page.locator('[data-widget-card="recipe:cores"]').dblclick();
  const card = await onKiosk(page, scratch.base, "Cores", "recipe:cores");
  await expect(card.locator("[data-recipe-item]")).toHaveCount(32);
  await expect(card.locator('[data-recipe-item] [data-part="ring"]')).toHaveCount(32);
  await expect(card.locator('[data-recipe-path="0"] > div')).toHaveCSS("grid-template-columns", /^(\S+ ){7}\S+$/);
  await shot(page, "recipe:cores", "kiosk-cores.png");
  expect(errors).toEqual([]);
});

test("Fans: a Repeat over fans with each fan's name and speed, by clicks; stored and drawn on the kiosk", async ({ page, scratch }) => {
  test.setTimeout(90_000);
  const { errors } = watchErrors(page);
  await newWidget(page, scratch.base, "Fans");
  await add(page, "repeat");
  await repeatOver(page, "fans");
  await page.getByRole("button", { name: "Also remove Locations (not used now)" }).click();
  await type(page, "Most shown", "8");
  await add(page, "label");
  await layer(page, "0").click();
  await add(page, "value");
  await type(page, "Decimals", "0");
  const text = await save(page, scratch.base, "Fans", "recipe.fans");
  const r = JSON.parse(text);
  expect(r.format).toBe(2);
  expect(r.root.children[0]).toMatchObject({ type: "repeat", source: "fans", max: 8 });
  expect(r.root.children[0].children).toEqual([
    { type: "label", bind: { field: "name" } },
    { type: "value", bind: { field: "rpm" }, decimals: 0 },
  ]);

  const card = await onKiosk(page, scratch.base, "Fans", "recipe:fans");
  // the fake Data API's five fans in RPM: three on the GPU, the CPU's and a case fan (a fan at 0 RPM is left out, as Thermals does)
  await expect(card.locator("[data-recipe-item]")).toHaveCount(5);
  await expect(card.locator('[data-recipe-item] [data-recipe-path="0.1"]').first()).toContainText("RPM");
  await expect(card).toContainText("Case Fan");
  await shot(page, "recipe:fans", "kiosk-fans.png");
  expect(errors).toEqual([]);
});

test("adapters and GPUs: each source's fields by clicks, stored as format 2 and round-tripped byte for byte", async ({ page, scratch }) => {
  test.setTimeout(90_000);
  const { errors } = watchErrors(page);
  await newWidget(page, scratch.base, "Adapters and GPUs");
  await add(page, "repeat");
  await repeatOver(page, "adapters");
  await page.getByRole("button", { name: "Also remove Locations (not used now)" }).click();
  await add(page, "value");
  await field(page, "up");
  await layer(page, "").click();
  await add(page, "repeat");
  await repeatOver(page, "gpus");
  await page.getByRole("button", { name: "Also remove Locations (not used now)" }).click();
  await add(page, "gauge");
  await field(page, "temp");
  const text = await save(page, scratch.base, "Adapters and GPUs", "recipe.adapters-and-gpus");
  const r = JSON.parse(text);
  expect(r.root.children.map((b: { source: string }) => b.source)).toEqual(["adapters", "gpus"]);
  expect(r.root.children[0].children[0]).toEqual({ type: "value", bind: { field: "up" } });
  expect(r.root.children[1].children[0]).toMatchObject({ type: "gauge", bind: { field: "temp" } });
  await roundTrip(page, scratch.base, "Adapters and GPUs", "recipe.adapters-and-gpus", text);
  expect(errors).toEqual([]);
});

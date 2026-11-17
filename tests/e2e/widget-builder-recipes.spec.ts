import type { Page } from "@playwright/test";
import { expect, saveConfig, test, watchErrors } from "./fixtures";

// Builder audit Phase A acceptance: the three mockup recipes built in the Widgets page's builder with clicks and typing only (no
// JSON, no page writes), each checked in the recipe.json the server stores, then added to a screen and drawn by the kiosk. The CPU
// card lets people pick the CPU; the GPU card is made from it through the device option's Kind; Weather · places is one Repeat
// with its List, Grid and One place presets and a "High / low" label made of parts (format 2).

const CPU = "amd_ryzen_9_9950x3d";

/** An empty Desk screen to add to (the fixture's screens are full), then the studio on it. */
async function openStudio(page: Page, base: string) {
  const config = await (await fetch(`${base}/api/config`)).json();
  const desk = { ...config.profiles[0], id: "desk", name: "Desk", pages: [{ id: "main", name: "Main", placements: [] }] };
  expect((await saveConfig(base, { ...config, profiles: [desk, ...config.profiles] })).ok).toBe(true);
  await page.goto(`${base}/?studio=1&profile=desk`);
  await widgetsPage(page);
}
const widgetsPage = (page: Page) => page.getByRole("navigation", { name: "Studio views" }).getByRole("button", { name: "Widgets", exact: true }).click();

/** Types into a builder field and commits it (Enter). */
async function type(page: Page, label: string, value: string) {
  const field = page.getByLabel(label, { exact: true });
  await field.fill(value);
  await field.press("Enter");
}
const layer = (page: Page, path: string) => page.locator(`[data-layer="${path}"]`);
const add = (page: Page, type: string) => page.locator(`[data-add-block="${type}"]`).click();
const tab = (page: Page, name: string) => page.getByRole("tab", { name, exact: true }).click();
const radio = (page: Page, group: string, name: string) => page.getByRole("radiogroup", { name: group }).getByRole("radio", { name, exact: true }).click();

/** "Change the data", then the data point of `key` in the picker. */
async function pickData(page: Page, key: string) {
  await page.getByRole("button", { name: "Change the data" }).click();
  await page.getByLabel("Search data points").fill(key.split(".")[1]);
  await page.locator(`button[role="option"][title="${key}"]`).click();
}
const stored = async (base: string, key: string) => (await fetch(`${base}/api/widgets/${key}/recipe.json`)).json();
/** Add to a screen, then Edit saves the screen (Ctrl+S). */
async function addToScreen(page: Page, name: string) {
  await page.getByRole("button", { name: "Add to a screen" }).click();
  await expect(page.getByText(`Added ${name} to Desk`).first()).toBeVisible();
  await page.keyboard.press("Control+s");
}
const placed = async (base: string) => (await (await fetch(`${base}/api/config`)).json()).profiles.find((p: { id: string }) => p.id === "desk").pages[0].placements.map((z: { module: string }) => z.module);

test("the CPU card, built by clicks, and the GPU card made from it through the device's Kind", async ({ page, scratch }) => {
  // a whole recipe of nine blocks is built by clicks and typing, then a second from it, each saved and drawn on the kiosk
  test.setTimeout(150_000);
  const { errors } = watchErrors(page);
  await openStudio(page, scratch.base);
  await page.getByRole("button", { name: "New widget" }).click();
  await type(page, "Widget name", "CPU card");
  await type(page, "Title", "CPU");
  // the header's sub-title names the CPU
  await pickData(page, `libre.${CPU}_cpu_total`);
  // Top row: the ring, which lets people pick the CPU, and the Values column
  await add(page, "row");
  await type(page, "Name in Layers", "Top row");
  await add(page, "ring");
  await pickData(page, `libre.${CPU}_cpu_total`);
  await page.getByRole("switch", { name: "Let people pick the CPU" }).click();
  await radio(page, "Colour", "Thresholds");
  await type(page, "Unit", "%");
  await layer(page, "0").click();
  await add(page, "row");
  await type(page, "Name in Layers", "Values");
  await radio(page, "Direction", "Column");
  for (const [label, key] of [["Temp", "core__tctl_tdie"], ["Clock", "cores__average"], ["Power", "package"]]) {
    await layer(page, "0.1").click();
    await add(page, "value");
    await pickData(page, `libre.${CPU}_${key}`);
    await type(page, "Label", label);
    await type(page, "Decimals", label === "Temp" ? "1" : "0");
  }
  // the history under it
  await layer(page, "").click();
  await add(page, "sparkline");
  await pickData(page, `libre.${CPU}_cpu_total`);
  await expect(page.locator("[data-validation]")).toContainText("No code · 8 blocks · 1 option · sizes 2×2 to 12×12");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved CPU card").first()).toBeVisible();

  const cpu = await stored(scratch.base, "recipe.cpu-card");
  expect(cpu).toMatchObject({
    format: 1,
    id: "recipe:cpu-card",
    options: [{ key: "cpu", label: "CPU", type: "device", kind: "cpu", default: "auto" }],
    root: {
      type: "card",
      title: "CPU",
      subtitle: { sensor: "libre.{cpu}_cpu_total" },
      children: [
        {
          type: "row",
          name: "Top row",
          children: [
            { type: "ring", bind: { sensor: "libre.{cpu}_cpu_total" }, color: "thresholds", unit: "%" },
            {
              type: "row",
              name: "Values",
              direction: "column",
              children: [
                { type: "value", label: "Temp", bind: { sensor: "libre.{cpu}_core__tctl_tdie" }, decimals: 1 },
                { type: "value", label: "Clock", bind: { sensor: "libre.{cpu}_cores__average" }, decimals: 0 },
                { type: "value", label: "Power", bind: { sensor: "libre.{cpu}_package" }, decimals: 0 },
              ],
            },
          ],
        },
        { type: "sparkline", bind: { sensor: "libre.{cpu}_cpu_total" } },
      ],
    },
  });
  await addToScreen(page, "CPU card");

  // the GPU card: a copy of the CPU card whose CPU option becomes a GPU, every key following
  await widgetsPage(page);
  await page.locator('[data-widget-card="recipe:cpu-card"]').click();
  await page.getByRole("button", { name: "More widget actions" }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await type(page, "Widget name", "GPU card");
  await layer(page, "").click();
  await type(page, "Title", "GPU");
  await tab(page, "Options");
  await page.locator('[data-option="cpu"] button[aria-expanded]').click();
  await page.getByLabel("Kind", { exact: true }).selectOption("gpu");
  await expect(page.locator("[data-unmapped]")).toHaveCount(0);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved GPU card").first()).toBeVisible();
  const gpu = await stored(scratch.base, "recipe.gpu-card");
  expect(gpu.options).toEqual([{ key: "cpu", label: "GPU", type: "device", kind: "gpu", default: "auto" }]);
  expect(gpu.root.subtitle).toEqual({ sensor: "libre.{cpu}_gpu_core_load" });
  expect(gpu.root.children[0].children[0].bind).toEqual({ sensor: "libre.{cpu}_gpu_core_load" });
  expect(gpu.root.children[0].children[1].children.map((v: { bind: { sensor: string } }) => v.bind.sensor)).toEqual(["libre.{cpu}_gpu_core", "libre.{cpu}_gpu_core_clock", "libre.{cpu}_gpu_package"]);
  await addToScreen(page, "GPU card");
  await expect.poll(() => placed(scratch.base), { timeout: 5000 }).toEqual(["recipe:cpu-card", "recipe:gpu-card"]);

  await page.goto(`${scratch.base}/?profile=desk`);
  for (const id of ["recipe:cpu-card", "recipe:gpu-card"]) await expect(page.locator(`[data-recipe="${id}"]`)).toBeVisible();
  expect(errors).toEqual([]);
});

test("Weather · places, one Repeat with its List, Grid and One place presets, built by clicks", async ({ page, scratch }) => {
  // a Repeat of seven blocks, an option, three presets and a label of parts, by clicks and typing
  test.setTimeout(150_000);
  const { errors } = watchErrors(page);
  await openStudio(page, scratch.base);
  await page.getByRole("button", { name: "New widget" }).click();
  await type(page, "Widget name", "Weather · places");
  await type(page, "Title", "Weather");
  // a new recipe's Largest is Any (Phase 3): a size of its own first
  await page.getByRole("switch", { name: "Largest: any size" }).click();
  await type(page, "Largest columns", "6");
  await type(page, "Largest rows", "4");
  await type(page, "Opens at columns", "4");
  await type(page, "Opens at rows", "3");
  await type(page, "Smallest columns", "3");
  // Layout: List, Grid, One place
  await tab(page, "Options");
  await page.getByRole("button", { name: "Add an option" }).click();
  await page.getByRole("menuitem", { name: "Choice", exact: true }).click();
  await type(page, "New option name", "Layout");
  await type(page, "Choice 1", "List");
  await type(page, "Choice 2", "Grid");
  await page.getByRole("button", { name: "Add a choice" }).click();
  await type(page, "Choice 3", "One place");
  // the Repeat over Locations, its direction and most shown following Layout
  await tab(page, "Block");
  await layer(page, "").click();
  await add(page, "repeat");
  for (const [setting, list, grid, one] of [["Direction", "rows", "columns", "rows"], ["Most shown", "4", "4", "1"]]) {
    await page.getByLabel(`${setting}: who picks`).selectOption({ label: "Option “Layout”" });
    if (setting === "Direction") {
      await page.getByLabel("Direction for List").selectOption(list);
      await page.getByLabel("Direction for Grid").selectOption(grid);
      await page.getByLabel("Direction for One place").selectOption(one);
    } else {
      await type(page, "Most shown for List", list);
      await type(page, "Most shown for Grid", grid);
      await type(page, "Most shown for One place", one);
    }
  }
  // in each place: the icon, the city and its condition, the temperature, high / low, the next hours
  await add(page, "weather-icon");
  await layer(page, "0").click();
  await add(page, "row");
  await type(page, "Name in Layers", "City and condition");
  await radio(page, "Direction", "Column");
  await add(page, "label");
  await add(page, "label");
  await page.getByLabel("Reads", { exact: true }).selectOption({ label: "Each place's condition" });
  await radio(page, "Tone", "Muted");
  await layer(page, "0").click();
  await add(page, "value");
  await type(page, "Name in Layers", "Temperature");
  await layer(page, "0").click();
  await add(page, "label");
  await type(page, "Name in Layers", "High / low");
  await page.getByLabel("Reads", { exact: true }).selectOption({ label: "Each place's high" });
  await type(page, "Unit", "°");
  await type(page, "Decimals", "0");
  await page.getByRole("button", { name: "Add a part" }).click();
  await page.getByRole("menuitem", { name: "Text", exact: true }).click();
  await type(page, "Part 2 text", " / ");
  await page.getByRole("button", { name: "Add a part" }).click();
  await page.getByRole("menuitem", { name: "Data", exact: true }).click();
  await page.getByLabel("Part 3 reads").selectOption({ label: "Each place's low" });
  await type(page, "Part 3 unit", "°");
  await type(page, "Part 3 decimals", "0");
  await radio(page, "Tone", "Muted");
  await layer(page, "0").click();
  await add(page, "sparkline");
  await type(page, "Name in Layers", "Next 8 hours");
  await radio(page, "Data", "Sample");
  await expect(page.locator("[data-recipe-zone] [data-recipe-item]").first()).toContainText("6° / 1°");
  await radio(page, "Data", "Live data");

  // B12: the selected Repeat's name tag never covers the weather credit line
  await radio(page, "Size", "3×2");
  await layer(page, "0").click();
  const tag = (await page.locator("[data-selection-tag]").boundingBox())!;
  const credit = (await page.locator("[data-recipe-zone] [data-recipe-attribution]").boundingBox())!;
  expect(tag.y + tag.height <= credit.y || tag.y >= credit.y + credit.height, `tag ${JSON.stringify(tag)} over credit ${JSON.stringify(credit)}`).toBe(true);

  // presets: List (the default), Grid at 6×2, One place at 3×2
  await tab(page, "Presets");
  await page.getByRole("button", { name: "More for Default" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await type(page, "Preset name", "List");
  for (const [name, layout, cols, rows] of [["Grid", "Grid", "6", "2"], ["One place", "One place", "3", "2"]]) {
    await page.getByRole("button", { name: "Save current as a preset" }).click();
    await page.getByLabel("New preset name").fill(name);
    await page.getByLabel("New preset name").press("Enter");
    await page.getByLabel("Layout", { exact: true }).selectOption({ label: layout });
    await type(page, "Preset columns", cols);
    await type(page, "Preset rows", rows);
  }
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved Weather · places").first()).toBeVisible();

  const r = await stored(scratch.base, "recipe.weather-places");
  const map = { a: "rows", b: "columns", c3: "rows" };
  expect(r).toMatchObject({
    format: 2,
    size: { min: [3, 2], max: [6, 4], default: [4, 3] },
    options: [
      { key: "layout", label: "Layout", type: "select", default: "a", options: [{ value: "a", label: "List" }, { value: "b", label: "Grid" }, { value: "c3", label: "One place" }] },
      { key: "places", label: "Locations", type: "place-list" },
    ],
    presets: [
      { id: "default", name: "List", settings: {}, size: [4, 3], default: true },
      { id: "grid", name: "Grid", settings: { layout: "b" }, size: [6, 2] },
      { id: "one-place", name: "One place", settings: { layout: "c3" }, size: [3, 2] },
    ],
  });
  expect(r.root.children[0]).toMatchObject({
    type: "repeat",
    over: "places",
    direction: { option: "layout", map },
    max: { option: "layout", map: { a: 4, b: 4, c3: 1 } },
    dividers: true,
    children: [
      { type: "weather-icon", bind: { field: "condition" } },
      { type: "row", name: "City and condition", direction: "column", children: [{ type: "label", bind: { field: "name" } }, { type: "label", bind: { field: "condition" }, tone: "muted" }] },
      { type: "value", name: "Temperature", bind: { field: "temp" } },
      { type: "label", name: "High / low", tone: "muted", parts: [{ bind: { field: "high" }, unit: "°", decimals: 0 }, { text: " / " }, { bind: { field: "low" }, unit: "°", decimals: 0 }] },
      { type: "sparkline", name: "Next 8 hours", bind: { field: "hourly" } },
    ],
  });
  for (const id of ["default", "grid", "one-place"]) {
    await page.locator(`[data-preset="${id}"] button[aria-pressed]`).click();
    await expect(page.locator("[data-recipe-zone] [data-recipe-item]")).toHaveCount(id === "one-place" ? 1 : 3);
  }
  await addToScreen(page, "Weather · places");
  await expect.poll(() => placed(scratch.base), { timeout: 5000 }).toEqual(["recipe:weather-places"]);
  await page.goto(`${scratch.base}/?profile=desk`);
  await expect(page.locator('[data-recipe="recipe:weather-places"]')).toBeVisible();
  await expect(page.locator('[data-recipe="recipe:weather-places"] [data-recipe-item]')).toHaveCount(1);
  expect(errors).toEqual([]);
});

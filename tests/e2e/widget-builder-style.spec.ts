import type { Page } from "@playwright/test";
import { expect, saveConfig, test, watchErrors } from "./fixtures";

// Builder audit Phase C: customisation inside the theme, recipe format 2. The CPU card's clock shown in GHz, the text colours and
// alignment (G21, G22, G23), and a free-space reading that warns when low (G27), each set by clicks, read back from the recipe.json
// the server holds and drawn on the kiosk; and an export imported again gives the same bytes.

const CPU = "amd_ryzen_9_9950x3d";

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
/** Binds the selected block to `key` with the data picker. */
async function bind(page: Page, key: string) {
  await page.getByRole("button", { name: "Change the data" }).click();
  await page.getByLabel("Search data points").fill(key.split(".")[1]);
  await page.locator(`button[role="option"][title="${key}"]`).click();
}
async function save(page: Page, name: string) {
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText(`Saved ${name}`).first()).toBeVisible();
}

/** A screen "Desk" with an empty page, opened in the studio's Widgets page with a new recipe. */
async function deskAndNewWidget(page: Page, base: string) {
  const config = await (await fetch(`${base}/api/config`)).json();
  const desk = { ...config.profiles[0], id: "desk", name: "Desk", pages: [{ id: "main", name: "Main", placements: [] }] };
  expect((await saveConfig(base, { ...config, profiles: [desk, ...config.profiles] })).ok).toBe(true);
  await page.goto(`${base}/?studio=1&profile=desk`);
  await widgetsPage(page);
  await page.getByRole("button", { name: "New widget" }).click();
}

/** Adds the open recipe to Desk, saves the screen, and opens Desk's kiosk. */
async function onTheKiosk(page: Page, base: string, name: string, id: string) {
  await page.getByRole("button", { name: "Add to a screen" }).click();
  await expect(page.getByText(`Added ${name} to Desk`).first()).toBeVisible();
  await page.keyboard.press("Control+s");
  await expect
    .poll(async () => (await (await fetch(`${base}/api/config`)).json()).profiles.find((p: { id: string }) => p.id === "desk").pages[0].placements.map((z: { module: string }) => z.module), { timeout: 5000 })
    .toEqual([id]);
  await page.goto(`${base}/?profile=desk`);
}

test("the CPU card's clock in GHz, a muted centre and aligned text: set by clicks, stored as format 2, drawn on the kiosk, exported and imported byte for byte (G21-G23)", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  await deskAndNewWidget(page, scratch.base);
  await type(page, "Widget name", "Clock card");
  await add(page, "ring");
  await radio(page, "Centre colour", "Muted");
  await layer(page, "").click();
  await add(page, "value");
  await bind(page, `libre.${CPU}_cores__average`);
  await page.getByLabel("Show in", { exact: true }).selectOption("GHz");
  await type(page, "Decimals", "2");
  await radio(page, "Align", "Centre");
  await radio(page, "Colour", "Muted");
  await layer(page, "").click();
  await add(page, "label");
  await radio(page, "Align", "End");
  // the stage shows the clock in GHz with its two decimals
  await expect(page.locator('[data-recipe-zone] [data-recipe-path="1"]')).toHaveText(/\d\.\d{2}\s*GHz/);
  await save(page, "Clock card");
  const text = await storedText(scratch.base, "recipe.clock-card");
  const r = JSON.parse(text);
  expect(r.format).toBe(2);
  expect(r.root.children[0]).toMatchObject({ type: "ring", tone: "muted" });
  expect(r.root.children[1]).toMatchObject({ type: "value", bind: { sensor: `libre.${CPU}_cores__average` }, convert: "GHz", decimals: 2, align: "center", color: "muted" });
  expect(r.root.children[1].unit).toBeUndefined();
  expect(r.root.children[2]).toMatchObject({ type: "label", align: "end" });

  // export, take the recipe off the server, import the file: the server holds the same bytes again
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export" }).click()]);
  const zip = test.info().outputPath(file.suggestedFilename());
  await file.saveAs(zip);
  expect((await fetch(`${scratch.base}/api/widgets/recipe.clock-card`, { method: "DELETE", headers: { "X-Dashboard-Widget": "1" } })).ok).toBe(true);
  await page.reload();
  await widgetsPage(page);
  await expect(page.locator('[data-widget-card="recipe:clock-card"]')).toHaveCount(0);
  await page.getByLabel("Import a widget package").setInputFiles(zip);
  await expect(page.getByText("Imported Clock card").first()).toBeVisible();
  expect(await storedText(scratch.base, "recipe.clock-card")).toBe(text);

  await page.locator('[data-widget-card="recipe:clock-card"]').dblclick();
  await onTheKiosk(page, scratch.base, "Clock card", "recipe:clock-card");
  const card = page.locator('[data-recipe="recipe:clock-card"]');
  await expect(card.locator('[data-recipe-path="1"]')).toHaveText(/\d\.\d{2}\s*GHz/);
  await expect(card.locator('[data-recipe-path="1"] [data-part="num"]')).toHaveAttribute("style", /color: var\(--w-muted\)/);
  await expect(card.locator('[data-recipe-path="1"] > div')).toHaveCSS("justify-content", "center");
  await expect(card.locator('[data-recipe-path="0"] [data-part="num"]')).toHaveAttribute("style", /color: var\(--w-muted\)/);
  await expect(card.locator('[data-recipe-path="2"] span')).toHaveCSS("text-align", "end");
  await card.screenshot({ path: test.info().outputPath("kiosk-clock-card.png") });
  expect(errors).toEqual([]);
});

test("free space that warns when low: Low is bad, the order said in words, a warning past critical refused, drawn on the kiosk (G27)", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  await deskAndNewWidget(page, scratch.base);
  await type(page, "Widget name", "Free space");
  await add(page, "value");
  // the drive's free space, about 184 GB in the scratch data
  await bind(page, "libre.wdc_wds100t2b0a_00sm50_free_space");
  await radio(page, "Colour", "Thresholds");
  const line = page.locator("[data-threshold-line]");
  await expect(line).toHaveText("High is bad: warning from 70 up, critical from 90 up. Warning is the lower level.");
  await radio(page, "Direction", "Low is bad");
  await type(page, "Warning at", "500");
  await type(page, "Critical at", "50");
  await expect(line).toHaveText("Low is bad: warning at 500 and under, critical at 50 and under. Warning is the higher level.");
  // a warning past critical for the direction: said by the field, listed as a problem, and no save
  await type(page, "Warning at", "20");
  await expect(line).toHaveAttribute("data-threshold-line", "wrong");
  await expect(page.locator("[data-problem]")).toHaveText(["Value · Warning, critical: warning at 20 comes after critical at 50; when low is bad, warning is the higher level"]);
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await type(page, "Warning at", "500");
  await expect(page.locator('[data-recipe-zone] [data-recipe-path="0"] [data-part="num"]')).toHaveAttribute("style", /var\(--w-warn/);
  await save(page, "Free space");
  const r = JSON.parse(await storedText(scratch.base, "recipe.free-space"));
  expect(r.format).toBe(2);
  expect(r.root.children[0]).toMatchObject({ color: "thresholds", thresholds: { warn: 500, crit: 50, low: true } });
  await onTheKiosk(page, scratch.base, "Free space", "recipe:free-space");
  await expect(page.locator('[data-recipe="recipe:free-space"] [data-recipe-path="0"] [data-part="num"]')).toHaveAttribute("style", /var\(--w-warn/);
  await page.locator('[data-recipe="recipe:free-space"]').screenshot({ path: test.info().outputPath("kiosk-free-space.png") });
  expect(errors).toEqual([]);
});

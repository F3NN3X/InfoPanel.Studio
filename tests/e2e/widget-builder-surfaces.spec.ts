import fs from "node:fs";
import type { Page } from "@playwright/test";
import { PACK_STYLES } from "../../tools/qa/pack-styles.mjs";
import { expect, saveConfig, test, watchErrors } from "./fixtures";

// Builder audit Phase E: the deferred style keys, recipe format 2. A card that uses every one of them (the root's spacing, a raised
// nested card with its padding, a label's and a value's weight, case and opacity, a gauge's sweep and opacity, a bar's height and
// opacity) built by clicks, read back from the recipe.json the server holds, exported and imported byte for byte, and drawn on the
// kiosk under Classic and the light Paper Look. A text at 40 % is drawn at a step that keeps 4.5:1 on Paper, and the builder says so.
// Crowding still warns at each gauge sweep and bar height.

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
const stage = (page: Page, path: string) => page.locator(`[data-recipe-zone] [data-recipe-path="${path}"]`);

/** A screen "Desk" with an empty page, opened in the studio's Widgets page with a new recipe. */
async function deskAndNewWidget(page: Page, base: string) {
  const config = await (await fetch(`${base}/api/config`)).json();
  const desk = { ...config.profiles[0], id: "desk", name: "Desk", pages: [{ id: "main", name: "Main", placements: [] }] };
  expect((await saveConfig(base, { ...config, profiles: [desk, ...config.profiles] })).ok).toBe(true);
  await page.goto(`${base}/?studio=1&profile=desk`);
  await widgetsPage(page);
  await page.getByRole("button", { name: "New widget" }).click();
}

test("every Phase E key by clicks: stored as format 2, exported and imported byte for byte, drawn on the kiosk under Classic and Paper (G21, G22, G26, G36)", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  await deskAndNewWidget(page, scratch.base);
  await type(page, "Widget name", "Surfaces");
  await layer(page, "").click();
  await radio(page, "Spacing", "Roomy");
  await add(page, "card");
  await radio(page, "Surface", "Raised");
  await radio(page, "Padding", "L");
  await add(page, "label");
  await radio(page, "Weight", "Semibold");
  await radio(page, "Case", "UPPER");
  await radio(page, "Opacity", "40 %");
  await layer(page, "0").click();
  await add(page, "value");
  await type(page, "Label", "Load");
  await radio(page, "Weight", "Medium");
  await radio(page, "Case", "UPPER");
  await radio(page, "Opacity", "60 %");
  await layer(page, "").click();
  await add(page, "gauge");
  await radio(page, "Sweep", "180°");
  await radio(page, "Opacity", "80 %");
  await layer(page, "").click();
  await add(page, "bar");
  await radio(page, "Height", "L");
  await radio(page, "Opacity", "60 %");

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved Surfaces").first()).toBeVisible();
  const text = await storedText(scratch.base, "recipe.surfaces");
  const r = JSON.parse(text);
  expect(r.format).toBe(2);
  expect(r.root.spacing).toBe("roomy");
  expect(r.root.children[0]).toMatchObject({ type: "card", surface: "raised", padding: "l" });
  expect(r.root.children[0].children[0]).toMatchObject({ type: "label", weight: "semibold", case: "upper", opacity: 40 });
  expect(r.root.children[0].children[1]).toMatchObject({ type: "value", label: "Load", weight: "medium", case: "upper", opacity: 60 });
  expect(r.root.children[1]).toMatchObject({ type: "gauge", sweep: 180, opacity: 80 });
  expect(r.root.children[2]).toMatchObject({ type: "bar", height: "l", opacity: 60 });
  expect(text).not.toMatch(/#[\da-f]{3,8}\b/i);
  fs.writeFileSync(test.info().outputPath("recipe.json"), text);

  // export, take the recipe off the server, import the file: the server holds the same bytes again
  const [file] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Export" }).click()]);
  const zip = test.info().outputPath(file.suggestedFilename());
  await file.saveAs(zip);
  expect((await fetch(`${scratch.base}/api/widgets/recipe.surfaces`, { method: "DELETE", headers: { "X-Dashboard-Widget": "1" } })).ok).toBe(true);
  await page.reload();
  await widgetsPage(page);
  await page.getByLabel("Import a widget package").setInputFiles(zip);
  await expect(page.getByText("Imported Surfaces").first()).toBeVisible();
  expect(await storedText(scratch.base, "recipe.surfaces")).toBe(text);

  // on the kiosk, under Classic
  await page.locator('[data-widget-card="recipe:surfaces"]').dblclick();
  await page.getByRole("button", { name: "Add to a screen" }).click();
  await expect(page.getByText("Added Surfaces to Desk").first()).toBeVisible();
  await page.keyboard.press("Control+s");
  await expect
    .poll(async () => (await (await fetch(`${scratch.base}/api/config`)).json()).profiles.find((p: { id: string }) => p.id === "desk").pages[0].placements.map((z: { module: string }) => z.module), { timeout: 5000 })
    .toEqual(["recipe:surfaces"]);
  await page.goto(`${scratch.base}/?profile=desk`);
  const card = page.locator('[data-recipe="recipe:surfaces"]');
  const shell = page.locator('[data-part="card"]:has([data-recipe="recipe:surfaces"])');
  await expect(card.locator('[data-recipe-path="1"] g[transform="rotate(-90 50 50)"]')).toHaveCount(1);
  await expect(card.locator('[data-recipe-path="2"] [data-part="bar"]')).toHaveClass(/\bh-3\.5\b/);
  await expect(card.locator('[data-recipe-path="0.0"] span')).toHaveCSS("text-transform", "uppercase");
  await expect(card.locator('[data-recipe-path="0.0"] span')).toHaveCSS("font-weight", "600");
  await expect(card.locator('[data-recipe-path="0.1"] [data-part="num"]')).toHaveCSS("font-weight", "500");

  // the screen in Classic, a light Look (Paper), a glass one (Liquid Glass) and a pack (Holo): Raised reads as raised on each (a tint
  // and an edge of the Look's text colour, a shade under it), and each faded text is drawn at a step that keeps it readable there
  const config = await (await fetch(`${scratch.base}/api/config`)).json();
  const drawn: Record<string, number> = {};
  for (const look of ["classic", "paper", "liquid-glass", "holo"] as const) {
    const profiles = config.profiles.map((p: { id: string }) => (p.id === "desk" && look !== "classic" ? { ...p, widgetTheme: { values: PACK_STYLES[look] } } : p));
    expect((await saveConfig(scratch.base, { ...config, profiles })).ok).toBe(true);
    await page.reload();
    await expect(shell).toHaveAttribute("data-mat", look === "classic" ? "glass" : `look-${look}`, { timeout: 10_000 });
    const raised = card.locator('[data-recipe-path="0"] > div');
    await expect(raised).toHaveCSS("box-shadow", /inset/);
    expect(await raised.evaluate((el) => getComputedStyle(el).backgroundColor), look).not.toBe("rgba(0, 0, 0, 0)");
    for (const [path, want] of [["0.0", 40], ["0.1", 60]] as const) {
      const text = card.locator(`[data-recipe-path="${path}"] [data-recipe-opacity]`);
      await expect(text, `${look} ${path}`).toHaveAttribute("data-recipe-opacity", /^(40|60|80|100)$/);
      const step = Number(await text.getAttribute("data-recipe-opacity"));
      expect(step, `${look} ${path}`).toBeGreaterThanOrEqual(want);
      drawn[`${look} ${path}`] = step;
      await expect(text).toHaveCSS("opacity", String(step / 100));
    }
    await shell.screenshot({ path: test.info().outputPath(`kiosk-surfaces-${look}.png`) });
  }
  fs.writeFileSync(test.info().outputPath("drawn-steps.json"), JSON.stringify(drawn, null, 2));
  expect(errors).toEqual([]);
});

test("40 % text on a light Look: drawn at a step that keeps 4.5:1 on the card, and the builder says so (G22)", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  const config = await (await fetch(`${scratch.base}/api/config`)).json();
  const desk = { ...config.profiles[0], id: "desk", name: "Desk", widgetTheme: { values: PACK_STYLES.paper }, pages: [{ id: "main", name: "Main", placements: [] }] };
  expect((await saveConfig(scratch.base, { ...config, profiles: [desk, ...config.profiles] })).ok).toBe(true);
  await page.goto(`${scratch.base}/?studio=1&profile=desk`);
  await widgetsPage(page);
  await page.getByRole("button", { name: "New widget" }).click();
  await add(page, "label");
  await page.getByLabel("Preview in", { exact: true }).selectOption("paper");
  const zoneCard = page.locator("[data-recipe-zone] [data-part='card']").first();
  await expect(zoneCard).toHaveAttribute("data-mat", "look-paper");
  await expect(zoneCard).toHaveAttribute("data-tone", "light");
  await expect(page.locator("[data-opacity-raised]")).toHaveCount(0);
  await radio(page, "Opacity", "40 %");
  const label = stage(page, "0").locator("[data-recipe-opacity]");
  await expect(label).toHaveAttribute("data-recipe-opacity", /^(60|80|100)$/);
  const step = await label.getAttribute("data-recipe-opacity");
  await expect(page.locator("[data-opacity-raised]")).toHaveText(`Shown at ${step} % on this Look to stay readable`);
  await expect(label).toHaveCSS("opacity", String(Number(step) / 100));
  // what the browser draws holds 4.5:1: the text's colour at that opacity over the card's white, by WCAG's formula
  const ratio = await label.evaluate((el) => {
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = (c: number[]) => c.map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)).reduce((s, v, k) => s + v * [0.2126, 0.7152, 0.0722][k], 0);
    const a = Number(getComputedStyle(el).opacity);
    const ink = rgb(getComputedStyle(el).color).map((v) => v * a + 255 * (1 - a));
    return (1 + 0.05) / (lum(ink) + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
  await page.locator("[data-recipe-zone]").screenshot({ path: test.info().outputPath("stage-opacity-paper.png") });
  expect(errors).toEqual([]);
});

test("crowding still warns at every gauge sweep and every bar height (G36, G19)", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  await deskAndNewWidget(page, scratch.base);
  await add(page, "gauge");
  await type(page, "Text size", "6");
  for (const sweep of ["180°", "240°", "270°"]) {
    await radio(page, "Sweep", sweep);
    await expect(page.locator("[data-problem]").filter({ hasText: "Gauge is too small for its value" }), sweep).toHaveCount(1);
  }
  await layer(page, "").click();
  await add(page, "value");
  await type(page, "Label", "A label far too long for the room this card has for it");
  await layer(page, "").click();
  await add(page, "bar");
  await expect(page.locator("[data-recipe-zone] [data-recipe-path]")).toHaveCount(3);
  for (const height of ["S", "M", "L"]) {
    await radio(page, "Height", height);
    await expect(page.locator("[data-problem]").filter({ hasText: /A label far too long.* is cut$/ }), height).toHaveCount(1);
    await expect(page.locator("[data-problem]").filter({ hasText: "Gauge is too small for its value" }), height).toHaveCount(1);
  }
  await expect(page.locator(`[data-recipe-zone] [data-recipe-path="2"] [data-part="bar"]`)).toHaveClass(/\bh-3\.5\b/);
  expect(errors).toEqual([]);
});

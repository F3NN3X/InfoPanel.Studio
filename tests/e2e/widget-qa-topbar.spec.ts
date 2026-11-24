import type { Page } from "@playwright/test";
import { startScratch, type Scratch } from "../../tools/perf/scratch.mjs";
import { expect, test } from "./fixtures";

// The Widget QA page's top bar (src/widgets/widget-qa/TopBar.tsx): each control the old toolbar had lives in the Look, Overrides or
// Grid popover, the Data segments or the ⋯ menu, and moves the same URL param it always did (params.ts is frozen). The active
// changes row lists what is set and puts it back. The bar is the page's own chrome: no worn Look reaches it.

// The QA page is served in debug mode only, so this runs on its own scratch server with DASHBOARD_DEBUG=1.
let qa: Scratch;
test.beforeAll(async () => {
  qa = await startScratch({ env: { DASHBOARD_DEBUG: "1" } });
});
test.afterAll(() => qa.stop());

const ONE = "module=CpuMonitor&spans=2x1";
const open = async (page: Page, query = ONE) => {
  await page.goto(`${qa.base}/?widget-qa&${query}`);
  await page.waitForFunction(() => window.__qa);
};
const param = (k: string, v: string) => new RegExp(`[?&]${k}=${v}(&|#|$)`);
const noParam = (k: string) => new RegExp(`^(?!.*[?&]${k}=)`);
const bar = (page: Page) => page.locator("main > header");
const popup = (page: Page) => page.getByRole("dialog");
const list = (page: Page) => page.locator('aside[aria-label="Widget list"]');

test("Look: the Look, its variant, effects, the pack's script and the pack import", async ({ page }) => {
  test.setTimeout(60_000);
  await open(page);
  const header = bar(page);
  const before = await header.evaluate((h) => getComputedStyle(h).backgroundColor);
  await header.getByRole("button", { name: "No look" }).click();
  await popup(page).getByRole("combobox", { name: "Look", exact: true }).selectOption("cyberspec");
  await expect(page).toHaveURL(param("look", "cyberspec"));
  await popup(page).getByRole("combobox", { name: "Variant", exact: true }).selectOption("crimson");
  await expect(page).toHaveURL(param("lookVariant", "crimson"));
  await popup(page).getByRole("radio", { name: "Calm" }).click();
  await expect(page).toHaveURL(param("fx", "calm"));
  await popup(page).getByRole("switch", { name: "Run the pack's script" }).click();
  await expect(page).toHaveURL(param("script", "0"));
  // a file that is no pack is refused, and the popover says why
  await popup(page).locator('input[type="file"]').setInputFiles({ name: "not-a-pack.zip", mimeType: "application/zip", buffer: Buffer.from("no zip") });
  await expect(popup(page).getByRole("status")).toContainText("refused");
  await page.keyboard.press("Escape");
  await expect(popup(page)).toHaveCount(0);
  // the button names what is worn, and the bar is the page's own: no pack reaches it, and it keeps its colours under the Look
  await expect(header.getByRole("button", { name: /^Look/ })).toContainText(/Cyberspec · Crimson/i);
  await expect(page.locator('[data-look="cyberspec"]').first()).toBeAttached({ timeout: 15_000 });
  expect(await header.evaluate((h) => !h.closest("[data-look]") && !h.querySelector("[data-look]"))).toBe(true);
  expect(await header.evaluate((h) => getComputedStyle(h).backgroundColor)).toBe(before);
});

test("Overrides: every placement's skin, density, surface, graph, meter, accent, corners and raw settings", async ({ page }) => {
  test.setTimeout(60_000);
  await open(page);
  const o = await page.evaluate(() => window.__qa!.options());
  await bar(page).getByRole("button", { name: /^Overrides/ }).click();
  const panel = popup(page);
  // the skin list a tool reads without opening the popover (`__qa.options()`) is the control's own
  const skin = panel.getByRole("combobox", { name: "Skin", exact: true });
  expect((await skin.locator("option").evaluateAll((os) => os.map((x) => (x as HTMLOptionElement).value))).filter(Boolean)).toEqual(o.skins);
  await skin.selectOption(o.skins[1]);
  await expect(page).toHaveURL(param("skin", o.skins[1]));
  await panel.getByRole("combobox", { name: "Density", exact: true }).selectOption({ label: "Dense" });
  await expect(page).toHaveURL(param("variant", "studio"));
  for (const [name, key, value] of [["Surface", "surface", o.surfaces[0]], ["Graph style", "graph", o.graphs[0]], ["Meter style", "meter", o.meters[0]], ["Corners", "radius", o.radii[0]]]) {
    await panel.getByRole("combobox", { name, exact: true }).selectOption(value);
    await expect(page).toHaveURL(param(key, encodeURIComponent(value)));
  }
  await panel.getByRole("button", { name: `Accent ${o.accents[0]}` }).click();
  await expect(page).toHaveURL(param("accent", encodeURIComponent(o.accents[0])));
  // a second click on the same swatch clears it
  await panel.getByRole("button", { name: `Accent ${o.accents[0]}` }).click();
  await expect(page).toHaveURL(noParam("accent"));
  await panel.getByLabel("Accent colour").fill("#123456");
  await expect(page).toHaveURL(param("accent", "%23123456"));
  // a settings JSON that does not parse is shown, not applied
  const json = panel.getByRole("textbox", { name: "Settings JSON" });
  await json.fill('{"surface":');
  await expect(json).toHaveAttribute("aria-invalid", "true");
  await expect(panel.locator("#qa-settings-error")).not.toBeEmpty();
  await json.press("Control+Enter");
  await expect(page).toHaveURL(noParam("settings"));
  await json.fill('{"surface":"glass"}');
  await json.press("Control+Enter");
  await expect(page).toHaveURL(param("settings", encodeURIComponent('{"surface":"glass"}')));
  await page.keyboard.press("Escape");
  // skin, density, surface, graph, meter, accent, corners and the settings
  await expect(bar(page).getByRole("button", { name: /^Overrides/ })).toContainText("8");
});

test("Grid: cell size, gap, sizes and the grid overlay", async ({ page }) => {
  test.setTimeout(60_000);
  await open(page);
  await bar(page).getByRole("button", { name: /^Grid/ }).click();
  const panel = popup(page);
  await panel.getByRole("radio", { name: "150" }).click();
  await expect(page).toHaveURL(param("cell", "150"));
  await panel.getByLabel("Cell size in px").fill("120");
  await expect(page).toHaveURL(param("cell", "120"));
  await panel.getByLabel("Gap").fill("4");
  await expect(page).toHaveURL(param("gap", "4"));
  await panel.getByRole("radio", { name: "Small panel" }).click();
  await expect(page).toHaveURL(param("spans", "1x1,2x1,1x2,2x2"));
  await expect(page.locator("figure[data-qa-span]")).toHaveCount(4);
  await panel.getByRole("textbox", { name: "Sizes" }).fill("2x2");
  await expect(page).toHaveURL(param("spans", "2x2"));
  await panel.getByRole("switch", { name: "Draw the grid" }).click();
  await expect(page).toHaveURL(param("grid", "1"));
  await page.keyboard.press("Escape");
  await expect(bar(page).getByRole("button", { name: /^Grid/ })).toContainText("120 · 4 · 1 size");
});

test("Data: a segment reloads the page with that data", async ({ page }) => {
  test.setTimeout(60_000);
  await open(page);
  await page.evaluate(() => Object.assign(window, { __before: true }));
  await bar(page).getByRole("radiogroup", { name: /^Data/ }).getByRole("radio", { name: "Stress" }).click();
  await expect(page).toHaveURL(param("data", "stress"));
  await page.waitForFunction(() => window.__qa && !("__before" in window));
  await expect(bar(page).getByRole("radio", { name: "Stress" })).toHaveAttribute("aria-checked", "true");
});

test("⋯: page background, galleries, app surfaces, copy link, mount every frame, help and reset", async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await open(page);
  const more = bar(page).getByRole("button", { name: "More" });
  const pick = async (menu: RegExp, item: string) => {
    await more.click();
    await page.getByRole("menuitem", { name: menu }).click();
    await page.getByRole("menuitem", { name: item, exact: true }).click();
  };
  await pick(/^Page background/, "paper");
  await expect(page).toHaveURL(param("theme", "paper"));
  const gallery = (await page.evaluate(() => window.__qa!.options().galleries))[0];
  await pick(/^Open the galleries/, gallery);
  await expect(page).toHaveURL(param("gallery", gallery));
  await more.click();
  await page.getByRole("menuitem", { name: "Show app surfaces" }).click();
  await expect(page).toHaveURL(param("surfaces", "0"));
  await more.click();
  await page.getByRole("menuitem", { name: "Copy page link" }).click();
  await expect(bar(page).getByRole("status").first()).toHaveText("Link copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
  await more.click();
  await page.getByRole("menuitem", { name: "Mount every frame now" }).click();
  await expect(bar(page).getByText("in every frame")).toBeVisible({ timeout: 20_000 });
  await more.click();
  await page.getByRole("menuitem", { name: "Help" }).click();
  const help = page.getByRole("dialog", { name: "Widget QA help" });
  await expect(help).toBeVisible();
  for (const group of ["Look", "Overrides", "Grid", "Data"]) await expect(help.getByRole("heading", { name: group, exact: true })).toBeVisible();
  await help.getByRole("button", { name: "Close" }).click();
  await expect(help).toBeHidden();
  await more.click();
  await page.getByRole("menuitem", { name: "Reset all" }).click();
  await expect(page).toHaveURL(/\?widget-qa$/);
});

test("the active changes row lists what is set, and each × or Reset all puts it back", async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, `${ONE}&skin=cyber&cell=150&look=cyberspec&lookVariant=crimson`);
  const row = page.getByRole("list", { name: "Active changes" });
  await expect(row.locator("[data-qa-change]")).toHaveText([/^Look: Cyberspec · Crimson$/i, "Skin: cyber", "Cell 150", "Sizes: 2x1", "Only: CpuMonitor"]);
  await row.getByRole("button", { name: "Clear Skin: cyber" }).click();
  await expect(page).toHaveURL(noParam("skin"));
  await expect(row.locator('[data-qa-change="skin"]')).toHaveCount(0);
  await row.getByRole("button", { name: /^Clear Look/ }).click();
  await expect(page).toHaveURL(noParam("look"));
  await expect(page).toHaveURL(noParam("lookVariant"));
  await row.getByRole("button", { name: "Reset all" }).click();
  await expect(page).toHaveURL(/\?widget-qa$/);
  // nothing set: no row
  await expect(row).toHaveCount(0);
});

test("the summary counts the frames, and its theme flags count and the widget row's filters set their params", async ({ page }) => {
  test.setTimeout(60_000);
  await open(page, "module=CpuMonitor,Clock&spans=2x1,4x2");
  const header = bar(page);
  const frames = await page.locator("figure[data-qa-span], figure[data-qa-view], figure[data-qa-layout]").count();
  await expect(header.getByText(`2 widgets`, { exact: true })).toBeVisible();
  await expect(header.getByText(`${frames} frames`, { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Filter id or title" }).fill("cpu");
  await expect(page).toHaveURL(param("q", "cpu"));
  // the filter chips moved from the row under the bar into the widget list (widget-qa-list.spec.ts)
  await list(page).getByRole("button", { name: "Notes", exact: true }).click();
  await expect(page).toHaveURL(param("noted", "1"));
  // with no Look worn the theme check does not run, so there is no Theme flags chip to press
  await expect(list(page).getByRole("button", { name: "Theme flags", exact: true })).toHaveCount(0);
  // the issues count is the Issues filter
  const issues = header.getByRole("button", { name: /^\d+ issues?$/ });
  await issues.click();
  await expect(page).toHaveURL(param("issues", "1"));
  await expect(issues).toHaveAttribute("aria-pressed", "true");
  await expect(list(page).getByRole("button", { name: "Issues", exact: true })).toHaveAttribute("aria-pressed", "true");
  // under a worn Look the summary counts theme flags too, and its count is the same filter as the list's chip
  await open(page, `${ONE}&look=cyberspec`);
  const count = bar(page).getByRole("button", { name: /theme flags?$/ });
  await count.click();
  await expect(page).toHaveURL(param("flagged", "1"));
  await expect(count).toHaveAttribute("aria-pressed", "true");
  await list(page).getByRole("button", { name: "Theme flags", exact: true }).click();
  await expect(page).toHaveURL(noParam("flagged"));
  await expect(count).toHaveAttribute("aria-pressed", "false");
});

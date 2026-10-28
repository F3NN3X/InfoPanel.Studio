import fs from "node:fs";
import path from "node:path";
import { expect, manifest, saveConfig, test } from "./fixtures";

// Switch theme on a screen saved before themes kept a snapshot, with a black background and see-through cards: the
// first pick replaces its look, so Paper · Ink makes it look like Paper. Undo in the toast puts it back.

const PAPER_BG = "rgb(216, 210, 196)";
const BLACK = "rgb(0, 0, 0)";

/** A CSS color's red, green, blue and alpha. */
const rgba = (color: string): number[] => {
  const [r, g, b, a = 1] = (color.match(/[\d.]+/g) ?? []).map(Number);
  return [r, g, b, a];
};

test("Switch theme › Paper · Ink makes a screen with no snapshot look like Paper, and Undo puts it back", async ({ page, scratch }) => {
  const config = JSON.parse(fs.readFileSync(path.join(scratch.dataDir, "config.json"), "utf8"));
  const light = manifest.profiles.light;
  config.profiles = config.profiles.map((p: { id: string }) =>
    p.id === light ? { ...p, background: { type: "color", color: "#000000" }, widgetTheme: { values: { surfaceOpacity: 0 } } } : p
  );
  expect((await saveConfig(scratch.base, config)).ok).toBe(true);
  // A returning browser (as in studio-basics): its local copy is the seeded one.
  await page.addInitScript((value) => localStorage.setItem("infopanel-dashboard:config:v1", value), JSON.stringify(config));
  await page.goto(`${scratch.base}/?studio=1&profile=${light}`);

  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await page.getByRole("group", { name: "Theme level" }).getByRole("button", { name: /Perf light/ }).click();
  const preview = page.getByRole("region", { name: "Preview" });
  const background = preview.locator("[data-page-background]");
  // A widget's card: the frame its preview badge sits in holds it.
  const card = preview.locator(`[data-preview-zone="${manifest.zones.light[1]}"]`).locator("xpath=..").locator("[data-wp-tier]");
  const fill = async () => rgba(await card.evaluate((el) => getComputedStyle(el).backgroundColor));
  await expect(background).toHaveCSS("background-color", BLACK);
  const before = await fill();
  expect(before[3]).toBe(0);

  await page.getByRole("button", { name: /Switch theme/ }).click();
  await page.getByRole("button", { name: "Apply Paper · Ink" }).click();
  const toast = preview.getByRole("status");
  await expect(toast).toContainText("Replaced this screen's look, background included.");
  await expect(background).toHaveCSS("background-color", PAPER_BG);
  // Paper's white cards: light and nearly opaque.
  await expect.poll(fill).toEqual([255, 255, 255, expect.any(Number)]);
  expect((await fill())[3]).toBeGreaterThanOrEqual(0.8);

  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(background).toHaveCSS("background-color", BLACK);
  await expect.poll(fill).toEqual(before);
});

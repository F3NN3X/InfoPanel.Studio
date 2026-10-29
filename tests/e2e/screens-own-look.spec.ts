import fs from "node:fs";
import path from "node:path";
import { expect, manifest, test, watchErrors } from "./fixtures";

// Config v16 (screens own their look): a v15 config whose screens inherit the dashboard's look ("All screens") shows
// the same page background and card color in the kiosk before and after the studio migrates it, Theme has no All
// screens level, and the studio saves nothing until its update message's Update now, the server keeping the v15 file
// as config.backup-before-v16.json first and the message naming it.

const CARD = "200 50% 40%";
const BG = "#123456";
const BG_RGB = "rgb(18, 52, 86)";

test("a v15 dashboard look is each screen's own after the studio's first save, and the v15 file is kept", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  const file = path.join(scratch.dataDir, "config.json");
  const backup = path.join(scratch.dataDir, "config.backup-before-v16.json");
  const stored = JSON.parse(fs.readFileSync(file, "utf8"));
  // The fixture as v15 saved it, the look on the dashboard: the screens have nothing of their own.
  const screens = stored.profiles.map(({ theme: _theme, radius: _radius, ...p }: Record<string, unknown>) => p);
  const v15 = { ...stored, version: 15, profiles: screens, theme: { card: CARD }, radius: 0.75, background: { type: "color", color: BG } };
  fs.writeFileSync(file, JSON.stringify(v15));
  const light = manifest.profiles.light;
  const card = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--card").trim());

  // The kiosk reads the v15 copy and shows the dashboard's look on the screen.
  await page.goto(`${scratch.base}/?kiosk=1&profile=${light}`);
  await expect(page.locator(manifest.kioskZoneSelector)).toHaveCount(manifest.zones.light.length);
  await expect(page.locator("[data-page-background]")).toHaveCSS("background-color", BG_RGB);
  expect(await card()).toBe(CARD);

  // The studio migrates it in memory and asks; nothing is saved until Update now, the server keeping the v15 file first.
  await page.goto(`${scratch.base}/?studio=1&profile=${light}`);
  const ask = page.getByRole("alertdialog", { name: "Your screens need an update" });
  await expect(ask).toContainText("format 15) will be updated to format 16");
  await page.keyboard.press("Control+s");
  await page.waitForTimeout(800);
  expect(JSON.parse(fs.readFileSync(file, "utf8")).version).toBe(15);
  await ask.getByRole("button", { name: "Update now" }).click();
  const done = page.getByRole("alertdialog", { name: "Your screens are updated" });
  await expect(done).toContainText("config.backup-before-v16.json");
  expect(JSON.parse(fs.readFileSync(file, "utf8")).version).toBe(16);
  expect(fs.readFileSync(backup, "utf8")).toBe(JSON.stringify(v15));
  await done.getByRole("button", { name: "Continue" }).click();
  await expect(done).toHaveCount(0);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator(`[data-zone-id="${manifest.zones.light[0]}"]`)).toBeVisible();
  const saved = JSON.parse(fs.readFileSync(file, "utf8"));
  expect(saved).not.toHaveProperty("theme");
  expect(saved.profiles.find((p: { id: string }) => p.id === light)).toMatchObject({ radius: 0.75, background: { type: "color", color: BG }, theme: { card: CARD } });
  // The canvas scopes the screen's own theme.
  await expect(page.locator("[data-theme-scope]").first()).toHaveCSS("--card", CARD);

  // Theme: the screen and its page, no All screens level.
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  const levels = page.getByRole("group", { name: "Theme level" });
  await expect(levels.getByRole("button", { name: /Perf light/ })).toBeVisible();
  await expect(levels.getByRole("button", { name: /All screens/ })).toHaveCount(0);

  // The kiosk on the v16 copy looks as before.
  await page.goto(`${scratch.base}/?kiosk=1&profile=${light}`);
  await expect(page.locator(manifest.kioskZoneSelector)).toHaveCount(manifest.zones.light.length);
  await expect(page.locator("[data-page-background]")).toHaveCSS("background-color", BG_RGB);
  expect(await card()).toBe(CARD);
  expect(errors).toEqual([]);
});

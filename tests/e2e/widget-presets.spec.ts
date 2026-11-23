import fs from "node:fs";
import path from "node:path";
import { expect, test, watchErrors } from "./fixtures";

// Phase 4: Save as preset in the inspector, the saved preset is a row of its widget in Add, and adding it places the widget
// with that preset's view, settings and size. Saved presets live in the config (`widgetPresets`).

test("Save as preset, find it in Add, add it: the placement is the preset", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  const local = fs.readFileSync(path.join(scratch.dataDir, "config.json"), "utf8");
  await page.addInitScript((value) => localStorage.setItem("infopanel-dashboard:config:v1", value), local);
// the left panel starts collapsed (Phase 5, choice 9): this spec works in it, so open it as a returning user would have
  await page.addInitScript(() => localStorage.setItem("studio.editor.leftPanelOpen", "1"));
  await page.goto(`${scratch.base}/?studio=1`);
  await page.getByRole("navigation", { name: "Studio views" }).getByRole("button", { name: /^Edit / }).click();

  // The fixture's Weather zone, on its Minimal preset.
  await page.locator('[data-zone-id="perf-weather"]').click();
  const row = page.getByTestId("inspector-presets");
  await row.getByRole("radio", { name: "Minimal" }).click();
  await row.getByTestId("preset-save").click();
  const name = row.getByLabel("Preset name");
  await name.fill("Desk weather");
  await name.press("Enter");
  await expect(row.getByTestId("saved-preset")).toContainText("Desk weather");
  // The saved preset holds all the zone's settings, more than Minimal's bundle, so it is the one the zone is on.
  await expect(row.getByTestId("saved-preset").getByRole("button", { name: /^Desk weather\s*\d/ })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Control+s");

  const saved = async () => (await (await fetch(`${scratch.base}/api/config`)).json()) as { widgetPresets?: Record<string, unknown>[]; profiles: { pages: { placements: Record<string, unknown>[] }[] }[] };
  await expect.poll(async () => (await saved()).widgetPresets?.length, { timeout: 5000 }).toBe(1);
  const [preset] = (await saved()).widgetPresets!;
  expect(preset).toMatchObject({ widget: "Weather", name: "Desk weather", view: "minimal", size: [2, 3] });

  // It is a further row of Weather in Add; adding it places a Weather zone that is exactly the preset.
  await page.getByRole("tab", { name: "Add" }).click();
  await page.getByRole("combobox", { name: /^Search widgets/ }).fill("weather");
  const tile = page.getByTestId("add-tile").filter({ hasText: "Weather" }).first();
  await tile.getByTestId("add-presets-toggle").click();
  await page.getByTestId("add-preset").filter({ hasText: "Desk weather" }).click();
  await page.keyboard.press("Control+s");

  await expect
    .poll(async () => {
      const zones = (await saved()).profiles.flatMap((p) => p.pages.flatMap((pg) => pg.placements)).filter((z) => z.module === "Weather");
      return zones.length;
    }, { timeout: 5000 })
    .toBe(2);
  const added = (await saved()).profiles.flatMap((p) => p.pages.flatMap((pg) => pg.placements)).filter((z) => z.module === "Weather" && z.id !== "perf-weather")[0];
  expect(added.settings).toEqual({ view: "minimal", ...(preset.settings as object) });
  expect([added.colSpan, added.rowSpan]).toEqual(preset.size);
  expect(errors).toEqual([]);
});

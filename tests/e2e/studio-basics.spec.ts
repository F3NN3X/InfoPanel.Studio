import fs from "node:fs";
import path from "node:path";
import { expect, test, watchErrors } from "./fixtures";

// The studio loads, Design shows the fixture's zones, an inspector edit saves with Ctrl+S, and undo reverts it.

test("Design: select, edit, save and undo", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  // A returning browser: its local copy (src/lib/layout.ts) already names the fake Data API. A fresh one renders
  // the defaults, and reaches for the default Data API, until the server's config arrives.
  const local = fs.readFileSync(path.join(scratch.dataDir, "config.json"), "utf8");
  await page.addInitScript((value) => localStorage.setItem("infopanel-dashboard:config:v1", value), local);
  await page.goto(`${scratch.base}/?studio=1`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  // Six zones; the seventh, a free area, is a group of InfoPanel items since v15 (Edit v3), drawn as one items layer.
  await expect(page.locator("[data-zone-id]")).toHaveCount(6);
  await expect(page.locator("[data-items-layer]")).toHaveCount(1);

  await page.locator('[data-zone-id="perf-statusbar"]').click();
  const name = page.getByLabel("Zone name");
  await name.fill("Edited zone");
  await name.press("Enter");
  await page.keyboard.press("Control+s");

  await expect
    .poll(async () => (await (await fetch(`${scratch.base}/api/config`)).text()).includes("Edited zone"), { timeout: 5000 })
    .toBe(true);

  // Undo (outside the text field, so it is the studio's history, not the input's).
  await page.locator('[data-zone-id="perf-statusbar"]').click();
  await expect(name).toHaveValue("Edited zone");
  await page.keyboard.press("Control+z");
  // The fixture's zone has no name.
  await expect(name).toHaveValue("");
  expect(errors).toEqual([]);
});

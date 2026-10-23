import { expect, test, watchErrors } from "./fixtures";

// The studio loads, Design shows the fixture's zones, an inspector edit saves with Ctrl+S, and undo reverts it.

test("Design: select, edit, save and undo", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  await page.goto(`${scratch.base}/?studio=1`);
  await page.getByRole("button", { name: "Design" }).click();
  await expect(page.locator("[data-zone-id]")).toHaveCount(7);

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

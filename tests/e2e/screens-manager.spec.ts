import fs from "node:fs";
import path from "node:path";
import { expect, test, watchErrors } from "./fixtures";

// The Screens manager: a screen made from the sample layout, renamed, deleted (the confirm names what goes) and
// brought back by the toast's Undo, with the server's saved config following each step.

test("Screens: create from the sample layout, rename, delete, undo", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  const local = fs.readFileSync(path.join(scratch.dataDir, "config.json"), "utf8");
  await page.addInitScript((value) => localStorage.setItem("infopanel-dashboard:config:v1", value), local);
  await page.goto(`${scratch.base}/?studio=1`);
  await page.locator('[aria-label="Screens"]').click();

  const cards = page.getByRole("list", { name: "Your screens" }).getByRole("listitem");
  const before = await cards.count();
  const saved = async () => (await fetch(`${scratch.base}/api/config`)).text();

  await page.getByRole("button", { name: "New" }).click();
  await page.getByRole("menuitem", { name: "Dashboard from the sample layout" }).click();
  await expect(cards).toHaveCount(before + 1);

  const actions = (name: string) => cards.filter({ hasText: name }).getByRole("button", { name: "Screen actions" });
  await actions("Sample layout").click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const field = page.getByLabel("Screen name");
  await field.fill("Desk strip");
  await field.press("Enter");
  await expect(cards.filter({ hasText: "Desk strip" })).toHaveCount(1);
  await expect.poll(async () => (await saved()).includes("Desk strip"), { timeout: 5000 }).toBe(true);

  await actions("Desk strip").click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Delete Desk strip?");
  await expect(dialog).toContainText("1 page");
  await dialog.getByRole("button", { name: "Delete screen" }).click();
  await expect(cards).toHaveCount(before);
  await expect.poll(async () => (await saved()).includes("Desk strip"), { timeout: 5000 }).toBe(false);

  await page.getByRole("status").getByRole("button", { name: "Undo" }).click();
  await expect(cards).toHaveCount(before + 1);
  await expect(cards.filter({ hasText: "Desk strip" })).toHaveCount(1);
  await expect.poll(async () => (await saved()).includes("Desk strip"), { timeout: 5000 }).toBe(true);
  expect(errors).toEqual([]);
});

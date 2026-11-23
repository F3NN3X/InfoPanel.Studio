import fs from "node:fs";
import path from "node:path";
import { expect, test } from "./fixtures";

// The studio's skip link (Gate 5, Q11): the first Tab stop, visible when focused, and Enter moves past the sidebar and
// the top bar (13 stops), so the next Tab is the page's own first control.

test("the skip link is the first Tab stop and lands past the sidebar and top bar", async ({ page, scratch }) => {
  const local = fs.readFileSync(path.join(scratch.dataDir, "config.json"), "utf8");
  await page.addInitScript((value) => localStorage.setItem("infopanel-dashboard:config:v1", value), local);
  await page.goto(`${scratch.base}/?studio=1`);
  await expect(page.getByRole("navigation", { name: "Studio views" })).toBeVisible();

  const skip = page.getByRole("button", { name: "Skip to content" });
  await expect(skip).not.toBeInViewport();
  await page.keyboard.press("Tab");
  await expect(skip).toBeFocused();
  await expect(skip).toBeInViewport();

  await page.keyboard.press("Enter");
  await expect(page.locator("#studio-content")).toBeFocused();
  await expect(page).toHaveURL(/\?studio=1$/);

  await page.keyboard.press("Tab");
  const afterTarget = await page.evaluate(() => {
    const target = document.getElementById("studio-content");
    const active = document.activeElement;
    if (!target || !active || active === document.body) return false;
    return Boolean(target.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING);
  });
  expect(afterTarget).toBe(true);
});

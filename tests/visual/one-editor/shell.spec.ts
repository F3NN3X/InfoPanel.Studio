import type { Page } from "@playwright/test";
import { expect, openFixture, shoot, test } from "./harness";

// The shell after phase 1: the kiosk chip lives in the status bar and opens Live, the sliders button is gone with its
// job in the breadcrumb's dropdown, and Export check is a palette entry.

const chip = (page: Page) => page.locator("footer").getByRole("button", { name: /^(Kiosks show|No kiosk shows)/ });

test("the kiosk chip is in the status bar, not the page tab row, and opens Live", async ({ page, scratch }) => {
  await openFixture(page, scratch.base, "screen");
  await expect(page.getByRole("tablist", { name: "Pages" }).locator("xpath=..").getByText(/Kiosks show|No kiosk shows/)).toHaveCount(0);
  await expect(chip(page)).toBeVisible();
  await shoot(page, "status-chip");
  await chip(page).click();
  await expect(page.getByRole("button", { name: "Open kiosk view" })).toBeVisible();
  await shoot(page, "status-chip-live");
});

test("the breadcrumb has Screen settings… and no sliders button", async ({ page, scratch }) => {
  await openFixture(page, scratch.base, "screen");
  await expect(page.locator("header").getByRole("button", { name: /settings$/ })).toHaveCount(0);
  await page.getByTitle("Switch screen or page").click();
  const entry = page.getByRole("button", { name: "Screen settings…" });
  await expect(entry).toBeVisible();
  await shoot(page, "breadcrumb");
  await entry.click();
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
  await expect(page.getByLabel("Screen details")).toBeVisible();
});

test("Export check is in the command palette on a screen made for InfoPanel only", async ({ page, scratch }) => {
  await openFixture(page, scratch.base, "export");
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", { name: "Command" }).fill("export check");
  await expect(page.getByRole("option", { name: /Export check/ })).toBeVisible();
  await shoot(page, "palette");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("export-check")).toBeVisible();
  await shoot(page, "palette-opened");
});

test("a screen made for Studio panels has no Export check entry", async ({ page, scratch }) => {
  await openFixture(page, scratch.base, "screen");
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", { name: "Command" }).fill("export");
  await expect(page.getByRole("option", { name: /Export & back up/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Export check/ })).toHaveCount(0);
});

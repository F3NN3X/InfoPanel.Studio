import type { Page } from "@playwright/test";
import { expect, manifest, test, watchErrors } from "./fixtures";

// Theme's live preview: a card clicked is drawn on the canvas and nothing is saved; Cancel (Esc) leaves the config as it
// was; Apply writes it in one undo step. With "Show on the kiosks too" a kiosk draws it until Cancel.

const { light } = manifest.profiles;
const [first] = manifest.zones.light;

/** A widget's card in the Theme view's canvas (the frame its preview badge sits in holds it). */
const previewCard = (page: Page, zone: string) =>
  page.getByRole("region", { name: "Preview" }).locator(`[data-preview-zone="${zone}"]`).locator("xpath=..").locator("[data-wp-tier]");
/** The light screen as the server stores it. */
const storedScreen = async (base: string) => {
  const config = await (await fetch(`${base}/api/config`)).json();
  return config.profiles.find((p: { id: string }) => p.id === light);
};

test("preview a theme: Cancel leaves the config as it was, Apply writes it in one undo step", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  await page.goto(`${scratch.base}/?studio=1&profile=${light}`);
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  const card = previewCard(page, first);
  await expect(card).toBeVisible();
  const mat = await card.getAttribute("data-mat");
  expect(mat).not.toBe("look-term");
  const before = JSON.stringify(await storedScreen(scratch.base));

  // A click previews: the bar says so, Browse's detail and the canvas draw Term.
  await page.getByRole("tab", { name: /Browse themes/ }).click();
  await page.locator('[data-look-card="term"]').click();
  const bar = page.getByRole("region", { name: "Theme preview" });
  await expect(bar).toContainText("Previewing Term on");
  await expect(page.getByRole("complementary", { name: "Theme detail" }).locator('[data-mat="look-term"]').first()).toBeVisible();
  await page.getByRole("tab", { name: "Customise" }).click();
  await expect(card).toHaveAttribute("data-mat", "look-term");

  // Esc cancels: the canvas is the saved theme again, and the server's config never changed.
  await page.keyboard.press("Escape");
  await expect(bar).toHaveCount(0);
  await expect(card).toHaveAttribute("data-mat", mat!);
  await page.waitForTimeout(1500);
  expect(JSON.stringify(await storedScreen(scratch.base))).toBe(before);

  // Preview again, step on and back with the arrows, then Apply.
  await page.getByRole("tab", { name: /Browse themes/ }).click();
  await page.locator('[data-look-card="term"]').click();
  await page.keyboard.press("ArrowRight");
  await expect(bar).not.toContainText("Previewing Term on");
  await page.keyboard.press("ArrowLeft");
  await expect(bar).toContainText("Previewing Term on");
  await bar.getByRole("button", { name: "Apply" }).click();
  await expect(bar).toHaveCount(0);
  await expect.poll(async () => (await storedScreen(scratch.base))?.widgetTheme?.values?.lookId).toBe("term");
  await page.getByRole("tab", { name: "Customise" }).click();
  await expect(card).toHaveAttribute("data-mat", "look-term");

  // One Undo takes the whole apply back.
  const toast = page.getByRole("status").filter({ has: page.getByRole("button", { name: "Undo" }) });
  await toast.getByRole("button", { name: "Undo" }).click();
  await expect(card).toHaveAttribute("data-mat", mat!);
  await expect.poll(async () => JSON.stringify(await storedScreen(scratch.base))).toBe(before);
  expect(errors).toEqual([]);
});

test("Show on the kiosks too: a kiosk draws the preview, with its countdown, until Cancel", async ({ page, context, scratch }) => {
  const { errors } = watchErrors(page);
  const kiosk = await context.newPage();
  await kiosk.goto(`${scratch.base}/?kiosk=1&profile=${light}`);
  const kioskCard = kiosk.locator("[data-wp-tier]").first();
  await expect(kioskCard).toBeVisible();
  const look = await kioskCard.getAttribute("data-look");
  expect(look).not.toBe("term");

  await page.goto(`${scratch.base}/?studio=1&profile=${light}`);
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await page.getByRole("tab", { name: /Browse themes/ }).click();
  await page.locator('[data-look-card="term"]').click();
  const bar = page.getByRole("region", { name: "Theme preview" });
  await bar.getByRole("button", { name: "Preview options" }).click();
  await page.getByRole("switch", { name: "Show on the kiosks too" }).click();
  await page.keyboard.press("Escape");
  await expect(bar.getByTestId("kiosk-countdown")).toContainText(/On the kiosks · \d+ s/);
  await expect(kioskCard).toHaveAttribute("data-look", "term");

  await bar.getByRole("button", { name: "Cancel" }).click();
  // Back to the saved theme (Classic writes no `data-look`).
  await expect.poll(() => kioskCard.getAttribute("data-look")).toBe(look);
  expect((await storedScreen(scratch.base))?.widgetTheme?.values?.lookId).not.toBe("term");
  expect(errors).toEqual([]);
});

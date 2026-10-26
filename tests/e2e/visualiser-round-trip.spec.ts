import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, manifest, test, watchErrors } from "./fixtures";

// docs/desktop/webview-performance.md, "Hot and cold": the visualiser keeps moving after the studio was hidden and
// its canvas remounted (Screens → Design), fed by the fake Data API's moving spectrum.

const zone = manifest.zones.viz[1];

/** Whether the visualiser's canvas draws something different within 2 s. */
async function moves(page: Page): Promise<boolean> {
  const canvas = page.locator(`[data-zone-id="${zone}"] canvas`).first();
  const shot = () => canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const first = await shot();
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(250);
    if ((await shot()) !== first) return true;
  }
  return false;
}

/** Reports the page hidden, then visible again, the way the browser does for a minimized window. */
async function hideAndShow(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const set = (hidden: boolean) => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (hidden ? "hidden" : "visible") });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    set(true);
    await new Promise((r) => setTimeout(r, 1500));
    set(false);
  });
}

test("the visualiser moves after the studio was hidden and remounted", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  // A returning browser (as in studio-basics): its local copy already names the fake Data API.
  const local = fs.readFileSync(path.join(scratch.dataDir, "config.json"), "utf8");
  await page.addInitScript((value) => localStorage.setItem("infopanel-dashboard:config:v1", value), local);
  await page.goto(`${scratch.base}/?studio=1&profile=${manifest.profiles.viz}`);
  await page.locator('[aria-label="Edit"]').click();
  await page.locator(`[data-zone-id="${zone}"] canvas`).first().waitFor();
  await expect.poll(() => moves(page), { timeout: 10_000 }).toBe(true);

  await hideAndShow(page);
  await page.locator('[aria-label="Screens"]').click();
  await page.locator('[aria-label="Edit"]').click();
  await page.locator(`[data-zone-id="${zone}"] canvas`).first().waitFor();
  await expect.poll(() => moves(page), { timeout: 10_000 }).toBe(true);
  expect(errors).toEqual([]);
});

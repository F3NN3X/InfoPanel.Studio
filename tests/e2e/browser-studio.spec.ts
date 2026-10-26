import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, manifest, test } from "./fixtures";
import type { Scratch } from "../../tools/perf/scratch.mjs";

// The studio in a normal browser tab (Open the studio in › Edge app or Default browser): no shell asks it to save
// before it closes, Kiosk view can't resize the tab, and Help is the server's page. The rest of the suite already
// runs the browser studio at ?studio=1.

async function openStudio(page: Page, scratch: Scratch): Promise<void> {
  // A returning browser (as in studio-basics): its local copy already names the fake Data API.
  const local = fs.readFileSync(path.join(scratch.dataDir, "config.json"), "utf8");
  await page.addInitScript((value) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("infopanel-dashboard:config:v1", value);
  }, local);
  await page.goto(`${scratch.base}/?studio=1&profile=${manifest.profiles.light}`);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.locator(`[data-zone-id="${manifest.zones.light[1]}"]`).waitFor();
}

const savedText = async (scratch: Scratch) => (await fetch(`${scratch.base}/api/config`)).text();

test("closing the tab inside the save delay never loses the edit silently", async ({ page, scratch }) => {
  await openStudio(page, scratch);
  await page.locator(`[data-zone-id="${manifest.zones.light[1]}"]`).click();
  const name = page.getByLabel("Zone name");
  await name.fill("Closed tab edit");
  await name.press("Enter");
  let prompted = false;
  page.on("dialog", (dialog) => {
    prompted = dialog.type() === "beforeunload";
    void dialog.accept();
  });
  // Straight away: the 400 ms push hasn't run.
  await page.close({ runBeforeUnload: true });
  await page.waitForEvent("close");
  const saved = (await savedText(scratch)).includes("Closed tab edit");
  expect(prompted || saved, "the edit was neither saved nor the leave prompt shown").toBe(true);
});

test("hiding the tab saves the pending edit at once, and leaving after that doesn't ask", async ({ page, scratch }) => {
  await openStudio(page, scratch);
  // A paused page clock: the edit's own 400 ms push can't run however slow the machine is, so a request after the
  // hide can only be the hide's.
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 60_000));
  await page.locator(`[data-zone-id="${manifest.zones.light[1]}"]`).click();
  const name = page.getByLabel("Zone name");
  await name.fill("Hidden tab edit");
  await name.press("Enter");
  // The edit's own push waits 400 ms; the hide's goes out at once.
  const push = page.waitForRequest((r) => r.method() === "POST" && r.url() === `${scratch.base}/api/config`, { timeout: 2000 });
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await push;
  await expect.poll(() => savedText(scratch), { timeout: 5000 }).toContain("Hidden tab edit");
  // Saved, once the studio has the server's answer: nothing to ask about.
  await expect(page.getByLabel("Unsaved changes")).toHaveCount(0);
  let prompted = false;
  page.on("dialog", (dialog) => {
    prompted = true;
    void dialog.accept();
  });
  await page.close({ runBeforeUnload: true });
  await page.waitForEvent("close");
  expect(prompted).toBe(false);
});

test("Kiosk view opens the kiosk in a window of its own and the studio stays", async ({ page, scratch, context }) => {
  await openStudio(page, scratch);
  await page.getByRole("button", { name: /^Live control/ }).click();
  const button = page.getByRole("button", { name: "Open kiosk view" });
  await expect(button).toHaveAttribute("title", "Opens the kiosk in a separate window");
  const [popup] = await Promise.all([context.waitForEvent("page"), button.click()]);
  await popup.waitForLoadState();
  expect(popup.url()).toContain(`/?kiosk=1&profile=${manifest.profiles.light}`);
  await expect(popup.locator(manifest.kioskZoneSelector).first()).toBeVisible();
  // The studio's tab is still the studio.
  expect(new URL(page.url()).searchParams.get("studio")).toBe("1");
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
});

test("Help opens the server's Help page in a tab", async ({ page, scratch, context }) => {
  await openStudio(page, scratch);
  const [help] = await Promise.all([context.waitForEvent("page"), page.keyboard.press("F1")]);
  await help.waitForLoadState();
  expect(new URL(help.url()).pathname).toBe("/help.html");
  await expect(help.getByRole("heading").first()).toBeVisible();
});

test("a Settings change made in another browser reaches the studio's working copy", async ({ page, scratch }) => {
  await openStudio(page, scratch);
  // The app's Settings window is another browser: its channel can't reach this page, only the server can.
  const patched = await fetch(`${scratch.base}/api/config/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "X-Dashboard-Config": "1" },
    body: JSON.stringify({ general: { maxFps: 15 } }),
  });
  expect(patched.status).toBe(200);
  // Save writes the working copy to this browser's local copy too: the patch is in it.
  const localMaxFps = () =>
    page.evaluate(() => (JSON.parse(localStorage.getItem("infopanel-dashboard:config:v1") ?? "{}") as { general?: { maxFps?: number } }).general?.maxFps);
  await expect
    .poll(
      async () => {
        await page.keyboard.press("Control+s");
        return localMaxFps();
      },
      { timeout: 5000 }
    )
    .toBe(15);
});

test("the preview setting saved from the app reaches a studio in a fresh browser", async ({ page, scratch }) => {
  const saved = await fetch(`${scratch.base}/api/studio-prefs`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Dashboard-Config": "1" },
    body: JSON.stringify({ "studio.previewData": "frozen" }),
  });
  expect(saved.status).toBe(200);
  await openStudio(page, scratch);
  await expect(page.getByText(/^Frozen · /)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("studio.previewData"))).toBe("frozen");
});

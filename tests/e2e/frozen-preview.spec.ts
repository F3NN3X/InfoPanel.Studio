import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, manifest, test, watchErrors } from "./fixtures";
import type { Scratch } from "../../tools/perf/scratch.mjs";

// The frozen Design preview (src/lib/preview-data.ts) against the fake Data API, whose values move every second:
// the canvas holds still, Refresh moves it, the Data view is live and its streams close behind it, a kiosk on the
// same profile keeps updating, and the setting survives a reload. The default (live) is the rest of the suite.

const cpuZone = manifest.zones.light[1];

/** Counts the page's open Data API EventSources (`window.__dataStreams()`). */
const STREAMS_INIT = (dataApi: string) => `(() => {
  const Native = window.EventSource;
  let open = 0;
  window.__dataStreams = () => open;
  window.EventSource = class extends Native {
    constructor(url, init) {
      super(url, init);
      this.counted = String(url).startsWith(${JSON.stringify(dataApi)});
      if (this.counted) open++;
    }
    close() {
      if (this.counted && this.readyState !== 2) open--;
      super.close();
    }
  };
})();`;

async function openStudio(page: Page, scratch: Scratch, previewData: string | null): Promise<void> {
  // A returning browser (as in studio-basics): its local copy already names the fake Data API.
  const local = fs.readFileSync(path.join(scratch.dataDir, "config.json"), "utf8");
  await page.addInitScript(
    ([config, mode]) => {
      if (sessionStorage.getItem("seeded")) return;
      sessionStorage.setItem("seeded", "1");
      localStorage.setItem("infopanel-dashboard:config:v1", config);
      if (mode) localStorage.setItem("studio.previewData", mode);
    },
    [local, previewData] as const
  );
  await page.addInitScript(STREAMS_INIT(scratch.dataApi));
  await page.goto(`${scratch.base}/?studio=1&profile=${manifest.profiles.light}`);
  await page.locator('[aria-label="Design"]').click();
  await page.locator(`[data-zone-id="${cpuZone}"]`).waitFor();
}

const cpuText = (page: Page) => page.locator(`[data-zone-id="${cpuZone}"]`).innerText();
const streams = (page: Page) => page.evaluate(() => (window as unknown as { __dataStreams: () => number }).__dataStreams());

test("frozen: the canvas holds still, Refresh moves it, and the studio opens no stream of its own", async ({ page, scratch }) => {
  const { errors } = watchErrors(page);
  await openStudio(page, scratch, "frozen");
  await expect(page.getByText(/^Frozen · \d/)).toBeVisible();
  const held = await cpuText(page);
  await page.waitForTimeout(3500);
  expect(await cpuText(page)).toBe(held);
  // Screens, where the studio opens, was live: its streams close 2 s after Design replaces it.
  await expect.poll(() => streams(page), { timeout: 10_000 }).toBe(0);

  // The fake values move every second: some refresh within a few lands on a new one.
  await expect
    .poll(
      async () => {
        await page.getByRole("button", { name: /Refresh the snapshot/ }).click();
        await page.waitForTimeout(1200);
        return (await cpuText(page)) !== held;
      },
      { timeout: 15_000, intervals: [0] }
    )
    .toBe(true);
  expect(errors).toEqual([]);
});

test("frozen: the Data view is live, and its streams close when it does", async ({ page, scratch }) => {
  await openStudio(page, scratch, "frozen");
  await expect.poll(() => streams(page), { timeout: 10_000 }).toBe(0);
  await page.locator('[aria-label="Data"]').click();
  await expect.poll(() => streams(page), { timeout: 10_000 }).toBeGreaterThan(0);
  await page.locator('[aria-label="Design"]').click();
  // The store closes a released stream after a 2 s grace.
  await expect.poll(() => streams(page), { timeout: 10_000 }).toBe(0);
});

test("frozen in the studio: a kiosk on the same profile keeps updating", async ({ page, scratch, context }) => {
  await openStudio(page, scratch, "frozen");
  const kiosk = await context.newPage();
  await kiosk.goto(`${scratch.base}/?kiosk=1&profile=${manifest.profiles.light}`);
  const cell = kiosk.locator(manifest.kioskZoneSelector).nth(1);
  await cell.waitFor();
  const first = await cell.innerText();
  await expect.poll(() => cell.innerText(), { timeout: 15_000 }).not.toBe(first);
});

test("the setting survives a reload; Go live lasts the session only", async ({ page, scratch }) => {
  await openStudio(page, scratch, "frozen");
  await expect(page.getByText(/^Frozen · /)).toBeVisible();
  await page.getByRole("button", { name: "Go live for this session" }).click();
  await expect(page.getByText(/^Frozen · /)).toHaveCount(0);
  await expect.poll(() => streams(page), { timeout: 10_000 }).toBeGreaterThan(0);
  await page.reload();
  await page.locator('[aria-label="Design"]').click();
  await expect(page.getByText(/^Frozen · /)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("studio.previewData"))).toBe("frozen");
});

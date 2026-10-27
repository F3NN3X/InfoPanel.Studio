import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test as base, expect, type Page } from "@playwright/test";
import { startScratch, type Scratch } from "../../../tools/perf/scratch.mjs";
import { DEFAULT_DATA_API } from "../../e2e/fixtures";

export { expect };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
/** The build that serves ?fixture=one-editor/<name> (build.setup.ts, or npm run build:fixtures). */
export const FIXTURES_DIST = path.join(ROOT, ".cache/dist-fixtures");

/** Each test gets its own scratch server on the fixtures build, so a fixture never meets another test's data. */
export const test = base.extend<{ scratch: Scratch }>({
  context: async ({ context }, use) => {
    await context.route(DEFAULT_DATA_API, (route) => route.abort("connectionrefused"));
    await use(context);
  },
  // biome-ignore lint/correctness/noEmptyPattern: Playwright reads a fixture's dependencies from this destructuring.
  scratch: async ({}, use) => {
    if (!fs.existsSync(path.join(FIXTURES_DIST, "index.html"))) throw new Error("no fixtures build; run npm run build:fixtures");

    const scratch = await startScratch({ env: { DASHBOARD_DIST: FIXTURES_DIST } });
    await use(scratch);
    scratch.stop();
  },
});

/** Open `?fixture=one-editor/<name>` at the reference's 1440 × 880 and wait for Edit's canvas. */
export async function openFixture(page: Page, base: string, name: string): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 880 });
  await page.goto(`${base}/?fixture=one-editor/${name}`);
  await expect(page.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
}

/** Where a shot goes when ONE_EDITOR_SHOTS names a folder (the gate report's, beside the reference's); otherwise nowhere. */
export async function shoot(page: Page, name: string): Promise<void> {
  const dir = process.env.ONE_EDITOR_SHOTS;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`) });
}

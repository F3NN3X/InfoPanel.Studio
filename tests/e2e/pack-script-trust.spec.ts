import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Page } from "@playwright/test";
import { startScratch } from "../../tools/perf/scratch.mjs";
import { countersign, signPack } from "../../tools/packs/sign.mjs";
import { generateKeyPair, readSecretKey } from "../../tools/widgets/minisign.mjs";
import { expect, makePack, manifest, saveConfig, settled, test } from "./fixtures";

// A pack's effect script against the REAL server (the trust, consent and script routes, no `page.route` stand-ins): an unverified pack
// asks once in the studio, Allow lets the kiosk run it, Don't allow keeps it off, a pack whose bytes change after signing is refused,
// and PACK_SCRIPTS=off stops every script. The scratch server and its data and config folders are throwaways.

const { light } = manifest.profiles;
const DEMO = fs.readFileSync(path.join("tests", "fixtures", "packs", "script", "demo.js"), "utf8");

/** A pack folder in `tmp` with the demo script listed in its assets and named by `pack.json`. */
function scripted(tmp: string, id: string): string {
  return makePack(tmp, id, (dir) => {
    fs.writeFileSync(path.join(dir, "assets", "fx.js"), DEMO);
    const file = path.join(dir, "pack.json");
    fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, "utf8")), script: { file: "fx.js" } }));
  });
}

const trust = async (base: string, id: string) => (await (await fetch(`${base}/api/packs/${id}/trust`)).json()) as Record<string, unknown>;

/** Wear pack `id` on the light screen at Full effects. */
async function wear(base: string, id: string) {
  const config = await (await fetch(`${base}/api/config`)).json();
  config.profiles = config.profiles.map((p: { id: string; performance?: object; widgetTheme?: { values?: object } }) =>
    p.id === light ? { ...p, performance: { ...p.performance, fx: "full" }, widgetTheme: { ...p.widgetTheme, values: { ...p.widgetTheme?.values, lookId: id } } } : p
  );
  expect((await saveConfig(base, config)).ok).toBe(true);
}

/** The kiosk page, once the screen wears the pack. */
async function kiosk(page: Page, base: string, id: string): Promise<Page> {
  const k = await page.context().newPage();
  await k.setViewportSize({ width: 1280, height: 720 });
  await k.goto(`${base}/?kiosk=1&profile=${light}`);
  await expect(k.locator(`[data-wp-tier][data-look="${id}"]`).first()).toBeAttached({ timeout: 15_000 });
  await settled(k, manifest.kioskZoneSelector);
  return k;
}

const state = (k: Page) => k.locator("[data-pack-script]").getAttribute("data-pack-script");
const canvas = (k: Page) => k.locator("canvas[data-pack-script-canvas]");

/** Imports the folder in Browse themes, applies it to the light screen and returns the studio page at the question. */
async function importAndWear(page: Page, base: string, dir: string) {
  await page.goto(`${base}/?studio=1&profile=${light}`);
  await page.getByRole("button", { name: "Theme", exact: true }).click();
  await page.getByRole("tab", { name: /Browse themes/ }).click();
  const section = page.getByRole("region", { name: "Import a pack" });
  await section.locator("[data-pack-folder]").setInputFiles(dir);
  await expect(section.locator("[data-pack-report]")).toContainText("Imported Mine");
  await page.getByRole("region", { name: "Yours" }).locator('[data-look-card="mine"]').click();
  await page.getByRole("complementary", { name: "Theme detail" }).getByRole("button", { name: /^Apply to/ }).click();
  await expect.poll(async () => JSON.stringify(await (await fetch(`${base}/api/config`)).json()).includes('"lookId":"mine"')).toBe(true);
}

/** Reloads the studio and opens the screen's canvas, where the pack is drawn (and its script asks). */
async function openCanvas(page: Page) {
  await page.reload();
  await page.getByRole("button", { name: /^Edit/ }).first().click();
}

test.describe("a pack's script and the server's trust", () => {
  test.setTimeout(90_000);

  test("an unverified pack asks once in the studio: Allow runs it in the kiosk, and the answer is the server's", async ({ page, scratch }) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ips-script-trust-"));
    try {
      await importAndWear(page, scratch.base, scripted(tmp, "mine"));
      expect(await trust(scratch.base, "mine")).toMatchObject({ state: "unverified", hasScript: true, consent: "none", scriptRuns: false });
      // the kiosk never asks, and nothing runs before the answer
      const before = await kiosk(page, scratch.base, "mine");
      await before.waitForTimeout(1200);
      expect([await canvas(before).count(), await state(before), await before.getByTestId("script-consent").count()]).toEqual([0, "waiting", 0]);
      await before.close();

      await openCanvas(page);
      const dialog = page.getByTestId("script-consent");
      await expect(dialog).toBeVisible({ timeout: 15_000 });
      await dialog.getByRole("button", { name: "Allow for this pack" }).click();
      await expect(dialog).toHaveCount(0);
      await expect.poll(async () => (await trust(scratch.base, "mine")).consent).toBe("granted");
      expect((await trust(scratch.base, "mine")).scriptRuns).toBe(true);
      // the script comes only by its hash, never by the file route
      const sha = (await trust(scratch.base, "mine")).scriptSha256;
      expect(await (await fetch(`${scratch.base}/api/packs/mine/fx.js?sha256=${sha}`)).text()).toBe(DEMO);
      expect((await fetch(`${scratch.base}/api/packs/mine/assets/fx.js`)).status).toBe(404);

      const after = await kiosk(page, scratch.base, "mine");
      await expect(canvas(after)).toBeAttached({ timeout: 15_000 });
      expect(await state(after)).toBe("running");
      await after.close();

      // asked once: the studio does not ask again
      await openCanvas(page);
      await page.waitForTimeout(1500);
      await expect(page.getByTestId("script-consent")).toHaveCount(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("Don't allow keeps the script off, in the kiosk too, and the studio does not ask again", async ({ page, scratch }) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ips-script-trust-"));
    try {
      await importAndWear(page, scratch.base, scripted(tmp, "mine"));
      await openCanvas(page);
      const dialog = page.getByTestId("script-consent");
      await expect(dialog).toBeVisible({ timeout: 15_000 });
      await dialog.getByRole("button", { name: "Don't allow" }).click();
      await expect.poll(async () => (await trust(scratch.base, "mine")).consent).toBe("denied");
      expect((await trust(scratch.base, "mine")).scriptRuns).toBe(false);
      expect((await fetch(`${scratch.base}/api/packs/mine/fx.js`)).status).toBe(404);
      const k = await kiosk(page, scratch.base, "mine");
      await k.waitForTimeout(1500);
      expect([await canvas(k).count(), await state(k)]).toEqual([0, "waiting"]);
      await k.close();
      await openCanvas(page);
      await page.waitForTimeout(1500);
      await expect(page.getByTestId("script-consent")).toHaveCount(0);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("a pack whose bytes change after signing is refused and its script never runs; PACK_SCRIPTS=off stops a verified one", async ({ page }) => {
    // Themely's pack key is a debug build's test key from the environment; the publisher's key signs, Themely's countersigns
    const themely = generateKeyPair();
    const publisher = generateKeyPair();
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ips-script-trust-"));
    const on = await startScratch({ env: { PACK_THEMELY_TEST_KEY: themely.publicText.split("\n")[1] } });
    const off = await startScratch({ env: { PACK_THEMELY_TEST_KEY: themely.publicText.split("\n")[1], PACK_SCRIPTS: "off" } });
    try {
      const dir = scripted(tmp, "mine");
      signPack(dir, readSecretKey(publisher.secretText));
      countersign(dir, readSecretKey(themely.secretText), publisher.publicText.split("\n")[1], { checksVersion: 1 });
      for (const s of [on, off]) fs.cpSync(dir, path.join(s.dataDir, "packs", "mine"), { recursive: true });

      // verified: no question, it runs
      expect(await trust(on.base, "mine")).toMatchObject({ state: "verified", scriptRuns: true });
      await wear(on.base, "mine");
      const running = await kiosk(page, on.base, "mine");
      await expect(canvas(running)).toBeAttached({ timeout: 15_000 });
      await running.close();

      // the switch is off: verified or not, nothing runs and the script is not served
      expect(await trust(off.base, "mine")).toMatchObject({ state: "verified", scriptRuns: false });
      expect((await fetch(`${off.base}/api/packs/mine/fx.js`)).status).toBe(404);
      await wear(off.base, "mine");
      const stopped = await kiosk(page, off.base, "mine");
      await stopped.waitForTimeout(1500);
      expect(await canvas(stopped).count()).toBe(0);
      await stopped.close();

      // one byte of look.json changes after it was signed: refused, listed with its reason, files 403, no script
      const look = path.join(on.dataDir, "packs", "mine", "look.json");
      fs.writeFileSync(look, `${fs.readFileSync(look, "utf8")} `);
      const t = await trust(on.base, "mine");
      expect(t).toMatchObject({ state: "modified", scriptRuns: false });
      expect(t.reason).toBeTruthy();
      expect((await fetch(`${on.base}/api/packs/mine/fx.js`)).status).toBe(404);
      expect((await fetch(`${on.base}/api/packs/mine/look.json`)).status).toBe(403);
      const refused = await kiosk(page, on.base, "mine").catch(() => undefined);
      if (refused) {
        await refused.waitForTimeout(1500);
        expect(await canvas(refused).count()).toBe(0);
        await refused.close();
      }
    } finally {
      on.stop();
      off.stop();
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});

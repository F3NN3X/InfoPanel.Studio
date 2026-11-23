import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, makePack, manifest, saveConfig, settled, test } from "./fixtures";

// A pack's motion block (L117) in the kiosk: a user pack with every effect (tests/fixtures/packs/motion) decodes its labels, keeps the real
// text in the page, and runs its repeats one at a time at least a second apart at Full; Calm runs no repeat, and Off and reduced motion draw none of it.

const { light } = manifest.profiles;
const ID = "motion-user";
const MOTION = JSON.parse(fs.readFileSync(path.join("tests", "fixtures", "packs", "motion", "motion.json"), "utf8"));
/** The attributes the runtime sets for one run of a repeat. */
const REPEATS = ["data-mo-glitch", "data-mo-flicker", "data-mo-sweep"];

/** Field Kit with the fixture's motion, stored in the scratch data folder as a user pack (no pack.css, so nothing to sign), and worn by the screen at `fx`. */
async function wear(base: string, dataDir: string, fx: "full" | "calm" | "off") {
  if (!fs.existsSync(path.join(dataDir, "packs", ID))) {
    makePack(path.join(dataDir, "packs"), ID, (dir) => {
      const file = path.join(dir, "pack.json");
      fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, "utf8")), motion: MOTION }));
    });
  }
  const config = await (await fetch(`${base}/api/config`)).json();
  config.profiles = config.profiles.map((p: { id: string; performance?: object; widgetTheme?: { values?: object } }) =>
    p.id === light ? { ...p, performance: { ...p.performance, fx }, widgetTheme: { ...p.widgetTheme, values: { ...p.widgetTheme?.values, lookId: ID } } } : p
  );
  expect((await saveConfig(base, config)).ok).toBe(true);
}

/** A kiosk page that records, from its first script on, when each repeat's attribute is set. */
async function kiosk(page: Page, base: string, reduce = false): Promise<Page> {
  const k = await page.context().newPage();
  if (reduce) await k.emulateMedia({ reducedMotion: "reduce" });
  await k.addInitScript((names) => {
    const w = window as unknown as { __mo: { at: number; name: string }[] };
    w.__mo = [];
    new MutationObserver((records) => {
      for (const r of records) if (r.attributeName && (r.target as Element).hasAttribute(r.attributeName)) w.__mo.push({ at: performance.now(), name: r.attributeName });
    }).observe(document, { subtree: true, attributes: true, attributeFilter: names });
  }, REPEATS);
  await k.setViewportSize({ width: 1280, height: 720 });
  await k.goto(`${base}/?kiosk=1&profile=${light}`);
  await expect(k.locator(`[data-wp-tier][data-look="${ID}"]`).first()).toBeAttached({ timeout: 15_000 });
  await settled(k, manifest.kioskZoneSelector);
  return k;
}

const runs = (k: Page) => k.evaluate(() => (window as unknown as { __mo: { at: number; name: string }[] }).__mo);
const marks = (k: Page) => k.evaluate(() => document.querySelectorAll("[data-mo-text], [data-mo-layer], [data-mo-arrive]").length);

test.describe("a pack's motion", () => {
  test.setTimeout(90_000);

  test("runs at Full with the text in place, keeps the one-shots at Calm, and draws nothing at Off or under reduced motion", async ({ page, scratch }) => {
    await wear(scratch.base, scratch.dataDir, "full");
    const full = await kiosk(page, scratch.base);
    // the labels' real text is in the page: the noise copy beside it is aria-hidden and empty between runs
    const label = await full.evaluate(() => {
      const t = document.querySelector('[data-wp-tier] [data-part="label"] [data-mo-text]');
      const copy = t?.querySelector("[data-mo-copy]");
      return { text: t?.firstChild?.textContent ?? "", hidden: copy?.getAttribute("aria-hidden"), noise: copy?.textContent };
    });
    expect(label.text.length).toBeGreaterThan(0);
    expect(label).toMatchObject({ hidden: "true", noise: "" });
    expect(await full.locator("[data-mo-layer]").count()).toBeGreaterThan(0);
    // the repeats: flicker every 2 s, sweep every 4 s (a glitch also tears on arrival, so only these two are repeats alone), never two runs closer than a second
    const repeats = async () => (await runs(full)).filter((r) => r.name !== "data-mo-glitch");
    await expect.poll(async () => { const r = await repeats(); return r.length > 3 && new Set(r.map((x) => x.name)).size === 2; }, { timeout: 30_000 }).toBe(true);
    const at = (await repeats()).map((r) => r.at);
    for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(990);
    await full.close();

    await wear(scratch.base, scratch.dataDir, "calm");
    const calm = await kiosk(page, scratch.base);
    expect(await calm.locator("[data-mo-text]").count()).toBeGreaterThan(0);
    const settledAt = await calm.evaluate(() => performance.now());
    await calm.waitForTimeout(6000);
    expect((await runs(calm)).filter((r) => r.at > settledAt && r.name !== "data-mo-glitch")).toEqual([]);
    await calm.close();

    await wear(scratch.base, scratch.dataDir, "off");
    const off = await kiosk(page, scratch.base);
    expect(await marks(off)).toBe(0);
    await off.waitForTimeout(3000);
    expect(await runs(off)).toEqual([]);
    await off.close();

    await wear(scratch.base, scratch.dataDir, "full");
    const reduced = await kiosk(page, scratch.base, true);
    expect(await marks(reduced)).toBe(0);
    await reduced.waitForTimeout(3000);
    expect(await runs(reduced)).toEqual([]);
    await reduced.close();
  });
});

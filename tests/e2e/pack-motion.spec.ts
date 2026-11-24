import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, makePack, manifest, saveConfig, settled, test } from "./fixtures";

// A pack's motion block (L117) in the kiosk: a user pack with every effect (tests/fixtures/packs/motion) decodes its labels, keeps the real
// text in the page, boots its page, moves its animated page layer and runs its repeats one at a time at least a second apart at Full; Calm
// boots the page (a one-shot), runs no repeat and holds the layer still; Off and reduced motion draw none of it and hold the layer still.

const { light } = manifest.profiles;
const ID = "motion-user";
const MOTION = JSON.parse(fs.readFileSync(path.join("tests", "fixtures", "packs", "motion", "motion.json"), "utf8"));
/** The attributes the runtime sets for one run of a repeat. */
const REPEATS = ["data-mo-glitch", "data-mo-flicker", "data-mo-sweep"];
/** The attribute a card's boot sets for its one run. */
const BOOT = "data-mo-boot";

/** Field Kit with the fixture's motion and its animated SVG as the last page layer, stored in the scratch data folder as a user pack (no pack.css, so nothing to sign), and worn by the screen at `fx`. */
async function wear(base: string, dataDir: string, fx: "full" | "calm" | "off") {
  if (!fs.existsSync(path.join(dataDir, "packs", ID))) {
    makePack(path.join(dataDir, "packs"), ID, (dir) => {
      const file = path.join(dir, "pack.json");
      const pack = JSON.parse(fs.readFileSync(file, "utf8"));
      fs.copyFileSync(path.join("tests", "fixtures", "packs", "motion", "orbit.svg"), path.join(dir, "assets", "orbit.svg"));
      const layers = [...pack.stage.layers.slice(0, 2), { image: "orbit.svg", animated: true }];
      fs.writeFileSync(file, JSON.stringify({ ...pack, stage: { ...pack.stage, layers }, motion: MOTION }));
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
  }, [...REPEATS, BOOT]);
  await k.setViewportSize({ width: 1280, height: 720 });
  await k.goto(`${base}/?kiosk=1&profile=${light}`);
  await expect(k.locator(`[data-wp-tier][data-look="${ID}"]`).first()).toBeAttached({ timeout: 15_000 });
  await settled(k, manifest.kioskZoneSelector);
  return k;
}

const runs = (k: Page) => k.evaluate(() => (window as unknown as { __mo: { at: number; name: string }[] }).__mo);
const marks = (k: Page) => k.evaluate(() => document.querySelectorAll("[data-mo-text], [data-mo-layer], [data-mo-arrive], [data-mo-body]").length);
/** The animated page layer: whether it moves, and the image it draws (the pack's file, or the still copy as a data URL). */
const layer = (k: Page) =>
  k.evaluate(() => {
    const el = document.querySelector<HTMLElement>("[data-pack-moving]");
    return { moving: el?.getAttribute("data-pack-moving"), image: el?.style.backgroundImage ?? "" };
  });
/** The layer is held still: its still copy (no animation in it) once read, never the moving file. */
async function stillLayer(k: Page) {
  await expect.poll(async () => (await layer(k)).image, { timeout: 5000 }).toMatch(/^url\("data:image\/svg\+xml/);
  const { moving, image } = await layer(k);
  expect(moving).toBe("still");
  expect(decodeURIComponent(image)).not.toMatch(/animate|@keyframes/);
}

test.describe("a pack's motion", () => {
  test.setTimeout(90_000);

  test("runs at Full with the text in place, keeps the one-shots at Calm, and draws nothing at Off or under reduced motion", async ({ page, scratch }) => {
    await wear(scratch.base, scratch.dataDir, "full");
    const full = await kiosk(page, scratch.base);
    // the titles' real text is in the page (this screen's cards have titles and numbers): the noise copy beside it is aria-hidden and empty between runs
    const title = () =>
      full.evaluate(() => {
        const t = document.querySelector('[data-wp-tier] [data-part="header"] [data-mo-text]');
        const copy = t?.querySelector("[data-mo-copy]");
        return { text: t?.firstChild?.textContent ?? "", hidden: copy?.getAttribute("aria-hidden"), noise: copy?.textContent ?? "" };
      });
    const first = await title();
    expect(first.text.length).toBeGreaterThan(0);
    expect(first.hidden).toBe("true");
    // a decode still running has noise of the text's length; once it has run, none
    if (first.noise) expect(first.noise.length).toBe(first.text.length);
    await expect.poll(async () => (await title()).noise, { timeout: 5000 }).toBe("");
    expect((await title()).text).toBe(first.text);
    expect(await full.locator('[data-wp-tier] [data-part="num"] [data-mo-text]').count()).toBeGreaterThan(0);
    expect(await full.locator("[data-mo-layer]").count()).toBeGreaterThan(0);
    // the page booted once, card after card; the animated layer moves (the pack's own file)
    expect((await runs(full)).filter((r) => r.name === BOOT).length).toBeGreaterThan(1);
    expect(await layer(full)).toEqual({ moving: "on", image: expect.stringMatching(/orbit\.svg"\)$/) });
    // the repeats: flicker every 2 s, sweep every 4 s (a glitch also tears on arrival, so only these two are repeats alone), never two runs closer than a second
    const repeats = async () => (await runs(full)).filter((r) => r.name !== "data-mo-glitch" && r.name !== BOOT);
    await expect.poll(async () => { const r = await repeats(); return r.length > 3 && new Set(r.map((x) => x.name)).size === 2; }, { timeout: 30_000 }).toBe(true);
    const at = (await repeats()).map((r) => r.at);
    for (let i = 1; i < at.length; i++) expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(990);
    await full.close();

    await wear(scratch.base, scratch.dataDir, "calm");
    const calm = await kiosk(page, scratch.base);
    expect(await calm.locator("[data-mo-text]").count()).toBeGreaterThan(0);
    // the boot is a one-shot: it plays at Calm, before the page settles
    expect((await runs(calm)).filter((r) => r.name === BOOT).length).toBeGreaterThan(1);
    await stillLayer(calm);
    const settledAt = await calm.evaluate(() => performance.now());
    await calm.waitForTimeout(6000);
    expect((await runs(calm)).filter((r) => r.at > settledAt && r.name !== "data-mo-glitch" && r.name !== BOOT)).toEqual([]);
    await calm.close();

    await wear(scratch.base, scratch.dataDir, "off");
    const off = await kiosk(page, scratch.base);
    expect(await marks(off)).toBe(0);
    await stillLayer(off);
    await off.waitForTimeout(3000);
    expect(await runs(off)).toEqual([]);
    await off.close();

    await wear(scratch.base, scratch.dataDir, "full");
    const reduced = await kiosk(page, scratch.base, true);
    expect(await marks(reduced)).toBe(0);
    await stillLayer(reduced);
    await reduced.waitForTimeout(3000);
    expect(await runs(reduced)).toEqual([]);
    await reduced.close();
  });
});

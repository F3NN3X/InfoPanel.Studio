import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { Page } from "@playwright/test";
import { expect, makePack, manifest, saveConfig, settled, test } from "./fixtures";

// A pack's effect script in the kiosk (G4 as changed 2026-11-23): it runs in the QuickJS worker only when the server's trust answer
// says so, and only at Full or Calm; an adversarial script reaches nothing (a local listener hears no request), an infinite loop and a
// memory bomb are ended within a second, and the kiosk keeps its frame rate. The trust and script routes are the server lane's: until
// they land, this spec answers them itself (`page.route`), as the contract gives them.

const { light } = manifest.profiles;
const ID = "script-user";
const SCRIPTS = path.join("tests", "fixtures", "packs", "script");
const script = (name: string) => fs.readFileSync(path.join(SCRIPTS, `${name}.js`), "utf8");

/**
 * Field Kit as a user pack with a script, listed in its assets like any other, worn by the screen at `fx`. The file itself is not
 * in the folder: the server serves it only through `/fx.js` (answered here), and this server's folder scan does not take a `.js` yet.
 */
async function wear(base: string, dataDir: string, fx: "full" | "calm" | "off") {
  if (!fs.existsSync(path.join(dataDir, "packs", ID))) {
    const dir = makePack(path.join(dataDir, "packs"), ID);
    const file = path.join(dir, "pack.json");
    const pack = JSON.parse(fs.readFileSync(file, "utf8"));
    fs.writeFileSync(file, JSON.stringify({ ...pack, script: { file: "fx.js" }, assets: [...pack.assets, { file: "fx.js", bytes: script("demo").length }] }));
  }
  const config = await (await fetch(`${base}/api/config`)).json();
  config.profiles = config.profiles.map((p: { id: string; performance?: object; widgetTheme?: { values?: object } }) =>
    p.id === light ? { ...p, performance: { ...p.performance, fx }, widgetTheme: { ...p.widgetTheme, values: { ...p.widgetTheme?.values, lookId: ID } } } : p
  );
  expect((await saveConfig(base, config)).ok).toBe(true);
}

/** A kiosk page whose server says the script runs and serves `source`; it records when the script's state changes and counts animation frames. */
async function kiosk(page: Page, base: string, source: string, opts: { reduce?: boolean; runs?: boolean } = {}): Promise<Page> {
  const k = await page.context().newPage();
  if (opts.reduce) await k.emulateMedia({ reducedMotion: "reduce" });
  const runs = opts.runs ?? true;
  await k.route(`**/api/packs/${ID}/trust`, (r) => r.fulfill({ json: { state: "unverified", hasScript: true, consent: runs ? "granted" : "none", scriptRuns: runs } }));
  await k.route(`**/api/packs/${ID}/fx.js`, (r) => (runs ? r.fulfill({ body: source, headers: { "Content-Type": "text/javascript", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }) : r.fulfill({ status: 404 })));
  await k.addInitScript(() => {
    const w = window as unknown as { __fx: { at: number; state: string }[]; __frames: number[] };
    w.__fx = [];
    w.__frames = [];
    const count = (t: number) => {
      w.__frames.push(t);
      requestAnimationFrame(count);
    };
    requestAnimationFrame(count);
    new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target as Element;
        if (r.attributeName === "data-fx-ready") w.__fx.push({ at: performance.now(), state: "ready" });
        else if (el.hasAttribute("data-pack-script")) w.__fx.push({ at: performance.now(), state: el.getAttribute("data-pack-script") ?? "" });
      }
    }).observe(document, { subtree: true, attributes: true, childList: true, attributeFilter: ["data-pack-script", "data-fx-ready"] });
  });
  await k.setViewportSize({ width: 1280, height: 720 });
  await k.goto(`${base}/?kiosk=1&profile=${light}`);
  await expect(k.locator(`[data-wp-tier][data-look="${ID}"]`).first()).toBeAttached({ timeout: 15_000 });
  await settled(k, manifest.kioskZoneSelector);
  return k;
}

const state = (k: Page) => k.locator("[data-pack-script]").getAttribute("data-pack-script");
const canvas = (k: Page) => k.locator("canvas[data-pack-script-canvas]");
/** The animation frames the page drew in the last `ms`, as frames a second. */
const fps = (k: Page, ms: number) =>
  k.evaluate((span) => {
    const f = (window as unknown as { __frames: number[] }).__frames;
    const end = f[f.length - 1];
    return (f.filter((t) => t > end - span).length * 1000) / span;
  }, ms);

/** The longest time between two of the page's animation frames from `from` to `to` (page time, ms). */
const longestGap = (k: Page, from: number, to: number) =>
  k.evaluate(([a, b]) => {
    const f = (window as unknown as { __frames: number[] }).__frames.filter((t) => t >= a - 50 && t <= b);
    return f.slice(1).reduce((m, t, i) => Math.max(m, t - f[i]), 0);
  }, [from, to] as const);

test.describe("a pack's effect script", () => {
  test.setTimeout(90_000);

  test("draws at Full and Calm over the cards, click-through and hidden from assistive tech, and not at Off, under reduced motion or without the server's word", async ({ page, scratch }) => {
    await wear(scratch.base, scratch.dataDir, "full");
    const full = await kiosk(page, scratch.base, script("demo"));
    await expect(canvas(full)).toBeAttached({ timeout: 10_000 });
    expect(await state(full)).toBe("running");
    expect(await canvas(full).getAttribute("aria-hidden")).toBe("true");
    expect(await canvas(full).evaluate((c) => getComputedStyle(c).pointerEvents)).toBe("none");
    // it moves: two shots of the overlay a moment apart differ, and it stays running (the demo is well inside its budget)
    await full.waitForTimeout(1000);
    const a = await canvas(full).screenshot();
    await full.waitForTimeout(400);
    expect((await canvas(full).screenshot()).equals(a)).toBe(false);
    await full.waitForTimeout(1500);
    expect(await state(full)).toBe("running");
    expect(await fps(full, 1000)).toBeGreaterThan(45);
    // a hidden page ends the worker; back in view, a new one starts
    await full.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(canvas(full)).toHaveCount(0);
    await full.evaluate(() => {
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(canvas(full)).toBeAttached();
    await full.close();

    await wear(scratch.base, scratch.dataDir, "calm");
    const calm = await kiosk(page, scratch.base, script("demo"));
    await expect(canvas(calm)).toBeAttached({ timeout: 10_000 });
    await calm.close();

    await wear(scratch.base, scratch.dataDir, "off");
    const off = await kiosk(page, scratch.base, script("demo"));
    await off.waitForTimeout(1500);
    expect(await canvas(off).count()).toBe(0);
    expect(await state(off)).toBe("waiting");
    await off.close();

    await wear(scratch.base, scratch.dataDir, "full");
    const reduced = await kiosk(page, scratch.base, script("demo"), { reduce: true });
    const refused = await kiosk(page, scratch.base, script("demo"), { runs: false });
    await reduced.waitForTimeout(1500);
    expect(await canvas(reduced).count()).toBe(0);
    // the kiosk never asks: an unanswered unverified pack just keeps its declarative parts
    expect(await canvas(refused).count()).toBe(0);
    expect(await refused.getByTestId("script-consent").count()).toBe(0);
  });

  test("an adversarial script reaches nothing and its endless frame is ended within a second; a memory bomb too", async ({ page, scratch }) => {
    const heard: string[] = [];
    const listener = http.createServer((req, res) => {
      heard.push(req.url ?? "");
      res.end();
    });
    listener.on("upgrade", (req, socket) => {
      heard.push(req.url ?? "");
      socket.destroy();
    });
    await new Promise<void>((done) => listener.listen(0, "127.0.0.1", done));
    const url = `http://127.0.0.1:${(listener.address() as AddressInfo).port}`;
    try {
      await wear(scratch.base, scratch.dataDir, "full");
      for (const name of ["adversarial", "bomb"]) {
        const k = await kiosk(page, scratch.base, script(name).replace("LISTENER", url));
        await expect.poll(() => state(k), { timeout: 10_000 }).not.toBe("waiting");
        await expect.poll(() => state(k), { timeout: 2000 }).toMatch(/^(fallback|stopped)$/);
        const log = await k.evaluate(() => (window as unknown as { __fx: { at: number; state: string }[] }).__fx);
        const ready = log.find((e) => e.state === "ready")?.at;
        const ended = log.find((e) => e.state === "fallback" || e.state === "stopped")!.at;
        // from the worker's first frame to the script's end (a top-level fault never gets to a first frame)
        expect(ready, name).toBeDefined();
        expect(ended - ready!, name).toBeLessThan(1000);
        expect(await canvas(k).count()).toBe(0);
        // the page's own frames never stalled while the script ran: its loop is the worker's, not the kiosk's
        const gap = await longestGap(k, ready!, ended + 200);
        expect(gap, name).toBeLessThan(100);
        // the page still answers, and its own cards are all there
        expect(await k.locator(`[data-wp-tier][data-look="${ID}"]`).count()).toBeGreaterThan(0);
        await k.waitForTimeout(500);
        await k.close();
      }
      expect(heard).toEqual([]);
    } finally {
      listener.close();
    }
  });
});

import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { test as base, expect, type Page } from "@playwright/test";
import { startScratch, FIXTURE_DIR, type Scratch } from "../../tools/perf/scratch.mjs";

/** tests/fixtures/perf/fixture.json: the fixture's profile and zone ids (tools/perf/make-fixture.mjs). */
export interface FixtureManifest {
  profiles: { heavy: string; light: string; viz: string };
  zones: { heavy: string[]; light: string[]; viz: string[] };
  gaugeIconZone: string;
  /** Studio zones (`data-zone-id`). */
  zoneSelector: string;
  /** Kiosk zones, in placement order (the kiosk marks none). */
  kioskZoneSelector: string;
  sensorKeys: string[];
  configVersion: number;
}

export const manifest: FixtureManifest = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, "..", "fixture.json"), "utf8"));

/** InfoPanel's default Data API: the real one on a dev machine, nothing in CI. Pages must use the fake one. */
export const DEFAULT_DATA_API = "http://127.0.0.1:3921/**";

/** Each test gets its own scratch server, so a spec that saves the config can't leak into another. */
export const test = base.extend<{ scratch: Scratch; makeAxeBuilder: () => AxeBuilder }>({
  // Refused like on a machine without InfoPanel, so a page that reaches for it fails here as in CI.
  context: async ({ context }, use) => {
    await context.route(DEFAULT_DATA_API, (route) => route.abort("connectionrefused"));
    await use(context);
  },
  // biome-ignore lint/correctness/noEmptyPattern: Playwright reads a fixture's dependencies from this destructuring.
  scratch: async ({}, use) => {
    const scratch = await startScratch();
    await use(scratch);
    scratch.stop();
  },
  // axe on the page, limited to the WCAG A and AA rules up to 2.2 (https://playwright.dev/docs/accessibility-testing).
  makeAxeBuilder: async ({ page }, use) => {
    await use(() => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]));
  },
});

export { expect };

/** Collect console errors and failed requests from a page (the kiosk must load clean). */
export function watchErrors(page: Page): { errors: string[] } {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`console: ${msg.text()}`);
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
  page.on("requestfailed", (req) => {
    // An EventSource closed by navigation or teardown reports as aborted; that is not a load failure.
    if (req.failure()?.errorText === "net::ERR_ABORTED") return;
    errors.push(`requestfailed: ${req.url()} ${req.failure()?.errorText}`);
  });
  page.on("response", (res) => {
    if (res.status() >= 400) errors.push(`http ${res.status()}: ${res.url()}`);
  });
  return { errors };
}

/** POST a whole config the way the studio does (the write header `configWriteRefusal` asks for). */
export async function saveConfig(base: string, config: unknown): Promise<Response> {
  return fetch(`${base}/api/config`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-dashboard-config": "1" },
    body: JSON.stringify(config),
  });
}

/**
 * Waits until the page has stopped moving: the fonts are loaded and the rects of `selector` and of the island, and the count of rings, numbers, bars and meters, have not changed for 8
 * frames in a row. A pack spec reads geometry, text and layers after it, in place of a fixed wait that a slow run could beat (L77).
 */
export async function settled(page: Page, selector: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    (sel) => {
      const w = window as unknown as { __still?: number; __snap?: string };
      const rects = [...document.querySelectorAll(`${sel}, [data-island]`)].map((e) => {
        const r = e.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height].map(Math.round).join(",");
      });
      // a lazy widget that swaps its skeleton for its rings, numbers and bars without moving its card changes these counts (L87)
      const marks = document.querySelectorAll('[data-part="ring"], [data-part="num"], [data-part="bar"], [data-part="meter"]').length;
      const snap = `${rects.join("|")}#${document.fonts.size}#${marks}`;
      w.__still = [...document.fonts].every((f) => f.status !== "loading") && snap === w.__snap ? (w.__still ?? 0) + 1 : 0;
      w.__snap = snap;
      return w.__still >= 8;
    },
    selector,
    { polling: "raf", timeout: 15_000 }
  );
}

export const FIELD_KIT = path.join("src", "looks", "packs", "field-kit");

/** Field Kit's files as a pack of this user under `dest/<id>`: its own id and font families, no pack.css, every asset listed. */
export function makePack(dest: string, id: string, edit: (dir: string) => void = () => {}): string {
  const dir = path.join(dest, id);
  fs.cpSync(FIELD_KIT, dir, { recursive: true, filter: (src) => !/\.tsx?$|pack\.css$/.test(src) });
  edit(dir);
  const read = (name: string) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
  const pack = read("pack.json");
  const look = read("look.json");
  pack.id = look.id = id;
  pack.name = look.name = "Mine";
  pack.fonts = pack.fonts.map((f: { family: string }) => ({ ...f, family: f.family.replace("pack-", `pack-${id}-`) }));
  for (const k of Object.keys(look.fonts)) look.fonts[k] = look.fonts[k].replace("pack-", `pack-${id}-`);
  pack.assets = fs.readdirSync(path.join(dir, "assets")).map((file) => ({ file, bytes: fs.statSync(path.join(dir, "assets", file)).size }));
  fs.writeFileSync(path.join(dir, "pack.json"), JSON.stringify(pack));
  fs.writeFileSync(path.join(dir, "look.json"), JSON.stringify(look));
  return dir;
}

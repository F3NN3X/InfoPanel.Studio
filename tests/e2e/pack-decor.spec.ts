import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startScratch, type Scratch } from "../../tools/perf/scratch.mjs";
import { PACK_STYLES } from "../../tools/qa/pack-styles.mjs";
import { measurePack, renderRefusals } from "../../src/looks/pack-render-measures";
import { expect, makePack, manifest, saveConfig, settled, test } from "./fixtures";

// Phase 3 (L108): a pack's `frame` and `ornaments` are drawn by the app in the card chrome (`data-pack-decor`), and the Gate 3 shots of
// a CyberSpec-style user pack. The render measures treat the app's frame and ornaments as chrome, not as the widget's text or the pack's paint.

const { light } = manifest.profiles;
const FIXTURE = path.join("tests", "fixtures", "packs", "cyberspec");
const OUT = path.join(".cache", "gate-3");
const SIZES = [{ width: 1024, height: 600 }, { width: 1920, height: 550 }];
const LEVELS = ["full", "calm", "off"] as const;

/** The fixture's pack.json and look.json as this run imports them. */
function cyberspec(dir: string): void {
  const read = (name: string) => JSON.parse(fs.readFileSync(path.join(FIXTURE, name), "utf8"));
  const pack = read("pack.json");
  fs.writeFileSync(path.join(dir, "pack.json"), JSON.stringify(pack));
  fs.writeFileSync(path.join(dir, "look.json"), JSON.stringify(read("look.json")));
}

const bytesOf = (dir: string): { files: number; bytes: number } => {
  const walk = (d: string): number[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [fs.statSync(path.join(d, e.name)).size]));
  const sizes = walk(dir);
  return { files: sizes.length, bytes: sizes.reduce((a, b) => a + b, 0) };
};

test.describe("a CyberSpec-style user pack", () => {
  test.setTimeout(240_000);
  let tmp: string;
  test.beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ips-cyberspec-"));
  });
  test.afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  test("is imported, signed and render-checked, then worn at two screen sizes and three FX levels", async ({ page, scratch }) => {
    await page.goto(`${scratch.base}/?studio=1&profile=${light}`);
    await page.getByRole("button", { name: "Theme", exact: true }).click();
    await page.getByRole("tab", { name: /Browse themes/ }).click();
    const section = page.getByRole("region", { name: "Import a pack" });
    await expect(section).toBeAttached();
    await section.locator("[data-pack-folder]").setInputFiles(makePack(tmp, "cyberspec", cyberspec));
    // validation, the render check and the store, in the order the import runs them: a refusal at any of them says so in the report
    const report = section.locator("[data-pack-report]");
    await expect(report).toContainText("Imported", { timeout: 120_000 });
    await expect(report).not.toContainText("can't be imported");
    await expect(report).not.toContainText("The render check refused");
    await expect(page.locator("iframe")).toHaveCount(0);
    const root = path.join(scratch.dataDir, "packs", "cyberspec");
    // no pack.css, so the server signs nothing (`pack.sig` covers a stylesheet); the stored files are what was checked
    expect(fs.existsSync(path.join(root, "pack.sig"))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(root, "pack.json"), "utf8")).id).toBe("cyberspec");
    expect((await (await fetch(`${scratch.base}/api/packs`)).json()).map((p: { id: string }) => p.id)).toEqual(["cyberspec"]);

    await page.locator('[data-look-card="cyberspec"]').click();
    await page.getByRole("complementary", { name: "Theme detail" }).getByRole("button", { name: /^Apply to/ }).click();
    await expect.poll(async () => (await (await fetch(`${scratch.base}/api/config`)).json()).profiles.find((p: { id: string }) => p.id === light)?.widgetTheme?.values?.lookId).toBe("cyberspec");

    fs.mkdirSync(OUT, { recursive: true });
    const pages: unknown[] = [];
    for (const size of SIZES) {
      for (const fx of LEVELS) {
        // the screen's FX level (`performance.fx`), set where the app keeps a screen's performance
        const config = await (await fetch(`${scratch.base}/api/config`)).json();
        config.profiles = config.profiles.map((p: { id: string; performance?: object }) => (p.id === light ? { ...p, performance: { ...p.performance, fx } } : p));
        expect((await saveConfig(scratch.base, config)).ok).toBe(true);
        const kiosk = await page.context().newPage();
        await kiosk.setViewportSize(size);
        await kiosk.goto(`${scratch.base}/?kiosk=1&profile=${light}`);
        await expect(kiosk.locator('[data-wp-tier][data-look="cyberspec"]').first()).toBeAttached({ timeout: 15_000 });
        await settled(kiosk, manifest.kioskZoneSelector);
        const read = await kiosk.evaluate(() => {
          const named = (sel: string, attr: string) => [...document.querySelectorAll(sel)].map((el) => el.getAttribute(attr));
          const cards = [...document.querySelectorAll('[data-wp-tier][data-look="cyberspec"]')];
          const decor = cards.flatMap((card) => [...card.querySelectorAll("[data-pack-decor]")]);
          // an ornament's text boxes against the widget's own text boxes on the same card
          const box = (t: Node) => {
            const r = document.createRange();
            r.selectNodeContents(t);
            return r.getBoundingClientRect();
          };
          const texts = (root: Element, inDecor: boolean) => {
            const out: DOMRect[] = [];
            const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
            for (let t = w.nextNode(); t; t = w.nextNode()) if (t.textContent?.trim() && !!t.parentElement?.closest("[data-pack-decor]") === inDecor) out.push(box(t));
            return out;
          };
          const overlaps = cards.flatMap((card) => texts(card, true).flatMap((a) => texts(card, false).filter((b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top)));
          return {
            cards: cards.length,
            layers: named("[data-pack-layer]", "data-pack-layer"),
            effects: named("[data-pack-effect]", "data-pack-effect"),
            frames: decor.filter((d) => d.getAttribute("data-pack-decor") === "frame").length,
            ornaments: cards.flatMap((c) => [...c.querySelectorAll("[data-ornament]")]).map((o) => ({ kind: o.getAttribute("data-ornament"), text: o.textContent, h: o.getBoundingClientRect().height, pos: getComputedStyle(o).position })),
            pointer: decor.every((d) => getComputedStyle(d).pointerEvents === "none"),
            clip: cards.map((c) => getComputedStyle(c).clipPath),
            overlaps: overlaps.length,
          };
        });
        const name = `cyberspec-${size.width}x${size.height}-${fx}`;
        await kiosk.screenshot({ path: path.join(OUT, `${name}.png`) });
        pages.push({ ...size, fx, ...read, ...bytesOf(root) });
        expect(read.cards).toBeGreaterThan(0);
        {
          // cut corners clip every card; the frame and the ornaments are click-through, in a band of at most 10 px, over no widget text
          expect(read.frames).toBe(read.cards);
          expect(read.clip.every((c) => c.includes("calc(100% - 12px)"))).toBe(true);
          expect(read.pointer).toBe(true);
          expect(read.overlaps).toBe(0);
          expect(read.ornaments.every((o) => o.pos === "absolute" && o.h <= 10)).toBe(true);
          // the label shows everywhere, the micro-print only from the md class up (1024x600 is md, 1920x550 is sm)
          expect(read.ornaments.some((o) => o.kind === "label" && o.text === "SPEC")).toBe(true);
          expect(read.ornaments.some((o) => o.kind === "micro-print" && o.text === "SYS.07 // NODE-A")).toBe(size.width === 1024);
        }
        {
          // the FX levels: `full` draws all three effects, `calm` the still scanlines and the vignette, `off` none
          const expected = { full: ["scanlines", "glitch", "vignette"], calm: ["scanlines", "vignette"], off: [] }[fx];
          expect([...read.effects].sort()).toEqual([...expected].sort());
          expect(read.layers.length).toBeGreaterThan(0);
        }
        await kiosk.close();
      }
    }
    fs.writeFileSync(path.join(OUT, "cyberspec.json"), JSON.stringify({ pack: "cyberspec", pages }, null, 2));
  });
});

// The render measures read the app's frame and ornaments as chrome: their text is not the card's text (no contrast verdict, no cover test),
// and one that took a click would be a problem of the page.
test.describe("the render measures and the app's pack decoration", () => {
  test.setTimeout(150_000);
  let qa: Scratch;
  test.beforeAll(async () => {
    qa = await startScratch({ env: { DASHBOARD_DEBUG: "1" } });
  });
  test.afterAll(() => qa.stop());

  const measures = { look: "term", alphaMax: 0.4, minOpacity: 0.5 };
  async function open(page: import("@playwright/test").Page) {
    const settings = encodeURIComponent(JSON.stringify(PACK_STYLES.term));
    await page.goto(`${qa.base}/?widget-qa&eager=1&spans=1x1,2x2,4x4&settings=${settings}`);
    await page.waitForFunction(() => window.__qaMountAll);
    await page.evaluate(() => window.__qaMountAll?.());
    await expect(page.locator('[data-wp-tier][data-look="term"]').first()).toBeAttached({ timeout: 10_000 });
  }
  const decorate = (page: import("@playwright/test").Page, pointer: "none" | "auto") =>
    page.evaluate((events) => {
      for (const card of document.querySelectorAll('[data-wp-tier][data-look="term"]')) {
        const layer = document.createElement("div");
        layer.setAttribute("data-pack-decor", "ornaments");
        layer.style.cssText = `position:absolute;inset:0;pointer-events:${events};background:#ffffff`;
        // white text over white on the card's face, and a box over the card's own text: either would be refused if it were the card's
        layer.innerHTML = '<span style="position:absolute;left:2px;top:2px;color:#ffffff;font-size:8px">SYS.07</span>';
        card.append(layer);
      }
    }, pointer);

  test("an app-drawn layer and its text are not the card's text or a cover over it", async ({ page }) => {
    await open(page);
    const plain = await page.evaluate(measurePack, measures);
    await decorate(page, "none");
    const decorated = await page.evaluate(measurePack, measures);
    // the same texts, none of them the decor's (live widgets, a clock, change their words between the two reads, not their number)
    expect(decorated.worn.texts.map((t) => t.text)).not.toContain("SYS.07");
    expect(decorated.worn.texts.length).toBe(plain.worn.texts.length);
    expect(renderRefusals(decorated)).toEqual([]);
    // the decor adds no problem (the clock's colon blinks, so it is dimmed in one read and not the other)
    const blink = (p: string) => /^text ":" is at opacity .*\[Clock@/.test(p);
    expect(decorated.worn.problems.filter((p) => !blink(p) && !plain.worn.problems.includes(p))).toEqual([]);
  });

  test("a decoration that takes pointer events is named", async ({ page }) => {
    await open(page);
    await decorate(page, "auto");
    const twin = await page.evaluate(measurePack, measures);
    expect(twin.worn.problems.some((p) => p.includes("decoration takes pointer events"))).toBe(true);
  });
});

import { startScratch, type Scratch } from "../../tools/perf/scratch.mjs";
import { PACK_STYLES } from "../../tools/qa/pack-styles.mjs";
import { measurePack, readMaskImages, renderRefusals } from "../../src/looks/pack-render-measures";
import { expect, test } from "./fixtures";

// The shape measures of the render check: what a pack's clip-path, mask-image and ::before/::after do to the text and the card, read from
// what the browser drew. The sheet goes straight into the page as a `<style data-pack>` (the attribute the bare twin switches off), so
// these specs hold the measures whatever the linters admit. Each case is judged against the same page without the sheet, as at import.

const measures = { look: "term", alphaMax: 0.4, minOpacity: 0.5 };
const CARD = '[data-wp-tier][data-look="term"]';
// the cards the shell pads (`--wp-pad` over 0): on one that bleeds its content to the edge, any clipped corner or faded edge touches the content, and is refused
const PADDED = '[data-wp-tier][data-look="term"][style*="--wp-pad"]:not([style*="--wp-pad: 0px"])';

test.describe.configure({ mode: "parallel" });

let qa: Scratch;
test.beforeAll(async () => {
  qa = await startScratch({ env: { DASHBOARD_DEBUG: "1" } });
});
test.afterAll(() => qa.stop());

/** The refusals of the Term page with `css` laid over its own pack, one stylesheet after another on the same page; `base` is page CSS that is not the pack's, on in both twins. */
async function judge(page: import("@playwright/test").Page, sheets: Record<string, string>, base = "") {
  const settings = encodeURIComponent(JSON.stringify(PACK_STYLES.term));
  await page.goto(`${qa.base}/?widget-qa&eager=1&spans=1x1,2x2,4x4&settings=${settings}`);
  await page.waitForFunction(() => window.__qaMountAll);
  await page.evaluate(() => window.__qaMountAll?.());
  await expect(page.locator(`${CARD}`).first()).toBeAttached({ timeout: 10_000 });
  if (base) await page.addStyleTag({ content: base });
  const out: Record<string, string[]> = {};
  for (const [name, css] of Object.entries(sheets)) {
    await page.evaluate((text) => {
      const sheet = document.createElement("style");
      sheet.setAttribute("data-pack", "shape-test");
      sheet.textContent = text;
      document.head.append(sheet);
    }, css);
    // the url() masks are decoded first, as the studio's render check does
    const maskImages = await page.evaluate(readMaskImages, { look: measures.look });
    out[name] = renderRefusals(await page.evaluate(measurePack, { ...measures, maskImages }));
    await page.evaluate(() => document.querySelector('style[data-pack="shape-test"]')?.remove());
  }
  return out;
}

test("clip-path: cut corners pass; a clip that cuts a value or most of a card is refused", async ({ page }) => {
  test.setTimeout(150_000);
  const r = await judge(page, {
    corners: `${PADDED} { clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px)); }`,
    rounded: `${PADDED} { clip-path: inset(0 round 10px); }`,
    value: `${CARD} [data-part="num"] { clip-path: inset(0 60% 0 0); }`,
    half: `${CARD} { clip-path: inset(30% 0 0 0); }`,
    corner: `${CARD} { clip-path: polygon(0 0, 100% 0, 100% 100%, 40% 100%, 0 60%); }`,
    url: `${CARD} [data-part="num"] { clip-path: url(#nowhere); }`,
  });
  expect(r.corners).toEqual([]);
  expect(r.rounded).toEqual([]);
  expect(r.value.some((x) => x.includes("cut by a clip-path"))).toBe(true);
  expect(r.half.some((x) => x.includes("of a card, over 10%"))).toBe(true);
  expect(r.corner.some((x) => x.includes("corners of a card's content") || x.includes("of a card, over 10%"))).toBe(true);
  expect(r.url.length).toBeGreaterThan(0);
});

test("mask-image: a gradient that fades the card edge passes; one that fades text, or a url() mask that will not load, is refused", async ({ page }) => {
  test.setTimeout(150_000);
  const r = await judge(page, {
    edge: `${CARD} { mask-image: radial-gradient(ellipse at 50% 50%, #000 60%, rgba(0,0,0,0.6)); }`,
    radial: `${CARD} { mask-image: radial-gradient(circle at 50% 50%, #000 70%, rgba(0,0,0,0.3)); }`,
    faded: `${CARD} [data-part="num"] { mask-image: linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.2)); }`,
    ends: `${CARD} { mask-image: linear-gradient(to right, transparent 0%, transparent 100%); }`,
    url: `${CARD} { mask-image: url("mask.png"); }`,
  });
  expect(r.edge).toEqual([]);
  expect(r.faded.some((x) => x.includes("is at 0.20"))).toBe(true);
  expect(r.ends.some((x) => x.includes("is at 0.00"))).toBe(true);
  expect(r.url.some((x) => x.includes("one that cannot be read"))).toBe(true);
  // a radial mask that leaves 0.3 at the far corners only touches text where it is dark enough, so it is read, not refused for being a radial
  expect(r.radial.every((x) => !x.includes("cannot be read"))).toBe(true);
});

test("pseudo-elements: a scanline at 0.2 passes; an opaque cover over the text or a box outside the card is refused", async ({ page }) => {
  test.setTimeout(150_000);
  const base = `${CARD} { position: relative; } ${CARD}::after { content: ""; position: absolute; pointer-events: none; z-index: 0;`;
  const r = await judge(page, {
    scanline: `${base} inset: 0; background: repeating-linear-gradient(rgba(0,0,0,0.2) 0 1px, transparent 1px 3px); }`,
    cover: `${base} inset: 0; background: rgba(0,0,0,0.9); }`,
    solid: `${base} inset: 0; background: linear-gradient(rgba(0,0,0,0.1), #000); }`,
    poke: `${CARD} { position: relative; } ${CARD}::before { content: ""; position: absolute; left: -12px; top: 0; width: 20px; height: 20px; background: rgba(255,0,0,0.1); }`,
    moved: `${base} inset: 0; background: rgba(0,0,0,0.1); transform: translateX(30px); }`,
    scaled: `${base} inset: 0; background: rgba(0,0,0,0.1); transform: scale(1.1); }`,
    inside: `${CARD} { position: relative; } ${CARD}::before { content: ""; position: absolute; left: 2px; top: 2px; width: 6px; height: 6px; border: 1px solid #f00; transform: rotate(45deg) scale(0.5); }`,
    word: `${base} inset: 0; content: "ghost"; color: #fff; }`,
  });
  expect(r.scanline).toEqual([]);
  expect(r.cover.some((x) => x.includes("paints at 0.90 over text"))).toBe(true);
  expect(r.solid.some((x) => x.includes("paints at 1.00 over text"))).toBe(true);
  expect(r.poke.some((x) => x.includes("reaches outside its element"))).toBe(true);
  expect(r.moved.some((x) => x.includes("reaches outside its element"))).toBe(true);
  expect(r.scaled.some((x) => x.includes("reaches outside its element"))).toBe(true);
  expect(r.inside).toEqual([]);
  expect(r.word.some((x) => x.includes("paints at 1.00 over text"))).toBe(true);
});

// mask images served from the page's origin, as a stored pack's files are (`/api/packs/<id>/<path>`): `readMaskImages` fetches and decodes them
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10">${body}</svg>`;
const MASKS: Record<string, string> = {
  "opaque.svg": svg('<rect width="10" height="10" fill="#000"/>'),
  "faint.svg": svg('<rect width="10" height="10" fill="#000" fill-opacity="0.2"/>'),
  "broken.svg": "<svg not an image",
};

test("url() masks on real elements: an opaque image passes; a faint one, a tile that leaves the text bare, or one that will not load is refused", async ({ page }) => {
  test.setTimeout(150_000);
  await page.route("**/mask-test/*", (route) => {
    const body = MASKS[new URL(route.request().url()).pathname.split("/").pop() as string];
    return body === undefined ? route.fulfill({ status: 404, body: "" }) : route.fulfill({ contentType: "image/svg+xml", body });
  });
  const veil = `${CARD} { position: relative; } ${CARD}::after { content: ""; position: absolute; pointer-events: none; z-index: 0; inset: 0; background: rgba(0,0,0,0.2);`;
  const r = await judge(page, {
    opaque: `${CARD} { mask-image: url("/mask-test/opaque.svg"); }`,
    cover: `${CARD} { mask-image: url("/mask-test/opaque.svg"); mask-size: cover; mask-repeat: no-repeat; }`,
    faint: `${CARD} [data-part="num"] { mask-image: url("/mask-test/faint.svg"); }`,
    half: `${CARD} [data-part="num"] { mask-image: url("/mask-test/opaque.svg"); mask-size: 50% 100%; mask-repeat: no-repeat; }`,
    missing: `${CARD} { mask-image: url("/mask-test/missing.svg"); }`,
    broken: `${CARD} { mask-image: url("/mask-test/broken.svg"); }`,
    pseudo: `${veil} mask-image: url("/mask-test/faint.svg"); }`,
  });
  expect(r.opaque).toEqual([]);
  expect(r.cover).toEqual([]);
  expect(r.faint.some((x) => x.includes("is at 0.20"))).toBe(true);
  expect(r.half.some((x) => x.includes("is at 0.00"))).toBe(true);
  expect(r.missing.some((x) => x.includes("one that cannot be read"))).toBe(true);
  expect(r.broken.some((x) => x.includes("one that cannot be read"))).toBe(true);
  // a pseudo-element's paint is judged without its mask, so a mask there only ever shows less of it
  expect(r.pseudo).toEqual([]);
});

test("border on real elements: a style that gives a bare border a width is refused; one that keeps every width passes", async ({ page }) => {
  test.setTimeout(150_000);
  // the page's own sheet (not the pack's, so on in both twins): the value slots draw a 2 px border with or without the pack
  const r = await judge(page, {
    solid: `${CARD} { border: solid #f00; }`,
    colour: `${CARD} { border-color: #f00; }`,
    restyled: `${CARD} [data-part="num"] { border-style: dashed; border-color: #0f0; }`,
    widened: `${CARD} [data-part="num"] { border-width: 4px; }`,
    styleOnly: `${CARD} [data-part="label"] { border-style: dotted; }`,
  }, `${CARD} [data-part="num"] { border: 2px solid #333; }`);
  expect(r.solid.some((x) => x.includes("not as wide as without the pack") && x.includes("3px"))).toBe(true);
  expect(r.colour).toEqual([]);
  expect(r.restyled).toEqual([]);
  expect(r.widened.some((x) => x.includes("not as wide as without the pack"))).toBe(true);
  // the app's base sheet gives every element `border: 0 solid`, so a style alone keeps the width at 0
  expect(r.styleOnly).toEqual([]);
});

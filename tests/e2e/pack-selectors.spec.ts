import fs from "node:fs";
import path from "node:path";
import { startScratch, type Scratch } from "../../tools/perf/scratch.mjs";
import { PACK_STYLES } from "../../tools/qa/pack-styles.mjs";
import { parseCss, writeTokens, type Rule } from "../../src/looks/css-syntax";
import { measurePack, renderRefusals, unlit } from "../../src/looks/pack-render-measures";
import { expect, test } from "./fixtures";

// A pack.css rule that matches nothing paints nothing (the P10 review's M4: the dark header and chip bars were written and never drawn).
// Every selector of every pack rule must match an element on the Widget QA page wearing the pack, so a dead selector fails here.

const measures = (look: string) => ({ look, alphaMax: 0.4, minOpacity: 0.5 });

let qa: Scratch;
test.beforeAll(async () => {
  qa = await startScratch({ env: { DASHBOARD_DEBUG: "1" } });
});
test.afterAll(() => qa.stop());

/** The style rules' selectors (a comma list is split), without the states and pseudo-elements a page at rest does not show. */
function selectorsOf(css: string): string[] {
  const out: string[] = [];
  const walk = (rules: Rule[]) => {
    for (const r of rules) {
      if (!r.at) out.push(...writeTokens(r.prelude).split(",").map((s) => s.trim()));
      else if (r.at !== "keyframes" && r.at !== "font-face" && r.rules) walk(r.rules);
    }
  };
  walk(parseCss(css, []));
  return out.map((s) => s.replace(/::?(hover|focus|focus-visible|active|before|after|placeholder|first-line)\b/g, "")).filter(Boolean);
}

for (const id of Object.keys(PACK_STYLES)) {
  test(`every selector of the ${id} pack's css matches an element wearing the pack`, async ({ page }) => {
    const css = fs.readFileSync(path.join("src/looks/packs", id, "pack.css"), "utf8");
    const selectors = selectorsOf(css);
    expect(selectors.length).toBeGreaterThan(0);
    await page.goto(`${qa.base}/?widget-qa&eager=1&spans=2x2,4x4&settings=${encodeURIComponent(JSON.stringify(PACK_STYLES[id as keyof typeof PACK_STYLES]))}`);
    await page.waitForFunction(() => window.__qaMountAll);
    await page.evaluate(() => window.__qaMountAll?.());
    await expect(page.locator(`[data-wp-tier][data-look="${id}"]`).first()).toBeAttached({ timeout: 10_000 });
    const dead = await page.evaluate(
      ({ look, list }) => {
        const root = `[data-look="${look}"]`;
        return list.filter((sel) => (sel === ":scope" ? !document.querySelector(root) : !document.querySelector(`${root} ${sel.replace(/^:scope\s*/, "")}`)));
      },
      { look: id, list: selectors },
    );
    expect(dead).toEqual([]);
  });
}

// The header and chip bars the packs paint (M4): what sits on a bar reads on it, 4.5:1 for text and 3:1 for icons.
for (const id of Object.keys(PACK_STYLES)) {
  test(`what sits on the ${id} pack's header and chip bars reads on them`, async ({ page }) => {
    await page.goto(`${qa.base}/?widget-qa&eager=1&spans=2x2,4x4&settings=${encodeURIComponent(JSON.stringify(PACK_STYLES[id as keyof typeof PACK_STYLES]))}`);
    await page.waitForFunction(() => window.__qaMountAll);
    await page.evaluate(() => window.__qaMountAll?.());
    await expect(page.locator(`[data-wp-tier][data-look="${id}"]`).first()).toBeAttached({ timeout: 10_000 });
    const { worn: report } = await page.evaluate(measurePack, measures(id));
    expect(report.bars).toBeGreaterThan(0);
    expect(report.barIssues).toEqual([]);
  });
}

// L79: every gauge that is lit without the pack's CSS is lit with it. The kiosk spec asks only that some ring, bar and meter on the screen has
// a value mark, which a pack that hides half of them would pass: here each gauge is compared with its own twin on the same page, the pack's
// `<style data-pack>` switched off (so the meter style and the cell rounding are the same on both sides).
const quiet = (style: object, extra = "") => `?widget-qa&eager=1&spans=1x1,2x2,4x4${extra}&settings=${encodeURIComponent(JSON.stringify(style))}`;

async function wornPage(page: import("@playwright/test").Page, style: object, id: string, extra = "") {
  await page.goto(`${qa.base}/${quiet(style, extra)}`);
  await page.waitForFunction(() => window.__qaMountAll);
  await page.evaluate(() => window.__qaMountAll?.());
  await expect(page.locator(`[data-wp-tier][data-look="${id}"]`).first()).toBeAttached({ timeout: 10_000 });
  await expect(page.locator(`style[data-pack="${id}"]`)).toHaveCount(1);
}

for (const id of Object.keys(PACK_STYLES)) {
  test(`every gauge lit without the ${id} pack's css is lit with it`, async ({ page }) => {
    await wornPage(page, PACK_STYLES[id as keyof typeof PACK_STYLES], id);
    const twin = await page.evaluate(measurePack, measures(id));
    expect(twin.bare.gauges.filter((g) => g.lit).length).toBeGreaterThan(10);
    expect(twin.worn.gauges.map((g) => g.key)).toEqual(twin.bare.gauges.map((g) => g.key));
    expect(unlit(twin.bare.gauges, twin.worn.gauges)).toEqual([]);
    // the verdict a user pack's CSS gets at import (L94) holds for every built-in's
    expect(renderRefusals(twin)).toEqual([]);
  });
}

test("the gauge-ink check catches a pack that hides some of its gauges and not all", async ({ page }) => {
  await wornPage(page, PACK_STYLES.term, "term");
  const { worn: ref } = await page.evaluate(measurePack, measures("term"));
  // what a bad pack could do: no ink on every other bar, meter and ring
  await page.addStyleTag({ content: '[data-part="bar"]:nth-of-type(odd) *, [data-part="meter"]:nth-of-type(odd) *, [data-part="ring"]:nth-of-type(odd) circle { background: none !important; stroke: none !important; }' });
  const { worn: now } = await page.evaluate(measurePack, measures("term"));
  expect(now.gauges.some((g) => g.lit)).toBe(true);
  expect(unlit(ref.gauges, now.gauges).length).toBeGreaterThan(0);
});

// A box over a neighbour's text hides it whatever the colours say: the check reads what the eye meets at each text (elementsFromPoint).
test("the render measures catch an opaque box laid over other text", async ({ page }) => {
  test.setTimeout(90_000); // three whole-page measures; a Windows runner took over 30 s
  await wornPage(page, PACK_STYLES.term, "term");
  const { worn: clean } = await page.evaluate(measurePack, measures("term"));
  // (the Term card's own header already overlaps the body at the smallest tier: that is the page, and a pack is judged against its twin)
  const byLabel = (problems: string[]) => problems.filter((p) => p.includes("is covered by") && p.includes("(label) ["));
  expect(byLabel(clean.problems)).toEqual([]);
  await page.addStyleTag({ content: '[data-part="label"] { position: absolute !important; inset: 0 !important; background: #123456 !important; opacity: 1 !important; }' });
  const { worn } = await page.evaluate(measurePack, measures("term"));
  expect(byLabel(worn.problems).length).toBeGreaterThan(0);
  // each carries its widget, span and text, so the same words covered elsewhere in the twin do not cancel it
  const keyed = /\[(\w+@\d+x\d+|card \d+) #\d+\]$/;
  expect(byLabel(worn.problems).every((p) => keyed.test(p))).toBe(true);
  expect(new Set(byLabel(worn.problems).map((p) => p.match(/@(\d+x\d+) #/)?.[1])).size).toBeGreaterThan(1);
  // a faded text is keyed the same way
  await page.addStyleTag({ content: '[data-part="label"] { opacity: 0.2 !important; }' });
  const { worn: faded } = await page.evaluate(measurePack, measures("term"));
  const fadedText = faded.problems.filter((p) => p.includes("is at opacity"));
  expect(fadedText.length).toBeGreaterThan(0);
  expect(fadedText.every((p) => keyed.test(p))).toBe(true);
});

// A text pushed where the page cannot scroll to (left of the page) is outside the viewport whatever scrolls: it is a problem, not a pass.
test("the render measures do not pass a text that sits outside the viewport", async ({ page }) => {
  await wornPage(page, PACK_STYLES.term, "term");
  const { worn: clean } = await page.evaluate(measurePack, measures("term"));
  const outside = (problems: string[]) => problems.filter((p) => p.includes("could not be checked"));
  expect(outside(clean.problems)).toEqual([]);
  await page.addStyleTag({ content: '[data-part="label"] { transform: translateX(-5000px) !important; }' });
  const twin = await page.evaluate(measurePack, measures("term"));
  expect(outside(twin.worn.problems).length).toBeGreaterThan(0);
  expect(renderRefusals({ worn: twin.worn, bare: clean }).some((r) => r.includes("could not be checked"))).toBe(true);
});

// L79: the box-legend title sits on the frame's line (6 px in) whatever the card's zoom: the shell zooms the padded content of a card
// that is larger than the design size, and the legend is lifted inside that zoom.
test("the term pack's box legend sits on the frame line on a zoomed card", async ({ page }) => {
  // Size % 150 zooms the padded content of every card (and the auto zoom of a larger box does the same)
  await wornPage(page, { ...PACK_STYLES.term, scale: 150 }, "term");
  await expect(page.locator('[data-wp-tier][data-look="term"] [data-part="legend"]').first()).toBeAttached({ timeout: 10_000 });
  const report = await page.evaluate(() => {
    const rows: { zoom: number; off: number }[] = [];
    for (const card of document.querySelectorAll('[data-wp-tier][data-look="term"]')) {
      const legend = card.querySelector('[data-part="legend"]');
      const frame = [...card.children].find((c) => c.className.includes("absolute") && getComputedStyle(c).borderTopWidth !== "0px");
      const padded = legend?.closest("header")?.parentElement;
      if (!legend || !frame || !padded) continue;
      const l = legend.getBoundingClientRect();
      const f = frame.getBoundingClientRect();
      // the frame's line is its top border, centred on its top edge plus half the border
      rows.push({ zoom: Number(getComputedStyle(padded).zoom), off: Math.abs(l.top + l.height / 2 - (f.top + parseFloat(getComputedStyle(frame).borderTopWidth) / 2)) });
    }
    return rows;
  });
  expect(report.length).toBeGreaterThan(5);
  expect(report.some((r) => r.zoom !== 1)).toBe(true);
  expect(report.filter((r) => r.off > 1.5)).toEqual([]);
});

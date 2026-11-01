import { startScratch, type Scratch } from "../../tools/perf/scratch.mjs";
import { expect, test } from "./fixtures";

// The streaming widgets stay inside their zone at the spans a screen gives them, with the demo OBS, chat and mixer
// data of `?widget-qa&data=fixtures` (src/widgets/widget-qa/demo-streams.ts), at two cell sizes and two skins:
// nothing pokes out of the zone, overlaps or is cut off by overflow (the probe's three kinds, `window.__qaOverflow`).
// A span below a widget's minimum is no frame (StreamChat's 2x1 and 3x1), hence 16 frames of 18. The Elgato Stream Deck widget (minimum 1x1) is held to all 6 of its spans.

// The QA page is served in debug mode only, so these run on their own scratch server with DASHBOARD_DEBUG=1.
let qa: Scratch;
test.beforeAll(async () => {
  qa = await startScratch({ env: { DASHBOARD_DEBUG: "1" } });
});
test.afterAll(() => qa.stop());

const BIG = { modules: "StreamControl,StreamChat,StreamMixer", spans: "2x1,3x1,2x2,3x2,4x2,4x4", frames: 16 };
const DECK = { modules: "StreamDeck", spans: "1x1,2x1,2x2,3x2,4x2,4x4", frames: 6 };
const SMALL = { modules: "ObsButton,AudioButton,AudioFader", spans: "1x1,1x2,2x1", frames: 9 };

for (const [name, { modules, spans, frames }] of Object.entries({ big: BIG, small: SMALL, deck: DECK })) {
  for (const cell of [110, 150]) {
    for (const skin of ["default", "instrument"]) {
      test(`${name} streaming widgets fit at cell ${cell}, ${skin} skin`, async ({ page }) => {
        // The deck widget draws the demo device only once it is picked.
        const pick = modules === "StreamDeck" ? `&settings=${encodeURIComponent('{"device":"demo"}')}` : "";
        await page.goto(`${qa.base}/?widget-qa&data=fixtures&module=${modules}&spans=${spans}&cell=${cell}&skin=${skin}${pick}`);
        await page.waitForSelector("figure[data-qa-module] [data-qa-box] *");
        await page.evaluate(() => window.__qaMountAll?.());
        const report = await page.evaluate(() => window.__qaOverflow?.() ?? []);
        expect(report.length).toBe(frames);
        // The probe's "overlaps" compares leaf text boxes: in the chat it reads a wrapped line's name and text (inline boxes
        // spanning the lines) and messages scrolled under the header as overlapping, so the chat is held to the other two.
        const found = report.map((r) => ({ ...r, issues: r.issues.filter((i) => i.kind !== "overlaps" || r.module !== "StreamChat") })).filter((r) => r.issues.length);
        expect(found).toEqual([]);
      });
    }
  }
}

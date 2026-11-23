import fs from "node:fs";
import path from "node:path";
import { PACK_STYLES } from "../../tools/qa/pack-styles.mjs";
import { expect, manifest, settled, test } from "./fixtures";

// A worn pack draws its own faces on the numerals and the labels (ledger L80): an inline font-family from the look's Font
// would beat the pack's `[data-part="num"]` rule, and the earlier checks (a selector matches, a face ships) could not tell.
// The first family of the computed font-family of a numeral and of a label, and that the browser has the face loaded.
const FACES: Record<keyof typeof PACK_STYLES, { num: string; label: string }> = {
  "field-kit": { num: "pack-field-kit", label: "pack-field-kit" },
  "tape-86": { num: "pack-tape-86-display", label: "pack-tape-86-mono" },
  term: { num: "pack-term-display", label: "pack-term-mono" },
  "neon-stripe": { num: "pack-neon-display", label: "pack-neon-mono" },
  overdrive: { num: "pack-overdrive-mono", label: "pack-overdrive" },
  "swiss-mono": { num: "pack-swiss-display", label: "pack-swiss" },
  holo: { num: "pack-holo", label: "pack-holo" },
  "night-glow": { num: "pack-night-glow", label: "pack-night-glow" },
  paper: { num: "pack-paper", label: "pack-paper" },
  "classy-black": { num: "pack-classy-num", label: "pack-classy" },
  "liquid-glass": { num: "pack-liquid", label: "pack-liquid" },
  "black-and-gold": { num: "pack-gold", label: "pack-gold" },
  cyberspec: { num: "pack-cyberspec-mono", label: "pack-cyberspec" },
};
const heavy = manifest.profiles.heavy;

for (const id of Object.keys(PACK_STYLES) as (keyof typeof PACK_STYLES)[]) {
  test(`the ${id} pack draws its own face on numerals and labels`, async ({ page, scratch }) => {
    const file = path.join(scratch.dataDir, "config.json");
    const stored = JSON.parse(fs.readFileSync(file, "utf8"));
    // the template Fonts a sample theme or a screen template sets must not reach a worn pack: wear it with a Font chosen
    stored.profiles = stored.profiles.map((p: object) => ({ ...p, widgetTheme: { values: { ...PACK_STYLES[id], font: "mono" } } }));
    fs.writeFileSync(file, JSON.stringify(stored));
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(`${scratch.base}/?kiosk=1&profile=${heavy}`);
    await expect(page.locator(manifest.kioskZoneSelector)).toHaveCount(manifest.zones.heavy.length);
    await expect(page.locator(`[data-wp-tier][data-look="${id}"]`).first()).toBeAttached({ timeout: 10_000 });
    await settled(page, manifest.kioskZoneSelector);

    const seen = await page.evaluate(async () => {
      const first = (el: Element) => getComputedStyle(el).fontFamily.split(",")[0].trim().replace(/["']/g, "");
      const num = document.querySelector('[data-wp-tier] [data-part="num"]');
      const label = [...document.querySelectorAll("[data-wp-tier] *")].find(
        (e) => !e.children.length && /^[A-Za-z][A-Za-z ]{3,}$/.test(e.textContent?.trim() ?? "") && !e.closest('[data-part="num"], [data-part="header"]'),
      );
      const n = num ? first(num) : "";
      const l = label ? first(label) : "";
      await document.fonts.ready;
      return { num: n, label: l, numLoaded: !!n && document.fonts.check(`16px ${n}`), labelLoaded: !!l && document.fonts.check(`16px ${l}`) };
    });
    expect(seen).toEqual({ ...FACES[id], numLoaded: true, labelLoaded: true });
  });
}

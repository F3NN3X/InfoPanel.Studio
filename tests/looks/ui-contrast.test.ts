// The studio chrome's contrast, read from the CSS the app ships: a control boundary that carries meaning keeps 3:1 and the
// three text steps keep 4.5:1 on the surfaces they sit on. The pinned fixture (ui-tokens-p4.json) cannot catch a token that
// moves, because it is regenerated with the tokens.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastOf } from "@/looks/status";

const ui: Record<string, string> = {};
for (const file of ["../../src/index.css", "../../src/settings/tokens.css", "../../src/settings/ui/studio.css"]) {
  for (const m of readFileSync(new URL(file, import.meta.url), "utf8").matchAll(/^\s*--ui-([\w-]+):\s*([^;]+);/gm)) ui[m[1]] = m[2].trim();
}
const SURFACES = ["bg-app", "bg-panel", "bg-tile", "bg-raised"] as const;
// The fills a hovered or selected row, and a select drawn on bg-hover (quick-bar, setting-rows), put under the same text and borders.
const HIGHLIGHTS = ["bg-hover", "bg-active"] as const;
const ratio = (fg: string, bg: string) => contrastOf(ui[fg], ui[bg]) ?? 0;

describe("the chrome tokens' contrast", () => {
  it.each(SURFACES)("the control border is 3:1 on %s", (bg) => {
    expect(ratio("border-control", bg)).toBeGreaterThanOrEqual(3);
  });

  it.each(["text-1", "text-2", "text-hint"])("%s is 4.5:1 on every surface", (fg) => {
    for (const bg of SURFACES) expect(ratio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  it("the control border is 3:1 on the hover and active fills a control is drawn on", () => {
    for (const bg of HIGHLIGHTS) expect(ratio("border-control", bg), `border-control on ${bg}`).toBeGreaterThanOrEqual(3);
  });

  it("every text step is 4.5:1 on the hover and active fills a highlighted row has", () => {
    for (const fg of ["text-1", "text-2", "text-hint"]) for (const bg of HIGHLIGHTS) expect(ratio(fg, bg), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5);
  });

  // The owner's call (design guide: the accent is for selection and focus): a highlighted row is a neutral step, as the
  // sidebar's selected row is, and its text turns text-1, so the fill is not the only cue.
  it("the highlighted menu row is a neutral step that shows on the menu and keeps text-1 at 4.5:1", () => {
    const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(ui["bg-highlight"].slice(i, i + 2), 16));
    expect(Math.max(r, g, b) - Math.min(r, g, b), "no hue").toBeLessThanOrEqual(12);
    expect(ratio("bg-highlight", "bg-raised")).toBeGreaterThanOrEqual(1.4);
    expect(ratio("text-1", "bg-highlight")).toBeGreaterThanOrEqual(4.5);
  });
});

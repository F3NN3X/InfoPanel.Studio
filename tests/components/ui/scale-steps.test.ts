import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Gate 5, Q2: the studio's chrome is on the even type and radius steps. The half steps (text-label 11.5 px, text-small
// 12.5 px) and the odd radii (rounded-3, -5, -7) stay in tokens.css for widgets only, which are what a kiosk shows and
// which the v8 parity fixture pins. A chrome file that takes one again fails here.

const SRC = path.resolve(import.meta.dirname, "../../../src");
/** Widget code: kiosk output, left on its own steps. */
const WIDGET_DIRS = [path.join(SRC, "widgets"), path.join(SRC, "components", "ui", "audiocn")];
const OFF_SCALE = /\btext-(?:label|small)\b|\brounded(?:-(?:t|r|b|l|s|e|tl|tr|bl|br|ss|se|es|ee))?-[357](?![\d.\w])/g;

function sourceFiles(dir: string): string[] {
  if (WIDGET_DIRS.includes(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? sourceFiles(p) : /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe("the chrome's type and radius steps", () => {
  it("finds the half and odd steps and skips their neighbours", () => {
    const found = `"text-label text-small rounded-3 rounded-tl-5 rounded-7 text-caption rounded-4 rounded-14 rounded-3.5 rounded-30"`.match(OFF_SCALE);
    expect(found).toEqual(["text-label", "text-small", "rounded-3", "rounded-tl-5", "rounded-7"]);
  });

  it("are the even ones everywhere outside widgets", () => {
    const hits = sourceFiles(SRC).flatMap((f) => (fs.readFileSync(f, "utf8").match(OFF_SCALE) ?? []).map((m) => `${path.relative(SRC, f)}: ${m}`));
    expect(hits).toEqual([]);
  });
});

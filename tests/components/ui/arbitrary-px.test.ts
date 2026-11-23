import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Arbitrary `[…px]` Tailwind values across src/**/*.tsx, counted as Gate 0 counted them (1,564 then, brief Phase 5:
// at most 313). Step 1 moved every value that has a token onto it; this only goes down. When a change removes some,
// lower CEILING to the new count in the same change.
const CEILING = 140;

const SRC = path.resolve(import.meta.dirname, "../../../src");
const CLASS = /(?<![\w\]])(?:[\w-]+:)*!?-?[a-z][a-z0-9-]*(?:\/[a-z0-9-]+)?-\[([^\]\s]+)\]|(?<![\w\]])(?:[\w-]+:)*\[[a-z-]+:([^\]\s]+)\]/g;
const PX = /-?\d+(\.\d+)?px$/;

function tsxFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? tsxFiles(p) : e.name.endsWith(".tsx") ? [p] : [];
  });
}

function arbitraryPx(text: string): string[] {
  return [...text.matchAll(CLASS)].filter((m) => PX.test(m[1] ?? m[2])).map((m) => m[0]);
}

describe("arbitrary px values", () => {
  it("finds a utility's px value, a property's and a breakpoint's, and skips tokens", () => {
    expect(arbitraryPx(`"h-[30px] [height:12px] max-[1100px]:hidden h-7.5 text-[color:var(--w-fg)] w-[70%]"`)).toEqual(["h-[30px]", "[height:12px]", "max-[1100px]"]);
  });

  it(`stays at or under ${CEILING} across src`, () => {
    const count = tsxFiles(SRC).reduce((n, f) => n + arbitraryPx(fs.readFileSync(f, "utf8")).length, 0);
    expect(count).toBeLessThanOrEqual(CEILING);
  });
});

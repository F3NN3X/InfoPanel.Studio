import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Hand-typed arbitrary colours in class names: `bg-[#hex]`, `[color:#hex]`, `[rgb(...)]`, `[hsl(...)]`, `[oklch(...)]`.
 * The tokens in `src/index.css` and `src/components/ui/tokens.css` replace them. Inline `style` hexes are not counted.
 */
const LITERAL = /\[(?:#[0-9a-fA-F]{3,8}|(?:rgba?|hsla?|oklch|oklab|lab|lch)\(|[a-z-]+:#[0-9a-fA-F]{3,8})/g;

// The count across src: none. Use a token or a skin value (SkinTokens.headerFill) instead of a literal; never raise it.
const MAX_LITERALS = 0;

// Arbitrary text sizes (`text-[13px]`) left in src/components/studio after the A-18 sweep: the tile size caption's 8.5 px.
const MAX_ARBITRARY_TEXT = 1;

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = `${dir}/${e.name}`;
    return e.isDirectory() ? files(path) : /\.(tsx?|css)$/.test(e.name) ? [join(path)] : [];
  });

describe("colour literals in the UI", () => {
  it("does not grow back in src", () => {
    const count = files("src").reduce((n, f) => n + (readFileSync(f, "utf8").match(LITERAL)?.length ?? 0), 0);
    expect(count).toBeLessThanOrEqual(MAX_LITERALS);
  });

  it("keeps the studio's type on the scale", () => {
    // `text-nano` to `text-hero` (tokens.css) are the scale. Lower the cap as the rest moves; never raise it.
    const count = files("src/components/studio").reduce((n, f) => n + (readFileSync(f, "utf8").match(/text-\[\d/g)?.length ?? 0), 0);
    expect(count).toBeLessThanOrEqual(MAX_ARBITRARY_TEXT);
  });
});

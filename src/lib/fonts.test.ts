import { describe, expect, it } from "vitest";
import { ensureFont, FONT_IDS, googleFontHref, type FontDocument } from "./fonts";

/** A document stand-in that records appended links. */
function fakeDocument() {
  const links: { id: string; rel: string; href: string }[] = [];
  const doc = {
    head: { appendChild: (n: { id: string; rel: string; href: string }) => links.push(n) },
    getElementById: (id: string) => links.find((l) => l.id === id) ?? null,
    createElement: () => ({ id: "", rel: "", href: "" }),
  } as unknown as FontDocument;
  return { doc, links };
}

describe("font catalog", () => {
  it("has unique ids", () => {
    expect(new Set(FONT_IDS).size).toBe(FONT_IDS.length);
  });

});

describe("googleFontHref", () => {
  it("builds a css2 url with + for spaces", () => {
    expect(googleFontHref("Space Grotesk:wght@400..700")).toBe(
      "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400..700&display=swap"
    );
  });
});

describe("ensureFont", () => {
  it("injects a stylesheet link once", () => {
    const { doc, links } = fakeDocument();
    ensureFont("inter", doc);
    ensureFont("inter", doc);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ id: "font-inter", rel: "stylesheet" });
    expect(links[0].href).toContain("family=Inter");
  });

});

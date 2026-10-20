import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseChangelog, renderMarkdown, safeHref, sectionTone, shortDate } from "./changelog";

const SAMPLE = `# Changelog

Preamble that belongs to no release.

## [Unreleased]

### Added
- A thing with \`code\` and **bold**

## [1.2.0] - 2026-10-20

Intro paragraph.

### Fixed
- One
- Two

### Removed
- Gone

## [1.1.0] - 2026-10-19
### Changed
- Moved

[Unreleased]: https://example.com/compare
`;

describe("parseChangelog", () => {
  const releases = parseChangelog(SAMPLE);

  it("reads the Keep a Changelog headings in file order", () => {
    expect(releases.map((r) => [r.version, r.date, r.unreleased])).toEqual([
      ["Unreleased", null, true],
      ["1.2.0", "2026-10-20", false],
      ["1.1.0", "2026-10-19", false],
    ]);
  });

  it("splits an intro from its sections", () => {
    expect(releases[0].intro).toBe("");
    expect(releases[1].intro).toBe("Intro paragraph.");
    expect(releases[1].sections.map((s) => s.title)).toEqual(["Fixed", "Removed"]);
    expect(releases[1].sections[0].body).toBe("- One\n- Two");
  });

  it("drops the trailing link references", () => {
    expect(releases[2].sections[0].body).toBe("- Moved");
  });

  it("parses the real file", () => {
    const real = parseChangelog(readFileSync(new URL("../../../CHANGELOG.md", import.meta.url), "utf8"));
    expect(real[0].unreleased).toBe(true);
    expect(real.length).toBeGreaterThan(1);
    expect(real.slice(1).every((r) => /^\d+\.\d+\.\d+$/.test(r.version) && r.date !== null)).toBe(true);
    expect(real.every((r) => r.sections.length > 0 || r.intro.length > 0)).toBe(true);
  });
});

describe("renderMarkdown", () => {
  it("renders inline code, bold and lists", () => {
    const html = renderMarkdown("- A `code` and **bold**");
    expect(html).toContain("<li>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain("<strong>bold</strong>");
  });

  it("shows raw HTML as text", () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\nhi <img src=x onerror="alert(1)"> there');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
  });

  it("links only to web pages, and marks them for the system browser", () => {
    expect(renderMarkdown("[ok](https://example.com/a?b=1&c=2)")).toContain('<a href="https://example.com/a?b=1&amp;c=2" data-external>ok</a>');
    for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "file:///c:/x", "//evil.example"]) {
      const html = renderMarkdown(`[x](${bad})`);
      expect(html, bad).not.toContain("<a");
      expect(html, bad).not.toContain("href");
    }
  });

  it("reduces an image to its alt text", () => {
    expect(renderMarkdown("![alt text](https://example.com/x.png)")).not.toContain("<img");
  });
});

describe("small helpers", () => {
  it("accepts only http and https links", () => {
    expect(safeHref("https://a.b")).toBe("https://a.b");
    expect(safeHref("mailto:a@b.c")).toBeNull();
    expect(safeHref("javascript:1")).toBeNull();
    expect(safeHref(undefined)).toBeNull();
  });

  it("formats dates and colours the section labels", () => {
    expect(shortDate("2026-10-12")).toBe("12 Oct 2026");
    expect(shortDate("soon")).toBe("soon");
    expect([sectionTone("Added"), sectionTone("changed"), sectionTone("Fixed"), sectionTone("Security")]).toEqual(["green", "blue", "amber", "neutral"]);
  });
});

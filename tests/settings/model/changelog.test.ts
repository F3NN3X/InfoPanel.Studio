import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { entryHeadline, headlineShortens, parseChangelog, renderMarkdown, safeHref, sectionEntries, sectionTone, shortDate } from "@/settings/model/changelog";

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

  it("leaves out an empty Unreleased, keeps one with notes, and reads a prerelease", () => {
    const empty = parseChangelog("## [Unreleased]\n\n## [1.3.0-beta.1] - 2026-10-20\n\n### Added\n- A thing\n");
    expect(empty.map((r) => [r.version, r.date])).toEqual([["1.3.0-beta.1", "2026-10-20"]]);
    const notes = parseChangelog("## [Unreleased]\n\n### Fixed\n- B\n\n## [1.2.0] - 2026-10-20\n\n### Added\n- A\n");
    expect(notes.map((r) => r.version)).toEqual(["Unreleased", "1.2.0"]);
  });

  it("parses the real file", () => {
    const real = parseChangelog(readFileSync(new URL("../../../CHANGELOG.md", import.meta.url), "utf8"));
    expect(real.length).toBeGreaterThan(1);
    // Released versions (prereleases like 1.3.0-beta.1 too) carry a date; Unreleased, when it has notes, comes first.
    const released = real.filter((r) => !r.unreleased);
    expect(released.every((r) => /^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$/.test(r.version) && r.date !== null)).toBe(true);
    expect(real.findIndex((r) => r.unreleased)).toBeLessThanOrEqual(0);
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

describe("entryHeadline", () => {
  it("takes the first sentence", () => {
    expect(entryHeadline("Pin a profile. It stays open while you edit.")).toBe("Pin a profile");
    expect(entryHeadline("Fixed a crash; also tidied up")).toBe("Fixed a crash");
  });

  it("cuts at a colon", () => {
    expect(entryHeadline("**Grouped left rail:** sections sit under headings")).toBe("Grouped left rail");
  });

  it("keeps a dot or colon that is not the end of a clause", () => {
    expect(entryHeadline("Reads v1.2.3 and `a: b. c` fine")).toBe("Reads v1.2.3 and <code>a: b. c</code> fine");
  });

  it("caps long text on a word boundary with an ellipsis", () => {
    const out = entryHeadline(`${"word ".repeat(40)}end`);
    expect(out.endsWith("word…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(121);
  });

  it("closes a code span the cap cuts through", () => {
    const out = entryHeadline(`${"word ".repeat(23)}\`some long code span here\``);
    expect(out).toMatch(/<code>.*<\/code>…$|word…$/);
    expect(out.split("<code>").length).toBe(out.split("</code>").length);
  });

  it("strips Markdown to plain text but keeps code spans", () => {
    expect(entryHeadline("**Bold** and *italic* with a [link](https://example.com) and `code`")).toBe(
      "Bold and italic with a link and <code>code</code>"
    );
  });

  it("escapes HTML", () => {
    expect(entryHeadline("A <b>tag</b> & more")).toBe("A &lt;b&gt;tag&lt;/b&gt; &amp; more");
  });

  it("uses the whole entry when it has no period", () => {
    expect(entryHeadline("Just a short note")).toBe("Just a short note");
    expect(entryHeadline("Ends with a period.")).toBe("Ends with a period");
  });
});

describe("hardening", () => {
  it("ignores the private-use fence characters in the input", () => {
    expect(entryHeadline("A stray fence")).toBe("A stray fence");
  });

  it("counts numbered list items as entries", () => {
    expect(sectionEntries("1. First\n2) Second\n   more")).toEqual(["First", "Second more"]);
  });
});

describe("headlineShortens", () => {
  it("is true only when the headline leaves text out", () => {
    expect(headlineShortens("Just a short note")).toBe(false);
    expect(headlineShortens("Ends with a period.")).toBe(false);
    expect(headlineShortens("Pin a profile. It stays open while you edit.")).toBe(true);
    expect(headlineShortens(`${"word ".repeat(40)}end`)).toBe(true);
  });
});

describe("sectionEntries", () => {
  it("splits top-level bullets and folds nested lines into their bullet", () => {
    expect(sectionEntries("- One\n  continued\n  - nested\n- Two\n\n- Three")).toEqual(["One continued - nested", "Two", "Three"]);
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

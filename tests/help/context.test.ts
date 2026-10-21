// @vitest-environment happy-dom
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { ARTICLE_FILES } from "@/help/content";
import { THEME_CARD_HELP, focusedSection, settingsHelpTarget, studioHelpTarget, type StudioHelpState } from "@/help/context";
import { parseHelpHash } from "@/help/links";
import { slugify } from "@/help/slug";
import { PAGE_NAMES, type PageId } from "@/settings/model/search";

const articles = new Set(Object.keys(ARTICLE_FILES).map((path) => /([^/]+)\.md$/.exec(path)![1]));
const base: StudioHelpState = { dialog: null, view: "design", zone: null };

describe("studioHelpTarget", () => {
  it("opens an article that exists for every view and selection", () => {
    const states: StudioHelpState[] = [
      ...(["design", "sources", "library", "theme", "alerts", "screens"] as const).map((view) => ({ ...base, view })),
      ...(["widget", "panel", "canvas", "blank"] as const).map((zone) => ({ ...base, zone })),
    ];
    for (const state of states) {
      const { article } = studioHelpTarget(state);
      expect(articles.has(article!), JSON.stringify(state)).toBe(true);
    }
  });

  it("opens an article that exists, or Help home, from every Settings window page", () => {
    for (const page of Object.keys(PAGE_NAMES) as PageId[]) {
      const { article } = settingsHelpTarget(page);
      if (article !== undefined) expect(articles.has(article), page).toBe(true);
    }
    expect(settingsHelpTarget("dashboard")).toEqual({ article: "performance" });
  });

  it("puts an open dialog first, and the view before a zone still selected under it", () => {
    expect(studioHelpTarget({ ...base, dialog: "import", zone: "widget" })).toEqual({ article: "import" });
    expect(studioHelpTarget({ ...base, view: "theme", zone: "widget" })).toEqual({ article: "themes" });
    expect(studioHelpTarget({ ...base, zone: "widget" })).toEqual({ article: "widget-settings" });
  });
});

describe("F1 in a focused section", () => {
  it("opens the section's heading, under an open dialog and over the view", () => {
    expect(studioHelpTarget({ ...base, view: "theme", section: THEME_CARD_HELP })).toEqual(parseHelpHash(THEME_CARD_HELP));
    expect(studioHelpTarget({ ...base, view: "theme", dialog: "import", section: THEME_CARD_HELP })).toEqual({ article: "import" });
  });

  it("names a heading Theme's article has", () => {
    const { article, heading } = parseHelpHash(THEME_CARD_HELP);
    const file = Object.entries(ARTICLE_FILES).find(([path]) => path.endsWith(`/${article}.md`))![1];
    const slugs = [...file.matchAll(/^#{2,3} (.+)$/gm)].map((m) => slugify(m[1]));
    expect(slugs).toContain(heading);
  });

  it("reads the section the focus is in, and none outside one", () => {
    document.body.innerHTML = `<section data-help-section="themes/locking"><button id="in">x</button></section><button id="out">y</button>`;
    document.getElementById("in")!.focus();
    expect(focusedSection()).toBe("themes/locking");
    document.getElementById("out")!.focus();
    expect(focusedSection()).toBeNull();
  });
});

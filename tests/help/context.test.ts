/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { ARTICLE_FILES } from "@/help/content";
import { studioHelpTarget, type StudioHelpState } from "@/help/context";

const articles = new Set(Object.keys(ARTICLE_FILES).map((path) => /([^/]+)\.md$/.exec(path)![1]));
const base: StudioHelpState = { dialog: null, view: "design", zone: null };

describe("studioHelpTarget", () => {
  it("opens an article that exists for every view, tab and selection", () => {
    const states: StudioHelpState[] = [
      ...(["design", "sources", "library", "theme", "alerts", "screens", "settings"] as const).map((view) => ({ ...base, view })),
      ...(["widget", "panel", "canvas", "blank"] as const).map((zone) => ({ ...base, zone })),
      ...(["dashboard", "studio", "app"] as const).map((settingsTab) => ({ ...base, view: "settings" as const, settingsTab })),
      { ...base, view: "settings", settingsTab: "app", settingsSection: "updates" },
    ];
    for (const state of states) {
      const { article } = studioHelpTarget(state);
      expect(articles.has(article!), JSON.stringify(state)).toBe(true);
    }
  });

  it("puts an open dialog first, and the view before a zone still selected under it", () => {
    expect(studioHelpTarget({ ...base, dialog: "import", zone: "widget" })).toEqual({ article: "import" });
    expect(studioHelpTarget({ ...base, view: "theme", zone: "widget" })).toEqual({ article: "themes" });
    expect(studioHelpTarget({ ...base, zone: "widget" })).toEqual({ article: "widget-settings" });
  });
});

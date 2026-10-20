// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { dialogArticle, settingsHelpTarget, studioHelpTarget } from "./context";

const state = { dialog: null, zone: null, drawer: null } as const;

describe("studioHelpTarget", () => {
  it("prefers the dialog, then the selection, then the drawer, then the theme", () => {
    expect(studioHelpTarget({ dialog: "import", zone: "widget", drawer: "profiles" })).toEqual({ article: "import" });
    expect(studioHelpTarget({ ...state, zone: "widget", drawer: "profiles" })).toEqual({ article: "widget-settings" });
    expect(studioHelpTarget({ ...state, zone: "blank" })).toEqual({ article: "zones" });
    expect(studioHelpTarget({ ...state, drawer: "profiles" })).toEqual({ article: "profiles" });
    expect(studioHelpTarget(state)).toEqual({ article: "themes" });
  });
});

describe("settingsHelpTarget", () => {
  it("maps a section to its article, and About to Help home", () => {
    expect(settingsHelpTarget("server")).toEqual({ article: "kiosk" });
    expect(settingsHelpTarget("logs")).toEqual({ article: "diagnostics" });
    expect(settingsHelpTarget("about")).toEqual({});
  });
});

describe("dialogArticle", () => {
  it("is the innermost marked element, or null with none", () => {
    document.body.innerHTML = "";
    expect(dialogArticle()).toBeNull();
    document.body.innerHTML = `<div data-help-article="outer"><div data-help-article="inner"></div></div>`;
    expect(dialogArticle()).toBe("inner");
  });
});

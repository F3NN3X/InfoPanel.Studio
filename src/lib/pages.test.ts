import { describe, expect, it } from "vitest";
import type { MonitorProfile, Placement, ProfileView } from "./layout";
import {
  MAIN_PAGE_ID,
  addPage,
  allPlacements,
  applyView,
  duplicatePage,
  mainPage,
  mapPlacements,
  movePage,
  normalizeRotate,
  onPage,
  pageOf,
  profileWithPage,
  removePage,
  renamePage,
  setPageIcon,
  zoneCount,
} from "./pages";

const zone = (id: string, extra: Partial<Placement> = {}): Placement => ({
  id,
  module: "SystemOverview",
  colStart: 1,
  rowStart: 1,
  colSpan: 2,
  rowSpan: 1,
  visible: true,
  ...extra,
});

const profile = (): MonitorProfile => ({
  id: "p",
  name: "P",
  width: 1920,
  height: 1080,
  cols: 12,
  rows: 6,
  fit: "scroll",
  widgetTheme: { values: { accent: "#ff0000" } },
  pages: [
    { id: "a", name: "A", placements: [zone("a1"), zone("a2")], widgetTheme: { values: { accent: "#00ff00" }, follow: { colors: false } } },
    { id: "b", name: "B", icon: "Home", placements: [zone("b1")] },
  ],
});

describe("mainPage", () => {
  it("is the page legacy zones migrate into", () => {
    expect(mainPage()).toEqual({ id: MAIN_PAGE_ID, name: "Main", placements: [] });
    const zones = [zone("z")];
    expect(mainPage(zones).placements).toBe(zones);
  });
});

describe("pageOf / profileWithPage", () => {
  it("finds a page by id, else the first", () => {
    const p = profile();
    expect(pageOf(p, "b").id).toBe("b");
    expect(pageOf(p, "gone").id).toBe("a");
    expect(pageOf(p).id).toBe("a");
  });

  it("is the profile minus pages, plus the page's zones and id", () => {
    const p = profile();
    const view = profileWithPage(p, "b");
    expect(view).not.toHaveProperty("pages");
    expect(view.placements).toBe(p.pages[1].placements);
    expect(view.pageId).toBe("b");
    expect(view.widgetTheme).toBe(p.widgetTheme);
    expect(view.pageTheme).toBeUndefined();
    expect(profileWithPage(p, "gone").pageId).toBe("a");
    expect(profileWithPage(p, "a").pageTheme).toBe(p.pages[0].widgetTheme);
  });
});

describe("applyView", () => {
  it("writes the view's fields back and its zones into its page", () => {
    const p = profile();
    const view: ProfileView = { ...profileWithPage(p, "b"), name: "Renamed", placements: [zone("n")] };
    const next = applyView(p, view);
    expect(next.name).toBe("Renamed");
    expect(next.pages[1].placements.map((z) => z.id)).toEqual(["n"]);
    expect(next.pages[0]).toBe(p.pages[0]);
    expect(next).not.toHaveProperty("placements");
    expect(next).not.toHaveProperty("pageId");
  });

  it("writes the view's page theme back onto its page (and clears it there)", () => {
    const p = profile();
    const theme = { values: { glow: "soft" } };
    expect(applyView(p, { ...profileWithPage(p, "b"), pageTheme: theme }).pages[1].widgetTheme).toBe(theme);
    const cleared = applyView(p, { ...profileWithPage(p, "a"), pageTheme: undefined });
    expect(cleared.pages[0]).not.toHaveProperty("widgetTheme");
    expect(cleared).not.toHaveProperty("pageTheme");
  });

  it("targets the first page when the view has no page id", () => {
    const p = profile();
    const { pageId: _id, ...rest } = profileWithPage(p);
    const next = applyView(p, { ...rest, placements: [] });
    expect(next.pages[0].placements).toEqual([]);
    expect(next.pages[1]).toBe(p.pages[1]);
  });
});

describe("onPage", () => {
  it("applies an edit to one page", () => {
    const p = profile();
    const next = onPage("b", (v) => ({ ...v, placements: [...v.placements, zone("b2")] }))(p);
    expect(next.pages[1].placements).toHaveLength(2);
    expect(next.pages[0]).toBe(p.pages[0]);
  });

  it("returns the same profile when the edit changes nothing", () => {
    const p = profile();
    expect(onPage("a", (v) => v)(p)).toBe(p);
    expect(onPage(undefined, (v) => v)(p)).toBe(p);
  });
});

describe("allPlacements / zoneCount / mapPlacements", () => {
  it("covers every page in order", () => {
    const p = profile();
    expect(allPlacements(p).map((z) => z.id)).toEqual(["a1", "a2", "b1"]);
    expect(zoneCount(p)).toBe(3);
  });

  it("maps every page, and keeps the profile and pages when nothing changes", () => {
    const p = profile();
    expect(mapPlacements(p, (z) => z)).toBe(p);
    const next = mapPlacements(p, (z) => (z.id === "b1" ? { ...z, visible: false } : z));
    expect(next.pages[0]).toBe(p.pages[0]);
    expect(next.pages[1].placements[0].visible).toBe(false);
  });
});

describe("page operations", () => {
  it("adds a blank page with a fresh id and a default name", () => {
    const p = profile();
    const { profile: next, pageId } = addPage(p);
    expect(next.pages).toHaveLength(3);
    expect(next.pages[2]).toMatchObject({ id: pageId, name: "Page 3", placements: [] });
    expect(p.pages.map((x) => x.id)).not.toContain(pageId);
    expect(addPage(p, "Games").profile.pages[2].name).toBe("Games");
  });

  it("removes a page but never the last one", () => {
    const p = profile();
    expect(removePage(p, "a").pages.map((x) => x.id)).toEqual(["b"]);
    const one = removePage(p, "a");
    expect(removePage(one, "b")).toBe(one);
    expect(removePage(p, "gone")).toBe(p);
  });

  it("moves a page, clamping the index", () => {
    const p = profile();
    expect(movePage(p, "a", 1).pages.map((x) => x.id)).toEqual(["b", "a"]);
    expect(movePage(p, "a", 9).pages.map((x) => x.id)).toEqual(["b", "a"]);
    expect(movePage(p, "b", 0).pages.map((x) => x.id)).toEqual(["b", "a"]);
    expect(movePage(p, "a", 0)).toBe(p);
    expect(movePage(p, "gone", 0)).toBe(p);
  });

  it("renames a page and sets or clears its icon", () => {
    const p = profile();
    expect(renamePage(p, "a", "Home").pages[0].name).toBe("Home");
    expect(renamePage(p, "a", "Home").pages[1]).toBe(p.pages[1]);
    expect(setPageIcon(p, "a", "Gauge").pages[0].icon).toBe("Gauge");
    expect(setPageIcon(p, "b", undefined).pages[1].icon).toBeUndefined();
  });

  it("duplicates a page after its source with fresh zone ids", () => {
    const p = profile();
    const { profile: next, pageId } = duplicatePage(p, "a");
    expect(next.pages.map((x) => x.id)).toEqual(["a", pageId, "b"]);
    const copy = next.pages[1];
    expect(copy.name).toBe("A copy");
    expect(copy.placements).toHaveLength(2);
    expect(copy.placements.map((z) => z.id)).not.toContain("a1");
    expect(copy.placements.map((z) => z.id)).not.toContain("a2");
    expect(new Set(allPlacements(next).map((z) => z.id)).size).toBe(5);
    expect(copy.placements[0]).toMatchObject({ module: "SystemOverview", colSpan: 2 });
    expect(next.pages[0]).toBe(p.pages[0]);
  });
});

describe("normalizeRotate", () => {
  const ids = ["a", "b"];
  it("is undefined without an object", () => {
    expect(normalizeRotate(undefined, ids)).toBeUndefined();
    expect(normalizeRotate("x", ids)).toBeUndefined();
    expect(normalizeRotate([], ids)).toBeUndefined();
  });

  it("clamps the interval to 3..3600 and defaults a bad one to 15", () => {
    expect(normalizeRotate({ enabled: true, seconds: 1 }, ids)?.seconds).toBe(3);
    expect(normalizeRotate({ enabled: true, seconds: 99999 }, ids)?.seconds).toBe(3600);
    expect(normalizeRotate({ enabled: true, seconds: 30 }, ids)?.seconds).toBe(30);
    expect(normalizeRotate({ enabled: true, seconds: Number.NaN }, ids)?.seconds).toBe(15);
    expect(normalizeRotate({ enabled: true }, ids)?.seconds).toBe(15);
  });

  it("keeps enabled a boolean, off unless true", () => {
    expect(normalizeRotate({ enabled: true, seconds: 5 }, ids)?.enabled).toBe(true);
    expect(normalizeRotate({ enabled: "yes", seconds: 5 }, ids)?.enabled).toBe(false);
  });

  it("keeps only existing page ids and drops an empty list", () => {
    expect(normalizeRotate({ enabled: false, seconds: 5, pages: ["b", "gone", 3] }, ids)).toEqual({
      enabled: false,
      seconds: 5,
      pages: ["b"],
    });
    expect(normalizeRotate({ enabled: true, seconds: 5, pages: ["gone"] }, ids)).toEqual({ enabled: true, seconds: 5 });
  });
});

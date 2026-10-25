import { describe, expect, it } from "vitest";
import { CANVAS_ID, newProfile, type MonitorProfile, type Placement } from "@/lib/layout";
import { filterEntries, savedEntries, screenEntries, screenKind, sortEntries } from "@/lib/screens/list";

const zone = (id: string, module: string): Placement => ({ id, module, colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true });
const screen = (id: string, name: string, w: number, h: number, modules: string[], updatedAt?: string): MonitorProfile => {
  const base = newProfile(name, w, h);
  return { ...base, id, updatedAt, pages: [{ ...base.pages[0], placements: modules.map((m, i) => zone(`${id}${i}`, m)) }] };
};

const profiles = [
  screen("a", "Desk strip", 1920, 480, [CANVAS_ID], "2026-10-01T10:00:00Z"),
  screen("b", "Main", 1920, 1080, ["Clock", "CpuMonitor"], "2026-10-03T10:00:00Z"),
  screen("c", "Mixed bag", 1280, 480, ["Clock", CANVAS_ID]),
  screen("d", "Empty", 800, 480, []),
];
const names = (list: { name: string }[]) => list.map((e) => e.name);

describe("screenKind", () => {
  it("tells Dashboard, InfoPanel and Mixed by the zones; an empty screen is a Dashboard", () => {
    expect(profiles.map(screenKind)).toEqual(["infopanel", "dashboard", "mixed", "dashboard"]);
  });
});

describe("filterEntries", () => {
  const entries = screenEntries(profiles);
  it("filters by kind, a Mixed screen counting for both Dashboard and InfoPanel", () => {
    expect(names(filterEntries(entries, "", "dashboard"))).toEqual(["Main", "Mixed bag", "Empty"]);
    expect(names(filterEntries(entries, "", "infopanel"))).toEqual(["Desk strip", "Mixed bag"]);
    expect(filterEntries(entries, "", "saved")).toEqual([]);
  });
  it("searches name, kind and size, with every word needed; the size may be typed with an x", () => {
    expect(names(filterEntries(entries, "main", "all"))).toEqual(["Main"]);
    expect(names(filterEntries(entries, "mixed", "all"))).toEqual(["Mixed bag"]);
    expect(names(filterEntries(entries, "1920x480", "all"))).toEqual(["Desk strip"]);
    expect(names(filterEntries(entries, "1920×1080 main", "all"))).toEqual(["Main"]);
    expect(filterEntries(entries, "main strip", "all")).toEqual([]);
  });
  it("lists saved Library profiles under InfoPanel and Saved only", () => {
    const saved = savedEntries([{ id: "s", name: "Console", meta: { width: 1920, height: 720 }, updatedAt: "2026-10-05T00:00:00Z" }]);
    expect(filterEntries(saved, "", "infopanel")).toHaveLength(1);
    expect(filterEntries(saved, "", "saved")).toHaveLength(1);
    expect(filterEntries(saved, "", "dashboard")).toHaveLength(0);
    expect(filterEntries(saved, "1920x720", "all")).toHaveLength(1);
  });
});

describe("sortEntries", () => {
  const entries = screenEntries(profiles);
  it("puts the newest edit first and never-edited screens last, in their own order", () => {
    expect(names(sortEntries(entries, "edited"))).toEqual(["Main", "Desk strip", "Mixed bag", "Empty"]);
  });
  it("sorts by name with numbers in order, by size largest first, and keeps the config order for manual", () => {
    expect(names(sortEntries(entries, "name"))).toEqual(["Desk strip", "Empty", "Main", "Mixed bag"]);
    expect(names(sortEntries(screenEntries([screen("x", "Screen 10", 1, 1, []), screen("y", "Screen 9", 1, 1, [])]), "name"))).toEqual(["Screen 9", "Screen 10"]);
    expect(names(sortEntries(entries, "size"))).toEqual(["Main", "Desk strip", "Mixed bag", "Empty"]);
    expect(names(sortEntries(entries, "manual"))).toEqual(["Desk strip", "Main", "Mixed bag", "Empty"]);
  });
  it("does not change its input", () => {
    const before = names(entries);
    sortEntries(entries, "name");
    expect(names(entries)).toEqual(before);
  });
});

import { describe, expect, it } from "vitest";
import { CANVAS_ID, defaultConfig, mergeConfig, newProfile, type DashboardConfig, type Placement, type ProfileView } from "@/lib/layout";
import { profileWithPage } from "@/lib/pages";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import { canvasRect, canvasZoneOf, countItems, importAsProfile, importIntoProfile, withCanvas } from "@/components/studio/import-actions";

const canvas = (name = "Arc") =>
  ({
    format: "infopanel-canvas",
    version: 1,
    source: { name, origin: "file", importedAt: "" },
    dataApi: null,
    defaultMode: "native",
    profile: { Name: name, Width: 1920, Height: 550 },
    items: [],
    assets: [],
    fonts: [],
  }) as unknown as StoredCanvas;

function config(): DashboardConfig {
  const main = { ...newProfile("Main", 1920, 1080), id: "main", cols: 12, rows: 6, fit: "fill" as const };
  return { ...defaultConfig(), profiles: [main], activeProfile: "main" };
}

const zone = (id: string, col: number, row: number, cols: number, rows: number, extra: Partial<Placement> = {}): Placement => ({
  id, module: "blank", colStart: col, rowStart: row, colSpan: cols, rowSpan: rows, visible: true, ...extra,
});

const view = (c: DashboardConfig, id = "main"): ProfileView => profileWithPage(c.profiles.find((p) => p.id === id)!);

describe("importAsProfile", () => {
  it("adds a profile sized like the InfoPanel one, its canvas zone filling it, and makes it active", () => {
    const before = config();
    const { config: out, profileId, zoneId } = importAsProfile(before, canvas(), "Arc", { width: 1920, height: 550 });
    const p = out.profiles.find((x) => x.id === profileId)!;
    expect(out.activeProfile).toBe(profileId);
    expect(out.profiles).toHaveLength(2);
    // Edit v3 SPEC §3.7: cells of about 100 px (1920 / 100, 550 / 100 rounded), no gap or padding.
    expect(p).toMatchObject({ name: "Arc", width: 1920, height: 550, cols: 19, rows: 6, gap: 0, padding: 0, fit: "fill" });
    expect(p.pages[0]).not.toHaveProperty("layout");
    expect(p.pages[0].placements).toEqual([
      { id: zoneId, module: CANVAS_ID, colStart: 1, rowStart: 1, colSpan: 19, rowSpan: 6, visible: true, canvas: canvas() },
    ]);
    expect(before.profiles).toHaveLength(1);
  });

  it("leaves what displays show alone when asked (a pinned studio)", () => {
    const { config: out, profileId } = importAsProfile(config(), canvas(), "Arc", { width: 1920, height: 550 }, false);
    expect(out.profiles.map((p) => p.id)).toContain(profileId);
    expect(out.activeProfile).toBe("main");
  });

  it("survives a reload unchanged (normalization keeps the zone and its canvas)", () => {
    const { config: out, profileId } = importAsProfile(config(), canvas(), "Arc", { width: 1920, height: 550 });
    const back = mergeConfig(JSON.parse(JSON.stringify(out)));
    const p = back.profiles.find((x) => x.id === profileId)!;
    expect(p.pages[0].placements[0]).toMatchObject({ module: CANVAS_ID, colSpan: 19, rowSpan: 6, canvas: canvas() });
    expect(back.profiles.find((x) => x.id === profileId)).toEqual(out.profiles.find((x) => x.id === profileId));
  });
});

describe("canvasRect", () => {
  it("picks the free box that draws the canvas largest, the smaller box on a tie", () => {
    const c = config();
    // A 1920×550 canvas on a 12×6 grid of 160×180 cells: 12×4 cells draw it at full size (5 rows too, but larger).
    expect(canvasRect(view(c), 1920, 550)).toEqual({ col: 1, row: 1, cols: 12, rows: 4 });
  });

  it("goes around taken cells, and is null on a full page", () => {
    const c = config();
    c.profiles[0].pages[0].placements = [zone("a", 1, 1, 12, 3)];
    expect(canvasRect(view(c), 1920, 550)).toEqual({ col: 1, row: 4, cols: 12, rows: 3 });
    c.profiles[0].pages[0].placements = [zone("a", 1, 1, 12, 6)];
    expect(canvasRect(view(c), 1920, 550)).toBeNull();
  });
});

describe("importIntoProfile", () => {
  it("adds a canvas zone to the page on the canvas, as one config change", () => {
    const c = config();
    const r = importIntoProfile(c, view(c), canvas(), { width: 1920, height: 550 })!;
    const zones = r.config.profiles[0].pages[0].placements;
    expect(zones).toHaveLength(1);
    expect(zones[0]).toMatchObject({ id: r.zoneId, module: CANVAS_ID, colSpan: 12, rowSpan: 4, canvas: canvas() });
    expect(r.config.activeProfile).toBe("main");
  });

  it("is null when the page has no room", () => {
    const c = config();
    c.profiles[0].pages[0].placements = [zone("a", 1, 1, 12, 6)];
    expect(importIntoProfile(c, view(c), canvas(), { width: 100, height: 100 })).toBeNull();
  });
});

describe("canvasZoneOf and withCanvas", () => {
  const c = config();
  c.profiles[0].pages[0].placements = [
    zone("w", 1, 1, 2, 2),
    zone("c1", 3, 1, 2, 2, { module: CANVAS_ID, canvas: canvas("one") }),
    zone("c2", 5, 1, 2, 2, { module: CANVAS_ID, canvas: canvas("two") }),
  ];

  it("exports the selected canvas zone, else the page's first", () => {
    expect(canvasZoneOf(view(c), "c2")?.id).toBe("c2");
    expect(canvasZoneOf(view(c), "w")?.id).toBe("c1");
    expect(canvasZoneOf(view(config()))).toBeUndefined();
  });

  it("replaces one zone's stored form; the same config back for an unknown zone", () => {
    const next = withCanvas(c, "c2", canvas("baked"));
    expect(next.profiles[0].pages[0].placements[2].canvas?.source.name).toBe("baked");
    expect(next.profiles[0].pages[0].placements[1]).toBe(c.profiles[0].pages[0].placements[1]);
    expect(withCanvas(c, "nope", canvas())).toBe(c);
  });
});

describe("countItems", () => {
  it("counts the items inside groups too", () => {
    const items = [{ kind: "Text" }, { kind: "Group", DisplayItems: [{ kind: "Text" }, { kind: "Group", DisplayItems: [{ kind: "Bar" }] }] }] as unknown as StoredCanvas["items"];
    expect(countItems(items)).toBe(5);
  });
});

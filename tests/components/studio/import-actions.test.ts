import { upgradeConfig } from "@/lib/config-upgrade";
import { describe, expect, it } from "vitest";
import { CANVAS_ID, ITEM_ID, defaultConfig, newProfile, type DashboardConfig, type Placement, type ProfileView } from "@/lib/layout";
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
    const back = upgradeConfig(JSON.parse(JSON.stringify(out)));
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
  // Edit v3 SPEC §3.8 (phase 6): no free area is made any more; the profile lands as a group of its items, at the
  // pixels the cells it draws largest in would draw them.
  it("adds the profile's items to the page as a group named after it, as one config change, and no free area", () => {
    const c = config();
    const two = { ...canvas(), items: [{ kind: "Text", Name: "A", X: 100, Y: 50 }, { kind: "Text", Name: "B", X: 300, Y: 150 }] } as unknown as StoredCanvas;
    const r = importIntoProfile(c, view(c), two, { width: 1920, height: 550 })!;
    const page = r.config.profiles[0].pages[0];
    expect(page.placements.some((p) => p.module === CANVAS_ID)).toBe(false);
    expect(page.groups).toEqual([expect.objectContaining({ id: r.zoneId, name: "Arc" })]);
    const [a, b] = ["A", "B"].map((n) => page.placements.find((p) => p.item?.Name === n)!);
    expect([a.module, b.module]).toEqual([ITEM_ID, ITEM_ID]);
    expect([a.groupId, b.groupId]).toEqual([r.zoneId, r.zoneId]);
    // 1920 × 550 fills the 12 × 4 cells' width (1920 px), so the items keep their pixels' distances.
    expect([b.px!.x - a.px!.x, b.px!.y - a.px!.y]).toEqual([200, 100]);
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

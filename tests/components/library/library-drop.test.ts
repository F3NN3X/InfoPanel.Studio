import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardConfig, Placement, ProfileView } from "@/lib/layout";
import type { LibraryItem } from "@/lib/library";
import { openCanvas } from "@/lib/infopanel/canvas";
import { tableOf } from "@/lib/infopanel/assets/assets";
import { toStored } from "@/lib/infopanel/import/stored";
import { parseProfileXml } from "@/lib/infopanel/parse";
import { bakeSignature, isStale } from "@/lib/infopanel/gauges/frames";
import type { VectorGauge } from "@/lib/infopanel/gauges/vector";
import { CUSTOM_GAUGE_ID } from "@/lib/gauge-studio/model";
import { STARTERS } from "@/lib/infopanel/gauges/presets";
import { libraryDragKind, libraryDragOf, LIBRARY_MIME } from "@/lib/my-library/drag";
import { withCanvas } from "@/components/studio/import-actions";
import type { StudioBridge } from "@/components/library/library-actions";
import { dropLibraryItem, librarySizeOf, zoneAtCell } from "@/components/library/library-drop";

const item = (over: Partial<LibraryItem>): LibraryItem =>
  ({ id: "lib_000000000001", kind: "image", name: "x", createdAt: "", updatedAt: "", files: ["a".repeat(64) + ".png"], meta: {}, copies: [], ...over }) as LibraryItem;
const grid = { cols: 6, rows: 4, width: 1200, height: 800 };

describe("library drops on the page", () => {
  it("sizes an image by its shape, a panel by its saved size, a style as one cell", () => {
    expect(librarySizeOf(item({ meta: { width: 1600, height: 400 } }), grid)).toEqual({ cols: 6, rows: 2 });
    expect(librarySizeOf(item({ kind: "panel", data: { colSpan: 3, rowSpan: 9 } }), grid)).toEqual({ cols: 3, rows: 4 });
    expect(librarySizeOf(item({ kind: "style" }), grid)).toEqual({ cols: 1, rows: 1 });
    expect(librarySizeOf(item({ kind: "gauge" }), grid)).toEqual({ cols: 1, rows: 1 });
    expect(librarySizeOf(item({ kind: "video" }), grid)).toBeNull();
    expect(librarySizeOf(undefined, grid)).toBeNull();
  });

  it("finds the visible zone under a cell", () => {
    const zones = [
      { id: "a", visible: false, colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 2 },
      { id: "b", visible: true, colStart: 1, rowStart: 1, colSpan: 3, rowSpan: 1 },
    ];
    expect(zoneAtCell(zones, { col: 3, row: 1 })?.id).toBe("b");
    expect(zoneAtCell(zones, { col: 1, row: 2 })).toBeUndefined();
  });

  it("reads a card's drag data and kind", () => {
    const data = new Map<string, string>([[LIBRARY_MIME, JSON.stringify({ libraryItemId: "lib_1", kind: "video" })]]);
    expect(libraryDragOf((t) => data.get(t) ?? "")).toEqual({ libraryItemId: "lib_1", kind: "video" });
    expect(libraryDragOf(() => "{bad")).toBeNull();
    expect(libraryDragKind([LIBRARY_MIME, `${LIBRARY_MIME}-image`])).toBe("image");
    expect(libraryDragKind(["Files"])).toBeUndefined();
  });
});

describe("library drops on a canvas zone", () => {
  const profile = parseProfileXml("<Profile><Name>P</Name><Width>800</Width><Height>400</Height></Profile>").profile;
  const canvas = toStored({ name: "Rig", origin: "file", dataApi: null, defaultMode: "infopanel", profile, items: [], fonts: [], assets: tableOf([]), keyOf: () => null });
  const zone = { id: "z1", module: "infopanel", colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true, canvas } as Placement;
  const config = { profiles: [{ id: "p", pages: [{ id: "pg", placements: [zone] }] }] } as unknown as DashboardConfig;

  function bridge() {
    let next = config;
    const b = {
      config,
      profile: { placements: [zone], pageId: "pg", cols: 2, rows: 1, width: 800, height: 400 } as unknown as ProfileView,
      profileId: "p",
      setConfig: vi.fn((fn: (c: DashboardConfig) => DashboardConfig) => {
        next = fn(next);
      }),
      updateProfile: vi.fn(),
      selection: [],
      select: vi.fn(),
      toast: vi.fn(),
      addCopy: vi.fn(),
    };
    return { b: b as unknown as StudioBridge & typeof b, after: () => next };
  }

  it("an image becomes an Image item at the pointer: one change, one copy", async () => {
    const { b, after } = bridge();
    const img = item({ name: "fan.png", meta: { type: "png", width: 64, height: 64, size: 900 } });
    await dropLibraryItem(b, { id: img.id, item: img }, null, { col: 1, row: 1 }, { zoneId: "z1", fx: 0.25, fy: 0.5 });
    expect(b.setConfig).toHaveBeenCalledTimes(1);
    const stored = after().profiles[0].pages[0].placements[0].canvas!;
    const open = openCanvas(JSON.parse(JSON.stringify(stored)));
    expect(open.items).toHaveLength(1);
    expect(open.items[0]).toMatchObject({ kind: "Image", FilePath: "fan.png", X: 168, Y: 168, Width: 64, Height: 64 });
    expect(b.addCopy).toHaveBeenCalledWith(img, expect.objectContaining({ profileId: "p", zoneId: "z1", itemPath: "0" }));
  });

  it("a panel dropped on a canvas zone still goes by the grid", async () => {
    const { b } = bridge();
    const panel = item({ kind: "panel", data: { colSpan: 1, rowSpan: 1 } });
    await dropLibraryItem(b, { id: panel.id, item: panel }, null, { col: 1, row: 1 }, { zoneId: "z1", fx: 0.5, fy: 0.5 });
    expect(b.setConfig).not.toHaveBeenCalled();
    expect(b.toast).toHaveBeenCalledWith("No room there");
  });
});

// Baking and storing frames are the canvas/network edge: a stand-in that yields two stored frames, or fails.
const baking = vi.hoisted(() => ({ bakeForDrop: vi.fn() }));
vi.mock("@/components/gauges/bake-on-drop", () => baking);
const bakedFrames = (g: VectorGauge) => ({
  frames: [
    { name: "ring_0.png", hash: "c".repeat(64), type: "png" as const, size: 10, ext: "png" },
    { name: "ring_1.png", hash: "d".repeat(64), type: "png" as const, size: 10, ext: "png" },
  ],
  baked: bakeSignature(g, 2),
});

describe("library gauge drops", () => {
  beforeEach(() => {
    baking.bakeForDrop.mockReset();
    baking.bakeForDrop.mockImplementation(async (g: VectorGauge) => bakedFrames(g));
  });

  const profile = parseProfileXml("<Profile><Name>P</Name><Width>800</Width><Height>400</Height></Profile>").profile;
  const canvas = toStored({ name: "Rig", origin: "file", dataApi: null, defaultMode: "infopanel", profile, items: [], fonts: [], assets: tableOf([]), keyOf: () => null });
  const zone = { id: "z1", module: "infopanel", colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true, canvas } as Placement;
  const config = { profiles: [{ id: "p", pages: [{ id: "pg", placements: [zone] }] }] } as unknown as DashboardConfig;
  const vector = STARTERS[0].gauge;
  const frameId = (c: string) => `${c.repeat(64)}.png`;
  const gauge = (data: unknown) => item({ kind: "gauge", name: "Ring", files: [], data });

  function bridge() {
    let next = config;
    let view = { placements: [zone], pageId: "pg", cols: 2, rows: 2, width: 800, height: 400 } as unknown as ProfileView;
    const b = {
      config,
      get profile() {
        return view;
      },
      profileId: "p",
      setConfig: vi.fn((fn: (c: DashboardConfig) => DashboardConfig) => {
        next = fn(next);
      }),
      updateProfile: vi.fn((fn: (p: ProfileView) => ProfileView) => {
        view = fn(view);
      }),
      selection: [],
      select: vi.fn(),
      toast: vi.fn(),
      addCopy: vi.fn(),
    };
    return { b: b as unknown as StudioBridge & typeof b, after: () => next, zones: () => view.placements };
  }
  const rect = { col: 1, row: 2, cols: 1, rows: 1 };

  it("a vector gauge on the grid becomes a Custom gauge zone with its spec and name, one copy", async () => {
    const { b, zones } = bridge();
    const g = gauge({ vector, min: 0, max: 100, animationSpeed: 0 });
    await dropLibraryItem(b, { id: g.id, item: g }, rect, { col: 1, row: 2 });
    const added = zones().find((z) => z.module === CUSTOM_GAUGE_ID)!;
    expect([added.colStart, added.rowStart, added.colSpan, added.rowSpan]).toEqual([1, 2, 1, 1]);
    expect(added.settings?.label).toBe("Ring");
    expect(JSON.parse(String(added.settings?.gauge))).toMatchObject({ shape: vector.shape, width: vector.width });
    expect(b.select).toHaveBeenCalledWith(added.id);
    expect(b.addCopy).toHaveBeenCalledWith(g, expect.objectContaining({ profileId: "p", zoneId: added.id }));
  });

  it("an image sequence can't be a widget; with no rect nothing is placed", async () => {
    const { b, zones } = bridge();
    const frames = gauge({ frames: [{ id: frameId("a"), name: "f0.png" }], min: 0, max: 100, animationSpeed: 0 });
    await dropLibraryItem(b, { id: frames.id, item: frames }, rect, { col: 1, row: 2 });
    expect(b.toast).toHaveBeenCalledWith("Image-sequence gauges go into a canvas zone");
    const g = gauge({ vector, min: 0, max: 100, animationSpeed: 0 });
    await dropLibraryItem(b, { id: g.id, item: g }, null, null);
    expect(b.toast).toHaveBeenCalledWith("No room there");
    expect(zones()).toHaveLength(1);
    expect(b.addCopy).not.toHaveBeenCalled();
  });

  it("a gauge with no usable data says so", async () => {
    const { b } = bridge();
    const g = gauge({ nothing: true });
    await dropLibraryItem(b, { id: g.id, item: g }, rect, { col: 1, row: 2 });
    expect(b.toast).toHaveBeenCalledWith("Ring has no gauge to place");
    expect(b.updateProfile).not.toHaveBeenCalled();
  });

  it("over a canvas zone a vector gauge is baked on drop: it arrives with its frames, not stale", async () => {
    const { b, after } = bridge();
    const g = gauge({ vector: { ...vector, width: 100, height: 100 }, min: 5, max: 50, animationSpeed: 2 });
    await dropLibraryItem(b, { id: g.id, item: g }, null, { col: 1, row: 1 }, { zoneId: "z1", fx: 0.5, fy: 0.5 });
    expect(b.setConfig).toHaveBeenCalledTimes(1);
    const open = openCanvas(JSON.parse(JSON.stringify(after().profiles[0].pages[0].placements[0].canvas!)));
    expect(open.items[0]).toMatchObject({ kind: "Gauge", Name: "Ring", X: 350, Y: 150, Width: 100, Height: 100, MinValue: 5, MaxValue: 50, AnimationSpeed: 2 });
    expect(b.addCopy).toHaveBeenCalledWith(g, expect.objectContaining({ zoneId: "z1", itemPath: "0" }));
    expect(baking.bakeForDrop).toHaveBeenCalledTimes(1);
    expect((open.items[0] as { Images: { FilePath: string }[] }).Images.map((i) => i.FilePath)).toEqual(["ring_0.png", "ring_1.png"]);
    expect(isStale(open.items[0])).toBe(false);
  });

  it("a failed bake aborts the drop: nothing is added, no copy, the error is toasted", async () => {
    baking.bakeForDrop.mockRejectedValueOnce(new Error("The dashboard server could not be reached."));
    const { b } = bridge();
    const g = gauge({ vector, min: 0, max: 100, animationSpeed: 0 });
    await dropLibraryItem(b, { id: g.id, item: g }, null, { col: 1, row: 1 }, { zoneId: "z1", fx: 0.5, fy: 0.5 });
    expect(b.setConfig).not.toHaveBeenCalled();
    expect(b.addCopy).not.toHaveBeenCalled();
    expect(b.toast).toHaveBeenCalledWith(expect.stringContaining("The dashboard server could not be reached."));
  });

  it("edits made to the canvas while baking are kept; a zone removed meanwhile takes nothing", async () => {
    const renamed = { ...canvas, source: { ...canvas.source, name: "Rig 2" } };
    const { b, after } = bridge();
    baking.bakeForDrop.mockImplementationOnce(async (g: VectorGauge) => {
      b.setConfig((c) => withCanvas(c, "z1", renamed));
      return bakedFrames(g);
    });
    const g = gauge({ vector, min: 0, max: 100, animationSpeed: 0 });
    await dropLibraryItem(b, { id: g.id, item: g }, null, { col: 1, row: 1 }, { zoneId: "z1", fx: 0.5, fy: 0.5 });
    const stored = after().profiles[0].pages[0].placements[0].canvas!;
    expect(stored.source.name).toBe("Rig 2");
    expect(openCanvas(JSON.parse(JSON.stringify(stored))).items).toHaveLength(1);

    const gone = bridge();
    baking.bakeForDrop.mockImplementationOnce(async (v: VectorGauge) => {
      gone.b.setConfig((c) => ({ ...c, profiles: [{ ...c.profiles[0], pages: [{ ...c.profiles[0].pages[0], placements: [] }] }] }));
      return bakedFrames(v);
    });
    await dropLibraryItem(gone.b, { id: g.id, item: g }, null, { col: 1, row: 1 }, { zoneId: "z1", fx: 0.5, fy: 0.5 });
    expect(gone.after().profiles[0].pages[0].placements).toHaveLength(0);
    expect(gone.b.addCopy).not.toHaveBeenCalled();
    expect(gone.b.toast).toHaveBeenCalledWith("The canvas zone is gone, so Ring wasn’t added");
  });

  it("the bake and the item are one undo step: one setConfig", async () => {
    const { b } = bridge();
    const g = gauge({ vector, min: 0, max: 100, animationSpeed: 0 });
    await dropLibraryItem(b, { id: g.id, item: g }, null, { col: 1, row: 1 }, { zoneId: "z1", fx: 0.5, fy: 0.5 });
    expect(b.setConfig).toHaveBeenCalledTimes(1);
  });

  it("a gauge that already has frames keeps them and is not baked again", async () => {
    const { b } = bridge();
    const g = gauge({ vector, frames: [{ id: frameId("a"), name: "f0.png" }], min: 0, max: 100, animationSpeed: 0 });
    await dropLibraryItem(b, { id: g.id, item: g }, null, { col: 1, row: 1 }, { zoneId: "z1", fx: 0.5, fy: 0.5 });
    expect(baking.bakeForDrop).not.toHaveBeenCalled();
  });

  it("on the grid a gauge with a spec and frames keeps its frames on the zone", async () => {
    const { b, zones } = bridge();
    const frames = [{ id: frameId("a"), name: "f0.png" }, { id: frameId("b"), name: "f1.png" }];
    const g = gauge({ vector, frames, min: 0, max: 100, animationSpeed: 0 });
    await dropLibraryItem(b, { id: g.id, item: g }, rect, { col: 1, row: 2 });
    const added = zones().find((z) => z.module === CUSTOM_GAUGE_ID)!;
    expect(JSON.parse(String(added.settings?.frames))).toEqual(frames);
  });

  it("over a canvas zone an image sequence adds its frames as the canvas's files", async () => {
    const { b, after } = bridge();
    const g = gauge({ frames: [{ id: frameId("a"), name: "f0.png" }, { id: frameId("b"), name: "f1.png" }], min: 0, max: 100, animationSpeed: 0 });
    await dropLibraryItem(b, { id: g.id, item: g }, null, { col: 1, row: 1 }, { zoneId: "z1", fx: 0.5, fy: 0.5 });
    const stored = after().profiles[0].pages[0].placements[0].canvas!;
    expect(stored.assets.map((a) => [a.name, a.hash, a.type, a.ext])).toEqual([["f0.png", "a".repeat(64), "png", "png"], ["f1.png", "b".repeat(64), "png", "png"]]);
    const open = openCanvas(JSON.parse(JSON.stringify(stored)));
    expect((open.items[0] as { Images: { FilePath: string }[] }).Images.map((i) => i.FilePath)).toEqual(["f0.png", "f1.png"]);
  });
});

import { describe, expect, it, vi } from "vitest";
import type { DashboardConfig, Placement, ProfileView } from "@/lib/layout";
import type { LibraryItem } from "@/lib/library";
import { openCanvas } from "@/lib/infopanel/canvas";
import { tableOf } from "@/lib/infopanel/assets/assets";
import { toStored } from "@/lib/infopanel/import/stored";
import { parseProfileXml } from "@/lib/infopanel/parse";
import { libraryDragKind, libraryDragOf, LIBRARY_MIME } from "@/lib/my-library/drag";
import type { StudioBridge } from "./library-actions";
import { dropLibraryItem, librarySizeOf, zoneAtCell } from "./library-drop";

const item = (over: Partial<LibraryItem>): LibraryItem =>
  ({ id: "lib_000000000001", kind: "image", name: "x", createdAt: "", updatedAt: "", files: ["a".repeat(64) + ".png"], meta: {}, copies: [], ...over }) as LibraryItem;
const grid = { cols: 6, rows: 4, width: 1200, height: 800 };

describe("library drops on the page", () => {
  it("sizes an image by its shape, a panel by its saved size, a style as one cell", () => {
    expect(librarySizeOf(item({ meta: { width: 1600, height: 400 } }), grid)).toEqual({ cols: 6, rows: 2 });
    expect(librarySizeOf(item({ kind: "panel", data: { colSpan: 3, rowSpan: 9 } }), grid)).toEqual({ cols: 3, rows: 4 });
    expect(librarySizeOf(item({ kind: "style" }), grid)).toEqual({ cols: 1, rows: 1 });
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

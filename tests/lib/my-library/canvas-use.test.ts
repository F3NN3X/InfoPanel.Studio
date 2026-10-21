import { describe, expect, it } from "vitest";
import { findCanvasUse } from "@/lib/my-library/canvas-use";
import { CANVAS_ID, defaultConfig, type DashboardConfig, type Placement } from "@/lib/layout";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";

const source = (name: string, importedAt: string) => ({ source: { name, origin: "file" as const, importedAt } });

const zone = (id: string, from?: ReturnType<typeof source>): Placement =>
  ({
    id,
    module: from ? CANVAS_ID : "SystemOverview",
    colStart: 1,
    rowStart: 1,
    colSpan: 1,
    rowSpan: 1,
    visible: true,
    ...(from ? { canvas: from as unknown as StoredCanvas } : {}),
  }) satisfies Placement;

const config = (): DashboardConfig => {
  const base = defaultConfig();
  const [first] = base.profiles;
  const page = first.pages[0];
  return {
    ...base,
    profiles: [
      { ...first, id: "a", pages: [{ ...page, id: "a1", placements: [zone("plain")] }] },
      {
        ...first,
        id: "b",
        pages: [
          { ...page, id: "b1", placements: [zone("other", source("Other", "t1"))] },
          { ...page, id: "b2", placements: [zone("first", source("Wall", "t2")), zone("second", source("Wall", "t2"))] },
        ],
      },
    ],
  };
};

describe("findCanvasUse", () => {
  it("finds the first zone made from the canvas, with its screen and page", () => {
    expect(findCanvasUse(config(), source("Wall", "t2"))).toEqual({ profileId: "b", pageId: "b2", zoneId: "first" });
  });

  it("tells two imports of the same file apart by when they were made", () => {
    expect(findCanvasUse(config(), source("Wall", "t3"))).toBeUndefined();
  });

  it("is undefined for an unused canvas", () => {
    expect(findCanvasUse(config(), source("Unused", "t1"))).toBeUndefined();
  });
});

import { describe, expect, it, vi } from "vitest";
import { PANEL_ID, type DashboardConfig, type Placement, type ProfileView } from "@/lib/layout";
import type { LibraryItem } from "@/lib/library";
import { applyStyle, imagePanel, useForSelection, useForSelectionBlocked, type StudioBridge } from "./library-actions";
import { dropLibraryItem } from "./library-drop";

const grid = { cols: 6, rows: 4, width: 1200, height: 800 };
const item = (over: Partial<LibraryItem>): LibraryItem =>
  ({ id: "lib_000000000001", kind: "image", name: "x", createdAt: "", updatedAt: "", files: [], meta: {}, copies: [], ...over }) as LibraryItem;

function bridge(placements: Placement[], selection: Placement[] = []) {
  let view = { placements, pageId: "pg", cols: 6, rows: 4, width: 1200, height: 800 } as unknown as ProfileView;
  const b = {
    config: {} as DashboardConfig,
    get profile() {
      return view;
    },
    profileId: "p",
    setConfig: vi.fn(),
    updateProfile: vi.fn((fn: (p: ProfileView) => ProfileView) => {
      view = fn(view);
    }),
    selection,
    select: vi.fn(),
    toast: vi.fn(),
    addCopy: vi.fn(),
  };
  return { b: b as unknown as StudioBridge & typeof b, zones: () => view.placements };
}

describe("library style drops (G16)", () => {
  const panel = imagePanel("Pic", "/api/assets/a.png", {}, grid).make();
  const zone = (id: string, over: Partial<Placement> = {}) =>
    ({ id, module: PANEL_ID, panel, colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true, settings: { label: "keep" }, ...over }) as Placement;
  const preset = item({ kind: "style", name: "Neon", data: { id: "s1", name: "Neon", settings: { accent: "#ff00ff" } } });

  it("a saved style dropped on a zone styles that zone only, keeps its content, counts one copy", async () => {
    const { b, zones } = bridge([zone("a"), zone("b", { colStart: 3 })]);
    await dropLibraryItem(b, { id: preset.id, item: preset }, null, { col: 1, row: 1 });
    expect(zones()[0].settings).toEqual({ label: "keep", accent: "#ff00ff" });
    expect(zones()[1].settings).toEqual({ label: "keep" });
    expect(b.updateProfile).toHaveBeenCalledTimes(1);
    expect(b.addCopy).toHaveBeenCalledWith(preset, expect.objectContaining({ profileId: "p", zoneId: "a", label: "Neon style" }));
    expect(b.toast).toHaveBeenCalledWith("Applied Neon to the widget");
  });

  it("a style dropped on empty cells changes nothing and says so", async () => {
    const { b, zones } = bridge([zone("a")]);
    await dropLibraryItem(b, { id: preset.id, item: preset }, null, { col: 5, row: 3 });
    expect(b.updateProfile).not.toHaveBeenCalled();
    expect(zones()[0].settings).toEqual({ label: "keep" });
    expect(b.toast).toHaveBeenCalledWith("Drop a style on a widget");
  });

  it("Apply to selection styles every selected zone", async () => {
    const a = zone("a");
    const c = zone("c", { colStart: 3 });
    const { b, zones } = bridge([a, c], [a, c]);
    await applyStyle(b, preset);
    expect(zones().map((z) => z.settings?.accent)).toEqual(["#ff00ff", "#ff00ff"]);
    expect(b.addCopy).toHaveBeenCalledTimes(2);
  });
});

describe("Use for selection (G10)", () => {
  const imageZone = { id: "a", module: PANEL_ID, panel: imagePanel("Pic", "/old.png", {}, grid).make() } as Placement;
  const textZone = { id: "t", module: PANEL_ID, panel: { ...imagePanel("T", "", {}, grid).make(), widgets: [] } } as unknown as Placement;

  it("is blocked, with the reason, unless a selected zone draws an image", () => {
    expect(useForSelectionBlocked([])).toBe("Select an image widget on the canvas first");
    expect(useForSelectionBlocked([textZone])).toBe("The selected widget doesn’t show an image");
    expect(useForSelectionBlocked([imageZone])).toBeUndefined();
  });

  it("sets the picture of the selected image zones only", () => {
    const { b, zones } = bridge([imageZone, textZone], [imageZone, textZone]);
    useForSelection(b, "fan.png", "/api/assets/new.png");
    expect(zones()[0].panel!.widgets[0].text).toBe("/api/assets/new.png");
    expect(zones()[1]).toBe(textZone);
    expect(b.toast).toHaveBeenCalledWith("fan.png is the picture of the widget");
  });
});

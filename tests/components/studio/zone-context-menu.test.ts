// Right-click on a widget on the canvas opens the layer menu (Edit v3 DECISIONS after phase 4): the zone menu's rows the
// layer menu lacks go under it, its own (Duplicate, Hide, Delete) once only, and no separator leads, trails or doubles.
import { describe, expect, it, vi } from "vitest";
import { layerMenuEntries } from "@/components/studio/layer-menu";
import { zoneMenuExtras } from "@/components/studio/zone-context-menu";
import type { StudioSelection } from "@/components/studio/use-studio-selection";
import type { ContextMenuEntry } from "@/components/ui/context-menu";
import type { Placement } from "@/lib/layout";
import type { LayerAction } from "@/lib/page-model/layer-actions";

const zone: Placement = { id: "w", module: "Weather", colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 1, visible: true };
const sel = { selected: zone, selection: [zone] } as unknown as StudioSelection;
const deps = { sel, canPasteStyle: false, canStep: () => true, canArrange: () => true, otherPages: [{ id: "p2", name: "Two" }], onRun: vi.fn() };
const ids = (entries: ContextMenuEntry[]) => entries.map((e) => (e === "separator" ? "|" : e.id));

describe("A widget's layer menu", () => {
  it("adds the zone menu's other rows, none the layer menu has", () => {
    const extra = ids(zoneMenuExtras(deps));
    expect(extra).toContain("pick");
    expect(extra).toContain("move-to-page");
    expect(extra).toContain("narrower");
    expect(extra).toContain("deselect");
    for (const own of ["duplicate", "visible", "remove"]) expect(extra).not.toContain(own);
    expect(extra[0]).not.toBe("|");
    expect(extra.at(-1)).not.toBe("|");
    expect(extra.join(",")).not.toContain("|,|");
  });

  it("keeps the layer menu's own rows first, in their order", () => {
    const available = Object.fromEntries(["front", "forward", "backward", "back", "group", "ungroup", "snap", "lock", "hide", "duplicate", "delete"].map((a) => [a, true])) as Record<LayerAction, boolean>;
    const own = ids(layerMenuEntries({ available, groups: [], run: vi.fn(), moveToGroup: vi.fn() }));
    expect(own.slice(0, 4)).toEqual(["front", "forward", "backward", "back"]);
    expect(own.at(-1)).toBe("delete");
  });

  it("is empty with no widget selected", () => {
    expect(zoneMenuExtras({ ...deps, sel: { selected: null, selection: [] } as unknown as StudioSelection })).toEqual([]);
  });
});

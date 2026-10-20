import { describe, expect, it, vi } from "vitest";
import type { ContextMenuEntry } from "@/components/ui/context-menu";
import type { LibraryItem } from "@/lib/library";
import { libraryGauges, presetGauges, type GaugeEntry } from "@/lib/gauge-studio/model";
import { gaugeActions, gaugeMenuEntries, libraryMenuHandlers } from "./gauge-actions";

const handlers = (canvasZones: { id: string; name: string }[] = []) => ({
  canvasZones,
  onEdit: vi.fn(),
  onAddToCanvas: vi.fn(),
  onAddToZone: vi.fn(),
  onDuplicate: vi.fn(),
  onExport: vi.fn(),
});
const rows = (entries: ContextMenuEntry[]) => entries.map((e) => (e === "separator" ? "---" : e.label));
const row = (entries: ContextMenuEntry[], label: string) => entries.find((e) => e !== "separator" && e.label === label) as Exclude<ContextMenuEntry, "separator">;

const [preset] = presetGauges();
const item = { id: "g1", kind: "gauge", name: "Mine", files: [], meta: {}, copies: [], data: { vector: preset.gauge, min: 0, max: 100, animationSpeed: 0 } } as unknown as LibraryItem;
const [mine] = libraryGauges([item]);
/** An image sequence from a canvas whose frames the asset store lacks. */
const sequence = { ...preset, gauge: null, frames: undefined, files: undefined, source: { kind: "canvas" } } as unknown as GaugeEntry;

describe("gauge card menu", () => {
  const page = (entry: GaugeEntry, it: LibraryItem | undefined) =>
    gaugeMenuEntries(gaugeActions(entry, handlers()), libraryMenuHandlers(it, { onRename: vi.fn(), onDelete: vi.fn() }));

  it("offers Rename and Delete for a library gauge", () => {
    const entries = page(mine, item);
    expect(rows(entries)).toEqual(["Open in editor", "Add to canvas", "Duplicate", "Export", "---", "Rename", "Delete from library…"]);
    expect(row(entries, "Delete from library…")).toMatchObject({ danger: true, hint: "Del" });
    for (const label of ["Open in editor", "Add to canvas", "Duplicate", "Export"]) expect(row(entries, label).disabled).toBeFalsy();
  });

  it("leaves Rename and Delete out for a preset, which has no library item", () => {
    expect(rows(page(preset, undefined))).toEqual(["Open in editor", "Add to canvas", "Duplicate", "Export"]);
  });

  it("disables Add to canvas, Duplicate and Export for a sequence the store cannot serve", () => {
    const entries = gaugeMenuEntries(gaugeActions(sequence, handlers()), {});
    for (const label of ["Add to canvas", "Duplicate", "Export"]) expect(row(entries, label).disabled).toBe(true);
    expect(row(entries, "Open in editor").disabled).toBeFalsy();
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { presetGauges } from "@/lib/gauge-studio/model";
import { activeLibraryDrag, libraryDragKind, libraryDragOf, LIBRARY_MIME, setActiveLibraryDrag } from "@/lib/my-library/drag";
import { draggableGauge, gaugeDragItem, startGaugeDrag } from "./gauge-drag";

/** A DataTransfer stand-in that keeps what is set. */
function transfer() {
  const data = new Map<string, string>();
  const dt = { setData: (t: string, v: string) => void data.set(t, v), getData: (t: string) => data.get(t) ?? "", effectAllowed: "" } as unknown as DataTransfer;
  return { dt, data };
}

afterEach(() => setActiveLibraryDrag(null));

describe("dragging a gauge card", () => {
  const preset = presetGauges()[0];

  it("carries the library payload and kind of a Library card, with the gauge as a transient item", () => {
    const { dt, data } = transfer();
    startGaugeDrag(dt, preset);
    expect(libraryDragOf((t) => data.get(t) ?? "")).toEqual({ libraryItemId: `cfg-gauge:${preset.key}`, kind: "gauge" });
    expect(libraryDragKind([...data.keys()])).toBe("gauge");
    expect(data.has(LIBRARY_MIME)).toBe(true);
    const active = activeLibraryDrag()!;
    expect(active).toMatchObject({ kind: "gauge", name: preset.name, copies: [] });
    expect(active.data).toMatchObject({ vector: preset.gauge, min: preset.min, max: preset.max });
  });

  it("drags a library gauge as its own item", () => {
    const item = { ...gaugeDragItem(preset), id: "lib_1" };
    const { dt, data } = transfer();
    startGaugeDrag(dt, preset, item);
    expect(libraryDragOf((t) => data.get(t) ?? "")?.libraryItemId).toBe("lib_1");
    expect(activeLibraryDrag()).toBe(item);
  });

  it("is draggable with a spec or stored frames, not with neither", () => {
    expect(draggableGauge(preset)).toBe(true);
    expect(draggableGauge({ ...preset, gauge: null, files: [{ id: `${"a".repeat(64)}.png`, name: "1.png" }] })).toBe(true);
    expect(draggableGauge({ ...preset, gauge: null })).toBe(false);
  });
});

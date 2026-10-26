// @vitest-environment happy-dom
// The kiosk and the editor draw a Studio widget item (one-editor SPEC §9): the registry widget at its box, in the
// zone frame, from the canvas zone's values; one this build doesn't have shows a grey box (§11).
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { modules } from "@/modules";
import type { SensorMap } from "@/modules/types";
import { nativeLayer } from "@/components/infopanel/native";
import { widgetDrawer } from "@/components/infopanel/CanvasZone";
import { sameValues } from "@/components/infopanel/widget-item-view";
import { newWidgetItem } from "@/lib/infopanel/native/widget-item";
import { newItem } from "@/lib/infopanel/editor/create";
import { newStored, readStored } from "@/lib/infopanel/import/stored";

const { profile } = readStored(newStored({ name: "Arc", width: 800, height: 480 }));
const ctx = { fontScale: 1.33, keyOf: () => null, assetUrl: () => null };
const view = (sensors: SensorMap) => ({ font: {} as never, now: new Date("2026-10-26T12:00:00Z"), history: () => [], widget: widgetDrawer(sensors) });

describe("a widget item in the native layer", () => {
  it("is drawn at its box without throwing, and left out of InfoPanel's scene", async () => {
    await Promise.all(modules.filter((m) => m.id === "Clock" || m.id === "SystemOverview").map((m) => m.preload?.()));
    const items = [
      newItem("Text", profile),
      newWidgetItem({ module: "Clock" }, { x: 40, y: 60, w: 300, h: 150 }, "Clock"),
      newWidgetItem({ module: "SystemOverview" }, { x: 0, y: 200, w: 400, h: 200 }, "System"),
      newWidgetItem({ module: "FutureWidget" }, { x: 500, y: 0, w: 200, h: 100 }, "Future"),
    ];
    const layer = nativeLayer(items, ctx, {}, view({}));
    expect([...layer.hidden]).toEqual(["1", "2", "3"]);
    const { container } = render(<div>{[...layer.elements.values()]}</div>);
    const clock = container.querySelector<HTMLElement>('[data-widget-item="1"]')!;
    expect(clock.style.left).toBe("40px");
    expect(clock.style.width).toBe("300px");
    expect(container.querySelector('[data-widget-item="3"]')?.textContent).toBe("Widget not available in this version");
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it("without a drawer (an older view of the canvas) stays the empty Image it is to InfoPanel", () => {
    const layer = nativeLayer([newWidgetItem({ module: "Clock" }, { x: 0, y: 0, w: 10, h: 10 }, "Clock")], ctx, {}, { ...view({}), widget: undefined });
    expect(layer.elements.size).toBe(0);
  });
});

describe("a widget item re-renders only for its own values", () => {
  it("compares the values under its keys", () => {
    const a = { "cpu.load": { value: 1 }, "gpu.load": { value: 2 } } as unknown as SensorMap;
    expect(sameValues(a, { ...a, "gpu.load": { value: 3 } } as unknown as SensorMap, ["cpu"])).toBe(true);
    expect(sameValues(a, { ...a, "cpu.load": { value: 3 } } as unknown as SensorMap, ["cpu"])).toBe(false);
    expect(sameValues(a, { "gpu.load": a["gpu.load"] } as unknown as SensorMap, ["cpu"])).toBe(false);
    expect(sameValues(a, { ...a }, null)).toBe(false);
    expect(sameValues(a, a, null)).toBe(true);
  });
});

// @vitest-environment happy-dom
// The kiosk and the editor draw a Studio widget item (one-editor SPEC §9): the registry widget at its box, in the
// zone frame, from the canvas zone's values; one this build doesn't have shows a grey box (§11).
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { modules } from "@/modules";
import type { SensorMap } from "@/modules/types";
import { nativeLayer } from "@/components/infopanel/native";
import CanvasZone, { widgetDrawer } from "@/components/infopanel/CanvasZone";
import { storeItems } from "@/lib/infopanel/canvas-edit";
import { sameValues } from "@/components/infopanel/widget-item-view";
import { newWidgetItem } from "@/lib/infopanel/native/widget-item";
import { newItem } from "@/lib/infopanel/editor/create";
import { newStored, readStored } from "@/lib/infopanel/import/stored";

// happy-dom lays nothing out: the canvas zone gets a kiosk-sized box.
vi.mock("@/hooks/use-element-size", async () => {
  const { useRef } = await import("react");
  return { useElementSize: () => ({ ref: useRef(null), w: 800, h: 480 }) };
});

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

// Sign-off round 1: Weather on an imported page drew an empty box in Edit. With no live data the frame left it out, as
// the kiosk does; the editor now draws the grid editor's stand-in, and with values the widget itself.
describe("a widget item on a canvas page", () => {
  const WEATHER = {
    "plugins.yr-weather-plugin.oslo.temp": { value: 18, unit: "°C" },
    "plugins.yr-weather-plugin.oslo.feels_like": { value: 16, unit: "°C" },
    "plugins.yr-weather-plugin.oslo.name": { value: "Oslo", unit: "" },
    "plugins.yr-weather-plugin.oslo.weather_desc": { value: "Cloudy", unit: "" },
  } as unknown as SensorMap;
  const weather = () => newWidgetItem({ module: "Weather", cell: { col: 7, row: 5, cols: 2, rows: 1 } }, { x: 600, y: 384, w: 200, h: 96 }, "Weather");
  const draw = (sensors: SensorMap, editing: boolean) => {
    const layer = nativeLayer([weather()], ctx, sensors, { ...view(sensors), widget: widgetDrawer(sensors, undefined, editing, editing) });
    return render(<div>{[...layer.elements.values()]}</div>).container.querySelector<HTMLElement>('[data-widget-item="0"]')!;
  };

  it("in Edit with no live data yet: the stand-in at its box, never an empty box", () => {
    const box = draw({}, true);
    expect(box.style.left).toBe("600px");
    expect(box.textContent).toContain("Weather");
    expect(box.textContent).toContain("no live data yet");
  });

  it("in the kiosk with no live data: left out, as a grid zone is", () => {
    expect(draw({}, false).textContent).toBe("");
  });

  it("with live values: the Weather renderer mounts, in Edit and in the kiosk", async () => {
    await modules.find((m) => m.id === "Weather")?.preload?.();
    for (const editing of [true, false]) {
      const box = draw(WEATHER, editing);
      await waitFor(() => expect(box.textContent).toContain("18°"));
      expect(box.textContent).not.toContain("no live data yet");
    }
  });
});

// The kiosk's canvas zone draws a widget item through the same drawer: Weather on a canvas page, with its live values.
describe("the kiosk's canvas zone", () => {
  it("mounts the widget item's renderer at its box", async () => {
    await modules.find((m) => m.id === "Weather")?.preload?.();
    const base = newStored({ name: "Neon", width: 800, height: 480 });
    const canvas = storeItems(base, readStored(base).profile, [newWidgetItem({ module: "Weather" }, { x: 600, y: 384, w: 200, h: 96 }, "Weather")]);
    const sensors = {
      "plugins.yr-weather-plugin.oslo.temp": { value: 18, unit: "°C" },
      "plugins.yr-weather-plugin.oslo.name": { value: "Oslo", unit: "" },
    } as unknown as SensorMap;
    const { container } = render(<CanvasZone canvas={canvas} sensors={sensors} />);
    const box = await waitFor(() => container.querySelector<HTMLElement>('[data-widget-item="0"]')!);
    expect(box.style.left).toBe("600px");
    await waitFor(() => expect(box.textContent).toContain("18°"));
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

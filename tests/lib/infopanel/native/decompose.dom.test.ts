// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { defaultPalette } from "../../../../src/lib/infopanel/elements/palette.ts";
import { cssToArgb, decompose, hideTagged, readTagged, shownAs } from "../../../../src/lib/infopanel/native/decompose.ts";
import { fontSizeOf, type ConvertContext } from "../../../../src/lib/infopanel/native/items.ts";
import { createElement } from "react";
import { IpTagCtx } from "../../../../src/widgets/core/primitives.tsx";
import { TEMPLATE_MODULES } from "../../../../src/widgets/registry.ts";
import { fixtureSensors } from "../../../../src/widgets/__fixtures__/index.ts";

const look = { Font: "Segoe UI", FontSize: 20, Color: "#FFFFFFFF", BackgroundColor: "#FF101010" };
const ctx = (): ConvertContext => ({
  look,
  palette: defaultPalette(look),
  notes: [],
  sensors: { "libre.cpu_total": { value: 7, name: "CPU Total", unit: "%", ref: "libre:/amdcpu/0/load/0" }, "system.bridge.time": { text: "x" } },
});

/** A zone with tagged nodes at known boxes (happy-dom has no layout). */
function zone() {
  const root = document.createElement("div");
  root.innerHTML = `
    <span data-ip-key="libre.cpu_total" data-ip-kind="value" data-ip-unit="%" data-ip-decimals="1" style="font-size:36px;font-weight:700;color:rgb(255, 0, 0)">7</span>
    <div data-ip-key="libre.cpu_total" data-ip-kind="bar" data-ip-max="80"></div>
    <span data-ip-key="system.bridge.time" data-ip-kind="value">x</span>
    <span data-ip-key="gone" data-ip-kind="value">hidden</span>
    <span data-ip-key="other" data-ip-kind="nonsense">?</span>
    <p>chrome</p>`;
  document.body.append(root);
  const boxes = [[10, 20, 50, 40], [10, 70, 200, 8], [0, 0, 30, 10], [0, 0, 0, 0], [0, 0, 5, 5]];
  const nodes = [...root.querySelectorAll("[data-ip-key]")];
  nodes.forEach((n, i) => {
    const [left, top, width, height] = boxes[i];
    n.getBoundingClientRect = () => ({ left: 100 + left, top: 200 + top, width, height }) as DOMRect;
  });
  root.getBoundingClientRect = () => ({ left: 100, top: 200, width: 300, height: 100 }) as DOMRect;
  return root;
}

describe("readTagged", () => {
  it("reads each visible, known tagged node with its box on the zone, font and colour", () => {
    const tagged = readTagged(zone());
    expect(tagged.map((t) => t.kind)).toEqual(["value", "bar", "value"]);
    expect(tagged[0]).toMatchObject({ key: "libre.cpu_total", box: { x: 10, y: 20, w: 50, h: 40 }, fontSize: 36, unit: "%", decimals: 1, bold: true });
    expect(tagged[1].max).toBe(80);
  });

  it("divides the boxes by the studio canvas zoom", () => {
    expect(readTagged(zone(), 2)[0].box).toEqual({ x: 5, y: 10, w: 25, h: 20 });
  });
});

describe("decompose", () => {
  it("makes a bound native item at each tagged box, placed on the screen", () => {
    const c = ctx();
    const items = decompose(zone(), { x: 1000, y: 500, w: 300, h: 100 }, c);
    expect(items[0]).toMatchObject({ kind: "Sensor", X: 1010, Y: 520, LibreSensorId: "/amdcpu/0/load/0", Precision: 1, Unit: "%", Bold: true, Color: "#FFFF0000" });
    expect(items[1]).toMatchObject({ kind: "Bar", MaxValue: 80, X: 1010, Y: 570 });
    // A pushed key with no InfoPanel reading stays a placeholder, and the report says so.
    expect(items[2]).toMatchObject({ kind: "Sensor", SensorName: "" });
    expect(c.notes.some((n) => n.text.includes("not bound"))).toBe(true);
  });

  it("hides the tagged nodes in the picture and leaves the rest", () => {
    const root = zone();
    const clone = root.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("*").forEach(hideTagged);
    const hidden = [...clone.querySelectorAll<HTMLElement>("[data-ip-key]")].every((n) => n.style.visibility === "hidden");
    expect(hidden).toBe(true);
    expect(clone.querySelector<HTMLElement>("p")!.style.visibility).toBe("");
  });
});

describe("a value's item and the picture under it", () => {
  /** A widget with one tagged number at a fractional box, and a ring whose value arc is tagged. */
  function widget() {
    const root = document.createElement("div");
    root.innerHTML = `
      <span data-ip-key="libre.cpu_total" data-ip-kind="value" style="font-size:24px;font-weight:600;color:rgb(52, 211, 153)">63°C</span>
      <svg viewBox="0 0 100 100"><circle r="45" stroke="#333"></circle><circle data-ip-key="libre.cpu_total" data-ip-kind="ring" r="45" stroke-width="10"></circle></svg>
      <p>Temp</p>`;
    document.body.append(root);
    root.getBoundingClientRect = () => ({ left: 50, top: 60, width: 400, height: 200, right: 450, bottom: 260 }) as DOMRect;
    const value = root.querySelector<HTMLElement>("span")!;
    value.getBoundingClientRect = () => ({ left: 80.4, top: 92.6, width: 44.2, height: 31.9, right: 124.6, bottom: 124.5 }) as DOMRect;
    const arc = root.querySelector<SVGElement>("[data-ip-kind=ring]")!;
    arc.getBoundingClientRect = () => ({ left: 60, top: 70, width: 90, height: 90, right: 150, bottom: 160 }) as DOMRect;
    return root;
  }

  it("puts the value at the node's box, in its font size and colour, with the precision and unit it shows", () => {
    const [item] = decompose(widget(), { x: 0, y: 0, w: 400, h: 200 }, ctx());
    expect(item.kind).toBe("Sensor");
    const s = item as unknown as Record<string, unknown>;
    expect(Math.abs((s.X as number) - 30.4)).toBeLessThanOrEqual(1);
    expect(Math.abs((s.Y as number) - 32.6)).toBeLessThanOrEqual(1);
    // InfoPanel draws FontSize × the profile's 1.33 px.
    expect(s.FontSize).toBe(fontSizeOf(24));
    expect(s).toMatchObject({ Color: "#FF34D399", Bold: true, OverridePrecision: true, Precision: 0, OverrideUnit: true, Unit: "°C", ShowUnit: true, LibreSensorId: "/amdcpu/0/load/0" });
  });

  it("takes the picture with the value and the ring's arc hidden, and its track and labels kept", () => {
    const clone = widget().cloneNode(true) as HTMLElement;
    clone.querySelectorAll("*").forEach(hideTagged);
    expect(clone.querySelector<HTMLElement>("span")!.style.visibility).toBe("hidden");
    expect(clone.querySelector<SVGElement>("[data-ip-kind=ring]")!.style.visibility).toBe("hidden");
    expect(clone.querySelector<SVGElement>("circle")!.style.visibility).toBe("");
    expect(clone.querySelector<HTMLElement>("p")!.style.visibility).toBe("");
  });

  it("makes the ring's arc a gauge over the stroke's full box, with no track of its own", () => {
    const items = decompose(widget(), { x: 0, y: 0, w: 400, h: 200 }, ctx());
    const gauge = items[1] as unknown as { kind: string; X: number; Width: number; vector: { track: unknown; thickness: number } };
    expect(gauge.kind).toBe("Gauge");
    expect(gauge.vector.track).toBeNull();
    // The arc's box grows by half the stroke each side (happy-dom has no svg layout: the stroke is read at scale 1).
    expect(gauge.X).toBe(5);
    expect(gauge.Width).toBe(100);
  });
});

describe("shownAs", () => {
  it.each([
    ["63°C", { decimals: 0, unit: "°C" }],
    ["1.87 GHz", { decimals: 2, unit: " GHz" }],
    ["2,307 MHz", { decimals: 0, unit: " MHz", thousands: true }],
    ["95%", { decimals: 0, unit: "%" }],
    ["12", { decimals: 0, unit: "" }],
  ])("reads %s", (text, want) => {
    expect(shownAs(text)).toEqual(want);
  });
});

describe("cssToArgb", () => {
  it("reads rgb and rgba", () => {
    expect(cssToArgb("rgb(255, 0, 0)")).toBe("#FFFF0000");
    expect(cssToArgb("rgba(0, 0, 255, 0.5)")).toBe("#800000FF");
  });
});

describe("tagged widgets", () => {
  it.each(["CpuMonitor", "GpuMonitor", "MemoryUsage"])("%s tags the values it shows with their Data API keys", (id) => {
    const mod = TEMPLATE_MODULES.find((m) => m.id === id)!;
    const render = (on: boolean) => renderToStaticMarkup(createElement(IpTagCtx.Provider, { value: on }, mod.render(fixtureSensors(), {}) as never));
    // The kiosk and the previews draw without the tags.
    expect(render(false)).not.toContain("data-ip-key");
    const html = render(true);
    const keys = [...html.matchAll(/data-ip-key="([^"]+)"/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((k) => k.startsWith("libre."))).toBe(true);
  });

  it.each(["StatusBar", "SystemOverview", "GpuRings", "CoreHeatmap", "AudioMeter", "Weather"])("%s tags its values on the studio canvas only", (id) => {
    const mod = TEMPLATE_MODULES.find((m) => m.id === id)!;
    const render = (on: boolean) => renderToStaticMarkup(createElement(IpTagCtx.Provider, { value: on }, mod.render(fixtureSensors(), {}) as never));
    expect(render(false)).not.toContain("data-ip-key");
    expect(render(true)).toContain("data-ip-key");
  });
});

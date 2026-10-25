// @vitest-environment happy-dom
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { defaultPalette } from "../../../../src/lib/infopanel/elements/palette.ts";
import { cssToArgb, decompose, hideTagged, readTagged } from "../../../../src/lib/infopanel/native/decompose.ts";
import type { ConvertContext } from "../../../../src/lib/infopanel/native/items.ts";
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
});

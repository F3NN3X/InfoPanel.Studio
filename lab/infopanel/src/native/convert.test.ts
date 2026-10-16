import { describe, expect, it } from "vitest";
import { parseDisplayItemsXml } from "../parse.ts";
import { convert, hexColor, type ConvertContext } from "./convert.ts";

const one = (type: string, fields: Record<string, string | number | boolean> = {}) =>
  parseDisplayItemsXml(
    `<ArrayOfDisplayItem xmlns:xsi="x"><DisplayItem xsi:type="${type}DisplayItem">${Object.entries(fields)
      .map(([k, v]) => `<${k}>${v}</${k}>`)
      .join("")}</DisplayItem></ArrayOfDisplayItem>`,
  ).items[0];

const ctx: ConvertContext = { fontScale: 1.5, keyOf: () => "libre.cpu_total", assetUrl: (n) => `/corpus/p/assets/${n}` };
const widgetOf = (type: string, fields: Record<string, string | number | boolean> = {}) => {
  const c = convert(one(type, fields), "w1", ctx);
  if (!c.ok) throw new Error(c.reason);
  return c.native;
};

describe("convert", () => {
  it("makes a sensor a value widget with its key, decimals, scale and scaled font", () => {
    const n = widgetOf("Sensor", {
      X: 10, Y: 20, FontSize: 20, Color: "#FF00FF00", OverridePrecision: true, Precision: 1,
      MultiplicationModifier: 1000, DivisionToggle: true, Threshold1: 50, CenterAlign: true, SensorType: "Libre", LibreSensorId: "/x",
    });
    expect(n.widget).toMatchObject({ id: "w1", kind: "value", sensor: "libre.cpu_total", decimals: 1, scale: 0.001, fontSize: 30, color: "#00FF00", align: "center", visible: true });
    expect(n.box).toEqual({ x: 10, y: 20 });
    expect(n.lost).toContain("threshold colours");
  });

  it("keeps text, upper-cased as InfoPanel shows it, and sizes from the item", () => {
    const n = widgetOf("Text", { Name: "Cpu", Uppercase: true, Width: 120, Height: 30, RightAlign: true });
    expect(n.widget).toMatchObject({ kind: "text", text: "CPU", align: "right" });
    expect(n.box).toEqual({ x: 100, y: 100, w: 120, h: 30 });
  });

  it("maps charts, clocks, tables, images and plain shapes", () => {
    expect(widgetOf("Bar", { MaxValue: 200, Width: 300, Height: 12 })).toMatchObject({ widget: { kind: "bar", max: 200 }, box: { w: 300, h: 12 } });
    expect(widgetOf("Graph", { Width: 400, Step: 4 }).widget).toMatchObject({ kind: "sparkline", history: 100 });
    expect(widgetOf("Calendar").widget).toMatchObject({ kind: "clock", clock: "date" });
    expect(widgetOf("TableSensor", { TableFormat: "0:150|1:100", MaxRows: 5 }).widget).toMatchObject({ kind: "table", columns: 2, rows: 5 });
    expect(widgetOf("Image", { FilePath: "logo.png", RelativePath: true, Width: 200, Height: 100, Scale: 50 })).toMatchObject({
      widget: { kind: "image", text: "/corpus/p/assets/logo.png", height: 50 },
      box: { w: 100, h: 50 },
    });
    expect(widgetOf("Shape", { ShowGradient: false, Type: "Ellipse", Width: 40, Height: 40, FillColor: "#FF112233" }).widget).toMatchObject({
      kind: "shape", shape: "circle", thickness: 40, color: "#112233",
    });
  });

  it("leaves in InfoPanel mode what no widget draws, saying why", () => {
    const why = (type: string, fields: Record<string, string | number | boolean> = {}) => {
      const c = convert(one(type, fields), "w", ctx);
      return c.ok ? null : c.reason;
    };
    expect(why("Text", { Rotation: 90 })).toMatch(/^rotated/);
    expect(why("Text", { Marquee: true })).toMatch(/^marquee/);
    expect(why("Sensor", { GlowEnabled: true })).toMatch(/^glow/);
    expect(why("Shape")).toMatch(/gradient/); // ShowGradient defaults to true
    expect(why("Shape", { ShowGradient: false, Type: "Star" })).toMatch(/star shape/);
    expect(why("Gauge")).toMatch(/image-sequence/);
    expect(why("Donut")).toMatch(/donut/);
    expect(why("Group")).toMatch(/item by item/);
    expect(why("Image", { Type: "RTSP" })).toMatch(/RTSP/);
    expect(why("Bar", { Width: 20, Height: 150 })).toMatch(/vertical bar/);
    expect(why("Image", { FilePath: "bg.png", RelativePath: true })).toMatch(/natural size/);
  });

  it("drops the alpha of .NET colours", () => {
    expect([hexColor("#80FF0000"), hexColor("#00FF00"), hexColor("red")]).toEqual(["#FF0000", "#00FF00", undefined]);
  });
});

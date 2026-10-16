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
    // Drawn meanwhile in InfoPanel's font, size and format (thresholds included), which the value widget lacks.
    expect(n.lost).toEqual([]);
    expect(n.needs).toEqual(["text font and style", "InfoPanel value format (name, unit, precision, thresholds)"]);
    expect(n.custom).toMatchObject({ kind: "text", style: { size: 30, color: "#FF00FF00" }, width: 0, align: "center" });
  });

  it("keeps text as InfoPanel shows it (Uppercase is for clocks and dates), in its font, sized from the item", () => {
    const n = widgetOf("Text", { Name: "Cpu", Uppercase: true, Width: 120, Height: 30, RightAlign: true, Font: "Barlow", FontStyle: "Medium", Bold: true, Underline: true });
    expect(n.widget).toMatchObject({ kind: "text", text: "Cpu", align: "right" });
    expect(n.box).toEqual({ x: 100, y: 100, w: 120, h: 30 });
    expect(n.custom).toMatchObject({ kind: "text", width: 120, align: "right", style: { font: { font: "Barlow", style: "Medium", bold: true }, underline: true } });
    expect(n.needs).toEqual(["text font and style"]);
  });

  it("ends right-aligned text without a Width at X, as InfoPanel draws it", () => {
    expect(widgetOf("Text", { X: 50, Y: 20, RightAlign: true }).box).toEqual({ x: 50, y: 20, anchor: "end" });
    // Centred without a Width starts at X.
    expect(widgetOf("Text", { X: 50, Y: 20, RightAlign: true, CenterAlign: true }).box).toEqual({ x: 50, y: 20 });
    expect(widgetOf("Clock", { Format: "HH:mm" })).toMatchObject({ widget: { kind: "clock" }, custom: { kind: "text" }, needs: ["text font and style", "date and time format"] });
    // A table keeps its X and lays out its own columns.
    expect(widgetOf("TableSensor", { X: 30, Y: 40, RightAlign: true, TableFormat: "0:100|1:50", FontSize: 12 })).toMatchObject({
      box: { x: 30, y: 40 }, lost: [], custom: { kind: "text", item: { kind: "TableSensor" }, style: { size: 18 } },
      needs: ["text font and style", "InfoPanel table layout (column widths, headers)"],
    });
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
    expect(why("Sensor", { GlowEnabled: true })).toMatch(/^glow/);
    expect(why("Shape")).toMatch(/gradient/); // ShowGradient defaults to true
    expect(why("Gauge")).toMatch(/without frames/);
    expect(why("Group")).toMatch(/item by item/);
    expect(why("Image", { Type: "RTSP" })).toMatch(/RTSP/);
    // No size, and the file's own size is not known.
    expect(why("Image", { FilePath: "bg.png", RelativePath: true })).toMatch(/natural size/);
    expect(why("SensorImage")).toMatch(/thresholds/);
  });

  it("turns and flips an item about its box, which the app's panel items would need", () => {
    const n = widgetOf("Text", { Rotation: 90, Width: 100, Height: 20 });
    expect(n.transform).toEqual({ rotate: 90, flipX: false });
    expect(n.needs).toEqual(["text font and style", "rotated panel items"]);
    expect(widgetOf("Bar", { FlipX: true, Width: 100, Height: 10 }).needs).toEqual(["custom gauge widget", "flipped panel items"]);
    expect(widgetOf("Text").transform).toBeUndefined();
  });

  it("scrolls marquee text in a box with a width, as InfoPanel does", () => {
    expect(widgetOf("Text", { Marquee: true, Width: 80, MarqueeSpeed: 30, MarqueeSpacing: 12 })).toMatchObject({
      custom: { kind: "text", marquee: { speed: 30, spacing: 12 } }, needs: ["text font and style", "scrolling text"],
    });
    // Without a width InfoPanel does not scroll it.
    expect(widgetOf("Text", { Marquee: true })).toMatchObject({ custom: { marquee: null }, needs: ["text font and style"] });
  });

  it("draws every bar with the bar generator, as InfoPanel draws it", () => {
    const bar = widgetOf("Bar", { Width: 20, Height: 150, Color: "#FF00FF00", Background: true, BackgroundColor: "#FF111111", Gradient: false, Frame: false, MinValue: 10, MaxValue: 90 });
    expect(bar).toMatchObject({
      needs: ["custom gauge widget"],
      lost: [],
      custom: { kind: "vector", min: 10, max: 90, gauge: { shape: "bar", orientation: "vertical", width: 20, height: 150, thickness: 20, radius: 0, track: "#111111", fill: { mode: "solid", color: "#00FF00" } } },
    });
    // Horizontal, framed (a 1 px border that insets the bar), rounded, with a gradient over the filled part.
    const framed = widgetOf("Bar", {
      Width: 200, Height: 10, Color: "#FFFF0000", Gradient: true, GradientColor: "#FF0000FF", Frame: true, FrameColor: "#FFFFFFFF", CornerRadius: 4, Background: false,
    });
    expect(framed.custom).toMatchObject({
      kind: "vector",
      gauge: {
        orientation: "horizontal", thickness: 8, radius: 3, track: null,
        fill: { mode: "gradient", over: "fill", stops: [{ at: 0, color: "#FF0000" }, { at: 50, color: "#FF0000" }, { at: 100, color: "#0000FF" }] },
        background: { color: null, border: { color: "#FFFFFF", width: 1 }, radius: 4 },
      },
    });
    expect(widgetOf("Bar", { Width: 20, Height: 150, Gradient: true }).lost).toContain("gradient direction (InfoPanel runs a vertical bar's gradient across it)");
    expect(widgetOf("Bar", { Width: 200, Height: 10, Color: "#80FF0000" }).lost).toContain("colour transparency");
    const donut = widgetOf("Donut", { Width: 120, Span: 270, Thickness: 12, Color: "#FFFF0000", Rotation: 45 });
    expect(donut).toMatchObject({
      box: { w: 120, h: 120 }, transform: { rotate: 45 }, needs: ["custom gauge widget", "rotated panel items"],
      custom: { kind: "vector", gauge: { shape: "arc", start: 90, sweep: 270, thickness: 12, fill: { color: "#FF0000" } } },
    });
  });

  it("draws a graph with InfoPanel's own geometry, keeping its look for the sparkline-to-be", () => {
    const n = widgetOf("Graph", {
      Type: "HISTOGRAM", Width: 300, Height: 50, Step: 3, Thickness: 2, Fill: true, FillColor: "#FF112233", Color: "#FFFF0000",
      Frame: true, FrameColor: "#FFFFFFFF", Background: false, MinValue: 0, MaxValue: 100, AutoValue: true, FlipX: true,
    });
    expect(n).toMatchObject({
      widget: { kind: "sparkline", history: 100 },
      box: { x: 100, y: 100, w: 300, h: 50 },
      lost: [],
      transform: { flipX: true },
      needs: ["InfoPanel graph style (histogram, step, thickness, frame, background, fill)", "flipped panel items"],
      custom: {
        kind: "graph",
        graph: { type: "HISTOGRAM", step: 3, thickness: 2, fill: true, fillColor: "#FF112233", color: "#FFFF0000", frame: true, background: false, min: 0, max: 100, auto: true },
      },
    });
    expect(widgetOf("Graph", { Type: "LINE", Width: 100 }).needs[0]).toBe("InfoPanel graph style (step, thickness, frame, background, fill)");
  });

  it("draws capsules, ovals and polygons from InfoPanel's geometry", () => {
    const n = widgetOf("Shape", { ShowGradient: false, Type: "Capsule", Width: 80, Height: 30, CornerRadius: 15, FillColor: "#FF223344", ShowFrame: true, FrameThickness: 2, FrameColor: "#FFFFFFFF" });
    expect(n).toMatchObject({ needs: ["capsule shape"], custom: { kind: "shape", type: "Capsule", radius: 15, fill: "#223344", stroke: { color: "#FFFFFF", width: 2 } } });
    expect(widgetOf("Shape", { ShowGradient: false, Type: "Ellipse", Width: 80, Height: 30 }).needs).toEqual(["oval shape"]);
    expect(widgetOf("Shape", { ShowGradient: false, Type: "Star", Width: 40, Height: 40 }).needs).toEqual(["star shape"]);
  });

  it("shows an image-sequence gauge's frame for the value, sized from its frames", () => {
    const sized: ConvertContext = { ...ctx, assetSize: (n) => (n === "f0.png" ? { width: 64, height: 32 } : null) };
    const item = parseDisplayItemsXml(
      `<ArrayOfDisplayItem xmlns:xsi="x"><DisplayItem xsi:type="GaugeDisplayItem"><MaxValue>50</MaxValue><AnimationSpeed>5</AnimationSpeed><Images>` +
        `<ImageDisplayItem><FilePath>f0.png</FilePath><RelativePath>true</RelativePath></ImageDisplayItem>` +
        `<ImageDisplayItem><FilePath>f1.png</FilePath><RelativePath>true</RelativePath></ImageDisplayItem></Images></DisplayItem></ArrayOfDisplayItem>`,
    ).items[0];
    const c = convert(item, "g", sized);
    expect(c.ok && c.native).toMatchObject({
      box: { w: 64, h: 32 }, needs: ["image-sequence gauge widget"], lost: ["AnimationSpeed (the frame changes at once)"],
      custom: { kind: "frames", urls: ["/corpus/p/assets/f0.png", "/corpus/p/assets/f1.png"], min: 0, max: 50 },
    });
    expect(convert(item, "g", { ...sized, assetUrl: () => null })).toMatchObject({ ok: false, reason: expect.stringMatching(/no URL yet/) });
  });

  it("draws images stretched over their box, under the colour layer, nothing while there is none", () => {
    expect(widgetOf("Image", { FilePath: "logo.png", RelativePath: true, Width: 200, Height: 100, Layer: true, LayerColor: "#80FF0000" })).toMatchObject({
      lost: [],
      custom: { kind: "image", layer: "#80FF0000" },
      needs: ["image stretched to its box, nothing while there is no image", "image colour layer"],
    });
    // A URL image from a sensor converts before it has a URL; its widget reads the sensor's.
    expect(widgetOf("HttpImage", { Width: 100, Height: 100, Scale: 66, SensorType: "Plugin", PluginSensorId: "/x" })).toMatchObject({
      widget: { kind: "image", text: undefined, sensor: "libre.cpu_total", height: 66 },
      box: { w: 66, h: 66 },
      custom: { kind: "image", layer: null },
      needs: ["image stretched to its box, nothing while there is no image"],
    });
  });

  it("sizes an image drawn at its natural size from the file", () => {
    const c = convert(one("Image", { FilePath: "bg.png", RelativePath: true, Scale: 50 }), "i", { ...ctx, assetSize: () => ({ width: 200, height: 100 }) });
    expect(c.ok && c.native.box).toEqual({ x: 100, y: 100, w: 100, h: 50 });
  });

  it("makes a vector gauge the custom gauge widget, which draws its spec live, losing nothing", () => {
    const gauge = (vector: object, fields: Record<string, number> = {}) => convert({ ...one("Gauge", { MaxValue: 3000, ...fields }), vector } as never, "g", ctx);
    const dial = gauge({ shape: "arc", sweep: 270, needle: {}, width: 120, height: 100 }, { MinValue: 500, Scale: 50 });
    expect(dial.ok && dial.native).toMatchObject({
      widget: { kind: "gauge", max: 3000, sensor: "libre.cpu_total" },
      box: { w: 60, h: 50 },
      lost: [],
      needs: ["custom gauge widget"],
      custom: { kind: "vector", min: 500, max: 3000, gauge: { shape: "arc", sweep: 270, needle: { length: 0.85 } } },
    });
    expect(gauge({ shape: "bar", orientation: "vertical" })).toMatchObject({ ok: true, native: { custom: { gauge: { orientation: "vertical" } } } });
  });

  it("drops the alpha of .NET colours", () => {
    expect([hexColor("#80FF0000"), hexColor("#00FF00"), hexColor("red")]).toEqual(["#FF0000", "#00FF00", undefined]);
  });
});

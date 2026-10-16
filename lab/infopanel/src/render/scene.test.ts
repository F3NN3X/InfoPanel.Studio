import { describe, expect, it } from "vitest";
import { parseDisplayItemsXml, parseProfileXml } from "../parse.ts";
import type { SensorReading } from "../sensor-text.ts";
import { tableFromText } from "../sensor-source.ts";
import { buildScene, hasAnimatedGradient, imageSource, type DrawNode, type ImageSource, type SceneInput, type SensorState } from "./scene.ts";
import { visibleText } from "./Text.tsx";

const parse = (body: string) =>
  parseDisplayItemsXml('<ArrayOfDisplayItem xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' + body + "</ArrayOfDisplayItem>").items;
const item = (type: string, fields = "") => `<DisplayItem xsi:type="${type}DisplayItem">${fields}</DisplayItem>`;
const reading = (now: number, extra: Partial<SensorReading> = {}): SensorReading => ({ now, min: now, max: now, avg: now, unit: "", ...extra });

function scene(body: string, opts: Partial<Omit<SceneInput, "items" | "profile">> & { state?: SensorState } = {}): DrawNode[] {
  return buildScene({
    profile: parseProfileXml("<Profile><FontScale>1.5</FontScale></Profile>").profile,
    items: parse(body),
    sensor: () => opts.state ?? { reading: null, history: [] },
    image: opts.image ?? (() => ({ url: "blob:x", width: 40, height: 30 })),
    now: opts.now ?? new Date(2026, 9, 16, 15, 4, 5),
    elapsedMs: opts.elapsedMs ?? 0,
    gaugeIndex: opts.gaugeIndex,
  });
}

describe("buildScene", () => {
  it("draws in document order, skips hidden items and does not offset group children", () => {
    const nodes = scene(
      item("Text", "<Name>a</Name>") +
        item("Text", "<Name>hidden</Name><Hidden>true</Hidden>") +
        item("Group", "<X>500</X><DisplayItems>" + item("Text", "<Name>b</Name><X>3</X><Y>4</Y>") + item("Text", "<Name>c</Name><Hidden>true</Hidden>") + "</DisplayItems>") +
        item("Group", "<Hidden>true</Hidden><DisplayItems>" + item("Text", "<Name>d</Name>") + "</DisplayItems>"),
    );
    expect(nodes.map((n) => [n.path, n.kind === "text" && n.text, n.kind === "text" && n.x])).toEqual([
      ["0", "a", 100],
      ["2.0", "b", 3],
    ]);
  });

  it("sizes text at FontSize × FontScale and maps Wrap to one line", () => {
    const [t] = scene(item("Text", "<Name>x</Name><FontSize>20</FontSize><Wrap>true</Wrap><Width>50</Width>"));
    expect(t).toMatchObject({ kind: "text", width: 50, oneLine: true, style: { size: 30 } });
  });

  it("shows '-' in the item colour for an unbound sensor, and the threshold colour when reached", () => {
    const fields = "<Color>#FF111111</Color><Threshold1>50</Threshold1><Threshold1Color>#FFFF0000</Threshold1Color><ShowUnit>false</ShowUnit>";
    const [unbound] = scene(item("Sensor", fields));
    expect(unbound).toMatchObject({ text: "-", style: { color: "#FF111111" } });
    const [hot] = scene(item("Sensor", fields), { state: { reading: reading(72), history: [] } });
    expect(hot).toMatchObject({ text: "72", style: { color: "#FFFF0000" } });
  });

  it("formats clocks at the given time", () => {
    const [c] = scene(item("Clock", "<Format>HH:mm:ss</Format>"));
    expect(c).toMatchObject({ text: "15:04:05" });
  });

  it("draws a table sensor without a table as 'Invalid sensor', with one as columns", () => {
    expect(scene(item("TableSensor"))[0]).toMatchObject({ kind: "text", text: "Invalid sensor" });
    const table = tableFromText("a, b, c\nd, e, f");
    const [t] = scene(item("TableSensor", "<TableFormat>2:30|9:10|0:20</TableFormat><MaxRows>1</MaxRows>"), {
      state: { reading: reading(0, { text: "a, b, c" }), history: [], table },
    });
    expect(t).toMatchObject({
      kind: "table",
      columns: [
        { title: "Column 2", cells: ["c"], dx: 0, width: 30 },
        { title: "Column 0", cells: ["a"], dx: 40, width: 20 },
      ],
    });
  });

  it("sizes images from the file when Width/Height are 0, then applies Scale", () => {
    const [img] = scene(item("Image", "<FilePath>A.png</FilePath><RelativePath>true</RelativePath><Width>0</Width><Height>20</Height><Scale>150</Scale>"));
    expect(img).toMatchObject({ kind: "image", width: 60, height: 30, url: "blob:x" });
  });

  it("draws the placeholder for an image that cannot load, only when the item has a size", () => {
    const image = () => null;
    expect(scene(item("Image", "<Width>10</Width><Height>10</Height>"), { image })[0]).toMatchObject({ url: null, width: 10 });
    expect(scene(item("Image"), { image })).toEqual([]);
  });

  it("shows a sensor image only while the raw value is within its thresholds", () => {
    const si = item("SensorImage", "<Threshold1>10</Threshold1><Threshold2>20</Threshold2><FilePath>a.png</FilePath><RelativePath>true</RelativePath>");
    expect(scene(si)).toEqual([]);
    expect(scene(si, { state: { reading: reading(15), history: [] } })).toHaveLength(1);
    expect(scene(si, { state: { reading: reading(25), history: [] } })).toEqual([]);
  });

  it("picks the gauge frame from the value and scales it", () => {
    const frames = ["f0", "f1", "f2"].map((f) => `<ImageDisplayItem><FilePath>${f}.png</FilePath><RelativePath>true</RelativePath></ImageDisplayItem>`).join("");
    const seen: ImageSource[] = [];
    const image = (s: ImageSource) => (seen.push(s), { url: "u", width: 100, height: 50 });
    const [g] = scene(item("Gauge", `<Scale>50</Scale><MaxValue>100</MaxValue><Images>${frames}</Images>`), { image, state: { reading: reading(80), history: [] } });
    expect(seen).toEqual([{ kind: "asset", name: "f2.png" }]);
    expect(g).toMatchObject({ kind: "image", width: 50, height: 25 });
  });

  it("draws a vector gauge live at the value instead of its frames, at its spec size × Scale", () => {
    const items = parse(item("Gauge", "<MinValue>0</MinValue><MaxValue>200</MaxValue><Scale>50</Scale><X>3</X>"));
    const g = { ...items[0], vector: { shape: "bar", width: 100, height: 20 } };
    const [node] = buildScene({
      profile: parseProfileXml("<Profile/>").profile,
      items: [g],
      sensor: () => ({ reading: reading(50), history: [] }),
      image: () => null,
      now: new Date(),
      elapsedMs: 0,
    });
    expect(node).toMatchObject({ kind: "vector", x: 3, width: 50, height: 10, p: 0.25, gauge: { shape: "bar", width: 100 } });
  });

  it("crossfades to the next gauge frame while the shown index lies between frames", () => {
    const frames = ["f0", "f1", "f2"].map((f) => `<ImageDisplayItem><FilePath>${f}.png</FilePath><RelativePath>true</RelativePath></ImageDisplayItem>`).join("");
    const image = (s: ImageSource) => ({ url: s.kind === "asset" ? s.name : "", width: 10, height: 10 });
    const nodes = scene(item("Gauge", `<AnimationSpeed>5</AnimationSpeed><Images>${frames}</Images>`), {
      image,
      state: { reading: reading(100), history: [] },
      gaugeIndex: (_path, target) => (expect(target).toBe(2), 0.25),
    });
    expect(nodes.map((n) => n.kind === "image" && [n.url, n.opacity])).toEqual([["f0.png", 1], ["f1.png", 0.25]]);
  });

  it("drops a graph without samples and keeps a bar", () => {
    expect(scene(item("Graph"))).toEqual([]);
    expect(scene(item("Bar"))[0]).toMatchObject({ kind: "chart", width: 400, height: 50 });
  });

  it("animates a shape's gradient from the elapsed time", () => {
    const shape = item("Shape", "<GradientType>Sweep</GradientType><GradientAnimationSpeed>90</GradientAnimationSpeed>");
    const [s] = scene(shape, { elapsedMs: 1000 });
    expect(s.kind === "shape" && s.fill).toMatchObject({ kind: "conic", from: 90 });
    expect(hasAnimatedGradient(parse(item("Group", "<DisplayItems>" + shape + "</DisplayItems>")))).toBe(true);
    expect(hasAnimatedGradient(parse(item("Shape", "<GradientAnimationSpeed>0</GradientAnimationSpeed>")))).toBe(false);
  });
});

describe("imageSource", () => {
  const [img] = parse(item("Image"));
  it("resolves files from the export's assets, and nothing else from disk", () => {
    if (img.kind !== "Image") throw new Error();
    expect(imageSource({ ...img, FilePath: "Bg.PNG", RelativePath: true })).toEqual({ kind: "asset", name: "bg.png" });
    expect(imageSource({ ...img, FilePath: "C:\\x.png" }).kind).toBe("none");
    expect(imageSource({ ...img, Type: "URL", HttpUrl: "https://a/b.png" })).toEqual({ kind: "url", url: "https://a/b.png" });
    expect(imageSource({ ...img, Type: "RTSP" }).kind).toBe("none");
  });
});

describe("visibleText", () => {
  it("keeps the first line when MaxLines is 1, with an ellipsis when enabled", () => {
    expect(visibleText("a\nb", true, true)).toBe("a\u2026");
    expect(visibleText("a\r\nb", true, false)).toBe("a");
    expect(visibleText("a\nb", false, true)).toBe("a\nb");
  });
});

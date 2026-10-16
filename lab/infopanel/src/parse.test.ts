import { describe, expect, it } from "vitest";
import { parseDisplayItemsXml, parseProfileXml, walkItems } from "./parse.ts";
import { SCHEMAS } from "./schema.ts";

const items = (body: string) =>
  parseDisplayItemsXml(
    '<ArrayOfDisplayItem xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' + body + "</ArrayOfDisplayItem>",
  );
const item = (type: string, fields = "") => `<DisplayItem xsi:type="${type}DisplayItem">${fields}</DisplayItem>`;

describe("parseProfileXml", () => {
  it("reads fields and applies C# defaults for missing ones", () => {
    const { profile, issues } = parseProfileXml(
      "<Profile><Name>P</Name><Width>1920</Width><BackgroundColor>00FFFFFF</BackgroundColor><FontScale>1.5</FontScale></Profile>",
    );
    expect(profile).toMatchObject({ Name: "P", Width: 1920, Height: 400, BackgroundColor: "#00FFFFFF", FontScale: 1.5 });
    expect(profile.Font).toBe("");
    expect(issues).toEqual([]);
  });

  it("stores FontScale as a C# float", () => {
    expect(parseProfileXml("<Profile/>").profile.FontScale).toBe(Math.fround(1.33));
  });

  it("keeps the default when a setter rejects the value", () => {
    const { profile, issues } = parseProfileXml("<Profile><Width>0</Width><FontSize>-3</FontSize></Profile>");
    expect([profile.Width, profile.FontSize]).toEqual([600, 26]);
    expect(issues.map((i) => [i.code, i.field])).toEqual([
      ["rejected-value", "Width"],
      ["rejected-value", "FontSize"],
    ]);
  });

  it("ignores window placement", () => {
    const { issues } = parseProfileXml("<Profile><TargetWindow><X>1</X></TargetWindow></Profile>");
    expect(issues).toEqual([]);
  });
});

describe("parseDisplayItemsXml", () => {
  it("fills every schema field for a bare item", () => {
    const { items: [shape] } = items(item("Shape"));
    for (const [k, spec] of Object.entries(SCHEMAS.Shape)) expect(shape).toHaveProperty(k, spec.default);
    expect(shape).toMatchObject({ kind: "Shape", unknown: {} });
  });

  it("uses per-type defaults (Donut rotates 90, TableSensor binds a plugin)", () => {
    const { items: [donut, table] } = items(item("Donut") + item("TableSensor"));
    expect(donut).toMatchObject({ Rotation: 90, Width: 400, Span: 360 });
    expect(table).toMatchObject({ SensorType: "Plugin", MaxRows: 10 });
  });

  it("converts values like XmlConvert", () => {
    const { items: [s], issues } = items(
      item(
        "Sensor",
        "<X> -12 </X><Bold>1</Bold><Threshold1>1.5E2</Threshold1><Id>4294967295</Id>" +
          "<Color>FF00FF00</Color><Name>  CPU  </Name><SensorType>Libre</SensorType>",
      ),
    );
    expect(s).toMatchObject({ X: -12, Bold: true, Threshold1: 150, Id: 4294967295, Color: "#FF00FF00", Name: "  CPU  " });
    expect(s).toMatchObject({ SensorType: "Libre" });
    expect(issues).toEqual([]);
  });

  it.each([
    ["<X>1.5</X>", "X"],
    ["<Bold>True</Bold>", "Bold"],
    ["<Id>-1</Id>", "Id"],
    ["<SensorType>libre</SensorType>", "SensorType"],
    ["<Threshold1>1,5</Threshold1>", "Threshold1"],
  ])("reports %s as invalid and keeps the default", (xml, field) => {
    const { items: [s], issues } = items(item("Sensor", xml));
    expect(issues).toMatchObject([{ code: "invalid-value", field, kind: "Sensor", path: "0" }]);
    expect(s).toHaveProperty(field, (SCHEMAS.Sensor as Record<string, { default: unknown }>)[field].default);
  });

  it("mirrors setter checks: rejects, clamps", () => {
    const { items: [graph, donut, text], issues } = items(
      item("Graph", "<Step>0</Step><Width>-1</Width>") + item("Donut", "<Span>400</Span>") + item("Text", "<GlowRadius>50</GlowRadius>"),
    );
    expect(graph).toMatchObject({ Step: 4, Width: 400 });
    expect(donut).toMatchObject({ Span: 360 });
    expect(text).toMatchObject({ GlowRadius: 20 });
    expect(issues.map((i) => i.field)).toEqual(["Step", "Width", "Span"]);
  });

  it("keeps the first occurrence of a field and reads _valueType as ValueType", () => {
    const { items: [a, b], issues } = items(
      item("Sensor", "<X>1</X><X>2</X>") + item("Bar", "<ValueType>MIN</ValueType><_valueType>MAX</_valueType>"),
    );
    expect(a).toMatchObject({ X: 1 });
    expect(b).toMatchObject({ ValueType: "MAX" });
    expect(issues).toMatchObject([{ code: "duplicate-field", field: "X", value: "2" }]);
  });

  it("keeps and reports unknown fields; ignores known no-op ones", () => {
    const { items: [s, d], issues } = items(
      item("Sensor", "<Name>T</Name><AutoScale>true</AutoScale>") + item("Donut", "<Radius>200</Radius>"),
    );
    expect(s.unknown).toEqual({ AutoScale: "true" });
    expect(d.unknown).toEqual({});
    expect(issues).toEqual([{ code: "unknown-field", path: "0", kind: "Sensor", name: "T", field: "AutoScale", value: "true" }]);
  });

  it("skips and reports unknown item types", () => {
    const { items: list, issues } = items(item("Hologram") + "<DisplayItem/>" + item("Text"));
    expect(list.map((i) => i.kind)).toEqual(["Text"]);
    expect(issues.map((i) => [i.code, i.path, i.value])).toEqual([
      ["unknown-type", "0", "HologramDisplayItem"],
      ["unknown-type", "1", ""],
    ]);
  });

  it("nests group children and keeps their own coordinates", () => {
    const { items: list } = items(
      item(
        "Group",
        "<Name>G</Name><X>500</X><DisplayItemsCount>2</DisplayItemsCount><DisplayItems>" +
          item("Text", "<X>10</X>") +
          item("Group", "<DisplayItems>" + item("Clock") + "</DisplayItems>") +
          "</DisplayItems>",
      ) + item("Bar"),
    );
    expect([...walkItems(list)].map(({ item, depth }) => [item.kind, depth])).toEqual([
      ["Group", 0],
      ["Text", 1],
      ["Group", 1],
      ["Clock", 2],
      ["Bar", 0],
    ]);
    const g = list[0];
    if (g.kind !== "Group") throw new Error("expected a group");
    expect(g.DisplayItems[0]).toMatchObject({ X: 10 });
  });

  it("reads gauge frames as images in order", () => {
    const { items: [g], issues } = items(
      item(
        "Gauge",
        "<Scale>120</Scale><Images>" +
          "<ImageDisplayItem><FilePath>a.png</FilePath><RelativePath>true</RelativePath><ReadOnly>false</ReadOnly></ImageDisplayItem>" +
          "<ImageDisplayItem><FilePath>b.png</FilePath><Bogus/></ImageDisplayItem>" +
          "</Images>",
      ),
    );
    if (g.kind !== "Gauge") throw new Error("expected a gauge");
    expect(g.Scale).toBe(120);
    expect(g.Images.map((f) => [f.kind, f.FilePath, f.RelativePath])).toEqual([
      ["Image", "a.png", true],
      ["Image", "b.png", false],
    ]);
    expect(issues).toMatchObject([{ code: "unknown-field", path: "0/1", kind: "Gauge.Images", field: "Bogus" }]);
  });
});

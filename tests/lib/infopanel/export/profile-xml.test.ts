import { describe, expect, it } from "vitest";
import { displayItemsXml, profileXml, writeOrder } from "@/lib/infopanel/export/write.ts";
import { parseProfileXml } from "@/lib/infopanel/parse.ts";
import { defaultItem, PROFILE, SCHEMAS, type GaugeItem, type GroupItem, type Profile } from "@/lib/infopanel/schema.ts";
import { fullProfile, KINDS } from "./kind-cases.ts";

const profile = (over: Partial<Profile>): Profile => ({ ...fullProfile(), ...over });

describe("Profile.xml as InfoPanel's export writes it", () => {
  // SharedModel.ExportProfile makes a fresh Profile and copies Name, Width, Height, ShowFps, BackgroundColor, Font, FontSize,
  // Color, OpenGL, FontScale and the WebView fields onto it: the rest is a fresh profile's, and XmlSerializer writes it all.
  const expected = [
    "﻿" + '<?xml version="1.0" encoding="utf-8"?>',
    '<Profile xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">',
    "  <Guid>11111111-2222-3333-4444-555555555555</Guid>",
    "  <Name>Desk &amp; Co</Name>",
    "  <Width>800</Width>",
    "  <Height>480</Height>",
    "  <Drag>true</Drag>",
    "  <BackgroundColor>#FF0A0A0C</BackgroundColor>",
    "  <Active>true</Active>",
    "  <Topmost>false</Topmost>",
    "  <Font>Segoe UI</Font>",
    "  <FontSize>26</FontSize>",
    "  <Color>#FFFFFFFF</Color>",
    "  <WindowX>0</WindowX>",
    "  <WindowY>0</WindowY>",
    "  <Resize>true</Resize>",
    "  <StrictWindowMatching>false</StrictWindowMatching>",
    "  <WebViewEnabled>true</WebViewEnabled>",
    "  <WebViewUrl />",
    "  <WebViewInteractive>false</WebViewInteractive>",
    "  <WebViewDisableCache>false</WebViewDisableCache>",
    "  <WebViewAutoRefreshSeconds>30</WebViewAutoRefreshSeconds>",
    "  <WebViewMaxFps>0</WebViewMaxFps>",
    "  <IsSelected>false</IsSelected>",
    "  <ShowFps>true</ShowFps>",
    "  <OpenGL>false</OpenGL>",
    "  <FontScale>1.33</FontScale>",
    "</Profile>",
  ].join("\r\n");
  const desk = profile({
    Name: "Desk & Co", Width: 800, Height: 480, BackgroundColor: "#FF0A0A0C", Color: "#FFFFFFFF", Font: "Segoe UI", FontSize: 26, ShowFps: true, OpenGL: false,
    FontScale: Math.fround(1.33), WebViewEnabled: true, WebViewUrl: "", WebViewInteractive: false, WebViewDisableCache: false, WebViewAutoRefreshSeconds: 30, WebViewMaxFps: 0,
    unknown: {},
  });

  it("matches byte for byte: BOM, CRLF, element order, no trailing newline, <X /> for empty text", () => {
    // The window state the file's source PC had is not exported, as in InfoPanel.
    expect(profileXml({ ...desk, Active: false, Topmost: true, WindowX: 40, WindowY: 50, Resize: false, StrictWindowMatching: true, TriggerProcessNames: "game.exe", Drag: false, IsSelected: true })).toBe(expected);
  });

  it("lists the same fields as the schema, so none is dropped by the ordering", () => {
    expect(writeOrder(PROFILE).sort()).toEqual(Object.keys(PROFILE).sort());
    expect(parseProfileXml(expected).issues).toEqual([]);
  });
});

describe("item element order", () => {
  it("is a permutation of the schema for every kind (the blocks move fields, never lose one)", () => {
    for (const kind of KINDS) expect(writeOrder(SCHEMAS[kind]).sort(), kind).toEqual(Object.keys(SCHEMAS[kind]).sort());
  });

  it("writes InfoPanel's blocks: generated members last, ValueType where the class declares it", () => {
    const at = (kind: keyof typeof SCHEMAS, a: string, b: string) => writeOrder(SCHEMAS[kind]).indexOf(a) < writeOrder(SCHEMAS[kind]).indexOf(b);
    expect(at("Text", "GlowRadius", "FontStyle")).toBe(true);
    expect(at("Text", "FontStyle", "RightAlign")).toBe(true);
    expect(at("Image", "LayerColor", "ShowPanel")).toBe(true);
    expect(at("Bar", "GradientColor", "CornerRadius")).toBe(true);
    expect(at("Gauge", "FlipX", "ValueType")).toBe(true);
    expect(at("TableSensor", "ValueType", "PluginSensorId")).toBe(true);
  });

  it("writes an empty list as <X /> and keeps empty text empty", () => {
    const out = displayItemsXml([{ ...defaultItem("Group"), DisplayItems: [] } as GroupItem, { ...defaultItem("Gauge"), Images: [] } as GaugeItem, defaultItem("Sensor")]);
    expect(out).toContain("<DisplayItems />");
    expect(out).toContain("<Images />");
    expect(out).toContain("<Unit />");
    expect(out).not.toContain("<Unit></Unit>");
  });
});

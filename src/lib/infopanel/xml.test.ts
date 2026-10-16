import { describe, expect, it } from "vitest";
import { child, parseXml } from "./xml.ts";

describe("parseXml", () => {
  it("reads XmlSerializer output with BOM, declaration and namespaces", () => {
    const root = parseXml(
      '﻿<?xml version="1.0" encoding="utf-8"?>\r\n' +
        '<ArrayOfDisplayItem xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\r\n' +
        '  <DisplayItem xsi:type="TextDisplayItem">\r\n' +
        "    <Name>CPU &amp; GPU &lt;3</Name>\r\n" +
        "    <PluginSensorId />\r\n" +
        "  </DisplayItem>\r\n" +
        "</ArrayOfDisplayItem>\r\n",
    );
    expect(root.name).toBe("ArrayOfDisplayItem");
    const item = root.children[0];
    expect(item.attrs["xsi:type"]).toBe("TextDisplayItem");
    expect(child(item, "Name")?.text).toBe("CPU & GPU <3");
    expect(child(item, "PluginSensorId")).toEqual({ name: "PluginSensorId", attrs: {}, children: [], text: "" });
  });

  it("decodes numeric references, single-quoted attributes and CDATA", () => {
    const root = parseXml("<a k='v &quot;x&quot;'>&#x41;&#66;<![CDATA[<raw & text>]]><!-- note --></a>");
    expect(root.attrs.k).toBe('v "x"');
    expect(root.text).toBe("AB<raw & text>");
  });

  it("keeps whitespace in text exactly", () => {
    expect(parseXml("<Name>  two  spaces </Name>").text).toBe("  two  spaces ");
  });

  it.each([
    ["<a><b></a>", /Mismatched/],
    ["<a>", /Unclosed/],
    ["<a/><b/>", /More than one root/],
    ["<!DOCTYPE a><a/>", /DTDs/],
    ["<a>&nope;</a>", /Unknown entity/],
    ["<a>x & y</a>", /Bare '&'/],
    ["text<a/>", /outside the root/],
    ["", /No root/],
  ])("rejects %s", (src, err) => {
    expect(() => parseXml(src)).toThrow(err);
  });
});

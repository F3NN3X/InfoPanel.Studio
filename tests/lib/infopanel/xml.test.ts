import { describe, expect, it } from "vitest";
import { child, parseXml } from "@/lib/infopanel/xml.ts";

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

  it("reports a 1-based line and column, not the offset", () => {
    expect(() => parseXml("<a>\n  <b>\n  </a>")).toThrow("Mismatched closing tag </a> (line 3, column 3)");
    expect(() => parseXml("<a><b/><c></a>")).toThrow("(line 1, column 11)");
    expect(() => parseXml("")).toThrow("No root element (line 1, column 1)");
    expect(() => parseXml("<a>\r\n<b>&nope;</b></a>")).toThrow(/Unknown entity &nope; \(line 2, column 4\)/);
    expect(() => parseXml("<a>")).not.toThrow(/offset/);
  });

  it("points an entity error at its '&', in text and in attributes", () => {
    expect(() => parseXml("<a>long text before &nope; here</a>")).toThrow(/Unknown entity &nope; \(line 1, column 21\)/);
    expect(() => parseXml("<a>one\ntwo x & y</a>")).toThrow(/Bare '&' in text \(line 2, column 7\)/);
    expect(() => parseXml('<a k="v &bad; w"/>')).toThrow(/Unknown entity &bad; \(line 1, column 9\)/);
    expect(() => parseXml("<a k='x' j='&'/>")).toThrow(/Bare '&' in text \(line 1, column 13\)/);
  });

  it("rejects a character reference beyond Unicode instead of crashing", () => {
    expect(() => parseXml("<a>&#xFFFFFFFF;</a>")).toThrow(/Invalid character reference &#xFFFFFFFF; \(line 1, column 4\)/);
  });
});

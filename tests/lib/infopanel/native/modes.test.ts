import { describe, expect, it } from "vitest";
import { parseDisplayItemsXml } from "@/lib/infopanel/parse.ts";
import type { DisplayItem } from "@/lib/infopanel/schema.ts";
import type { ConvertContext } from "@/lib/infopanel/native/convert.ts";
import { convertible, isNative, modeCounts, walkPaths, withMode } from "@/lib/infopanel/native/modes.ts";

const items = parseDisplayItemsXml(
  '<ArrayOfDisplayItem xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    '<DisplayItem xsi:type="TextDisplayItem"><Name>t</Name></DisplayItem>' +
    '<DisplayItem xsi:type="GroupDisplayItem"><Name>g</Name><Hidden>true</Hidden><DisplayItems>' +
    '<DisplayItem xsi:type="TextDisplayItem"><Name>inner</Name></DisplayItem>' +
    '<DisplayItem xsi:type="ImageDisplayItem"><Name>img</Name><FilePath>missing.png</FilePath></DisplayItem>' +
    "</DisplayItems></DisplayItem>" +
    "</ArrayOfDisplayItem>",
).items;

const ctx: ConvertContext = { fontScale: 1, keyOf: () => null, assetUrl: () => null };

describe("draw modes", () => {
  it("walks every item in tree order with its path and whether a group around it hides it", () => {
    const seen: [string, string, boolean][] = [];
    walkPaths(items, (item, path, hidden) => seen.push([item.Name, path, hidden]));
    expect(seen).toEqual([
      ["t", "0", false],
      ["g", "1", true],
      ["inner", "1.0", true],
      ["img", "1.1", true],
    ]);
  });

  it("flags native where an item converts, clears every flag for Faithful, and leaves groups alone", () => {
    const paths = new Set(convertible(items, ctx));
    expect(paths.has("0")).toBe(true);
    const native = withMode(items, ctx, "native");
    const flagged: string[] = [];
    walkPaths(native, (item, path) => isNative(item) && flagged.push(path));
    expect(flagged).toEqual([...paths].filter((p) => p !== "1"));
    expect(withMode(native, ctx, "both")).toBe(native);
    const faithful = withMode(native, ctx, "infopanel");
    walkPaths(faithful, (item) => expect(isNative(item)).toBe(false));
    expect(withMode(items, ctx, "infopanel")).toBe(items);
  });

  it("counts items without groups, and the ones that convert", () => {
    expect(modeCounts(items, ctx)).toEqual({ items: 3, native: convertible(items, ctx).length });
  });

  it("never touches the input", () => {
    const copy = JSON.parse(JSON.stringify(items)) as DisplayItem[];
    withMode(items, ctx, "native");
    expect(JSON.parse(JSON.stringify(items))).toEqual(copy);
  });
});

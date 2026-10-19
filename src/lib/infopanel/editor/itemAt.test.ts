import { describe, expect, it } from "vitest";
import { itemAt } from "./ops.ts";
import { parseDisplayItemsXml } from "../parse.ts";

const item = (type: string, fields = "") => `<DisplayItem xsi:type="${type}DisplayItem">${fields}</DisplayItem>`;
const { items } = parseDisplayItemsXml(
  '<ArrayOfDisplayItem xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    item("Text", "<Name>a</Name>") +
    item("Group", "<Name>g</Name><DisplayItems>" + item("Text", "<Name>b</Name>") + "</DisplayItems>") +
    "</ArrayOfDisplayItem>",
);

describe("itemAt", () => {
  it("follows scene paths into groups", () => {
    expect(itemAt(items, "0")?.Name).toBe("a");
    expect(itemAt(items, "1")?.Name).toBe("g");
    expect(itemAt(items, "1.0")?.Name).toBe("b");
  });
  it("is undefined for paths that lead nowhere", () => {
    expect(itemAt(items, "2")).toBeUndefined();
    expect(itemAt(items, "0.0")).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { SDK } from "@/widgets/code/sdk-runtime";
import { checkDefinition, definitionOf } from "@/widgets/code/validate";

// What a bundle returns is checked before anything is registered (Phase 6b): the SDK's shape within its caps, else refused with a
// plain reason. A bundle that throws while it is set up is refused, not raised.

const good = { name: "Clock", reads: ["system.cpu."], defaultSize: [2, 2], render: () => null };

describe("a code widget's definition", () => {
  it("is taken when it has the SDK's shape", () => {
    expect("def" in checkDefinition(good)).toBe(true);
    const settings = [
      { type: "boolean", key: "a", label: "A", default: true },
      { type: "number", key: "b", label: "B", default: 1, min: 0 },
      { type: "text", key: "c", label: "C", default: "" },
      { type: "select", key: "d", label: "D", default: "x", options: [{ value: "x", label: "X" }] },
    ];
    expect("def" in checkDefinition({ ...good, settings, minSize: [1, 1], icon: "memory", description: "one line" })).toBe(true);
    // offered for the page rail (P6), with values of its settings there
    expect("def" in checkDefinition({ ...good, settings, rail: { settings: { a: false, b: 3, c: "x", d: "x" } } })).toBe(true);
    expect("def" in checkDefinition({ ...good, rail: {} })).toBe(true);
  });

  it.each([
    [null, "the bundle returned no widget definition"],
    [{ ...good, name: "" }, "the name is 1 to 48 characters"],
    [{ ...good, name: "x".repeat(49) }, "the name is 1 to 48 characters"],
    [{ ...good, reads: "cpu." }, "reads lists at most 16 sensor key prefixes"],
    [{ ...good, reads: Array(17).fill("a.") }, "reads lists at most 16 sensor key prefixes"],
    [{ ...good, defaultSize: [0, 2] }, "defaultSize and minSize are [columns, rows] of 1 to 12"],
    [{ ...good, minSize: [13, 1] }, "defaultSize and minSize are [columns, rows] of 1 to 12"],
    [{ ...good, render: "<div/>" }, "render is not a function"],
    [{ ...good, settings: [{ type: "color", key: "a", label: "A", default: "#fff" }] }, "settings[0] (a): the type is boolean, number, text or select"],
    [{ ...good, settings: [{ type: "select", key: "a", label: "A", default: "z", options: [{ value: "x", label: "X" }] }] }, "settings[0] (a): a select lists 1 to 32 options and its default is one of them"],
    [{ ...good, settings: [{ type: "text", key: "Bad key", label: "A", default: "" }] }, "settings[0] needs a key (letters and digits, starting lowercase) and a label"],
    [{ ...good, settings: [{ type: "boolean", key: "a", label: "A", default: true }, { type: "boolean", key: "a", label: "B", default: false }] }, "two settings share a key"],
    [{ ...good, rail: true }, "rail is an object with optional settings"],
    [{ ...good, rail: { settings: [] } }, "rail is an object with optional settings"],
    [{ ...good, rail: { settings: { a: 1 } } }, "rail sets a, which is not a setting"],
    [{ ...good, settings: [{ type: "boolean", key: "a", label: "A", default: true }], rail: { settings: { a: "yes" } } }, "rail sets a to a value its boolean setting can't hold"],
    [{ ...good, settings: [{ type: "select", key: "a", label: "A", default: "x", options: [{ value: "x", label: "X" }] }], rail: { settings: { a: "y" } } }, "rail sets a to a value its select setting can't hold"],
  ])("is refused: %j", (d, error) => {
    expect(checkDefinition(d)).toEqual({ error });
  });

  it("comes from a bundle's default export called with the SDK; a throwing bundle is refused", () => {
    expect("def" in definitionOf({ default: (sdk: typeof SDK) => sdk.defineWidget(good as never) }, SDK)).toBe(true);
    expect(definitionOf({ default: () => { throw new Error("boom"); } }, SDK)).toEqual({ error: "the bundle stopped with an error: boom" });
    expect(definitionOf({}, SDK)).toEqual({ error: "the bundle's default export is not a function of the SDK" });
  });
});

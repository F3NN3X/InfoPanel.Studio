import { describe, expect, it } from "vitest";
import {
  MAX_PINS,
  parseAccordion,
  parsePins,
  parseQuickBar,
  parseTabs,
  pickTab,
  pinsOf,
  togglePin,
} from "./inspector-prefs";

describe("parseTabs", () => {
  it("reads a map of tab ids per context", () => {
    expect(parseTabs('{"widget":"style","dashboard":"appearance"}')).toEqual({
      widget: "style",
      dashboard: "appearance",
    });
  });

  it("drops non-string entries and reads malformed storage as empty", () => {
    expect(parseTabs('{"widget":1,"panel":"data"}')).toEqual({ panel: "data" });
    expect(parseTabs(null)).toEqual({});
    expect(parseTabs("nope")).toEqual({});
    expect(parseTabs('["style"]')).toEqual({});
  });

  it("reads a remembered Content tab as Show", () => {
    expect(parseTabs('{"widget":"content","panel":"style"}')).toEqual({ widget: "show", panel: "style" });
  });
});

describe("pickTab", () => {
  it("keeps the remembered tab while the context has it, else the first", () => {
    expect(pickTab("style", ["show", "style", "data", "behaviour"])).toBe("style");
    expect(pickTab("appearance", ["show", "style", "data", "behaviour"])).toBe("show");
    expect(pickTab(undefined, ["profile", "general"])).toBe("profile");
    expect(pickTab("style", [])).toBeUndefined();
  });

  it("skips a disabled (empty) tab, remembered or first", () => {
    const tabs = ["show", "style", "data", "behaviour"];
    expect(pickTab("behaviour", tabs, new Set(["behaviour"]))).toBe("show");
    expect(pickTab(undefined, tabs, new Set(["show"]))).toBe("style");
    expect(pickTab("data", tabs, new Set(["show"]))).toBe("data");
  });
});

describe("studio preferences", () => {
  it("keeps the quick bar on unless it was turned off", () => {
    expect(parseQuickBar(null)).toBe(true);
    expect(parseQuickBar("true")).toBe(true);
    expect(parseQuickBar("false")).toBe(false);
  });

  it("opens one section at a time unless many was picked", () => {
    expect(parseAccordion(null)).toBe("one");
    expect(parseAccordion("junk")).toBe("one");
    expect(parseAccordion("many")).toBe("many");
  });
});

describe("pins", () => {
  it("reads the pins per widget type, dropping anything malformed", () => {
    expect(parsePins('{"Clock":["fmt","secs"],"bad":3,"mixed":["a",1]}')).toEqual({ Clock: ["fmt", "secs"], mixed: ["a"] });
    expect(parsePins("[]")).toEqual({});
    expect(parsePins("{")).toEqual({});
    expect(parsePins(null)).toEqual({});
  });

  it("adds a pin last and removes one in place", () => {
    expect(togglePin(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    expect(togglePin(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  it("keeps only the last six", () => {
    const six = ["a", "b", "c", "d", "e", "f"];
    expect(togglePin(six, "g")).toEqual(["b", "c", "d", "e", "f", "g"]);
    expect(togglePin(six, "g")).toHaveLength(MAX_PINS);
  });

  it("uses a type's default set until it has pins of its own", () => {
    expect(pinsOf({}, "Clock", ["fmt"])).toEqual(["fmt"]);
    expect(pinsOf({ Clock: [] }, "Clock", ["fmt"])).toEqual([]);
  });
});

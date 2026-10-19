import { describe, expect, it } from "vitest";
import { modules } from "@/modules";
import type { Placement } from "@/lib/layout";
import { STANDARD_KEYS } from "@/modules/standard-settings";
import { isMore } from "@/modules/types";
import { zoneDefs } from "./inspector/zone-fields";
import { defaultQuickKeys, pinTypeOf, quickDefsFor, quickable } from "./quick-sets";

const defsOf = (id: string) => modules.find((m) => m.id === id)?.settings ?? [];

describe("defaultQuickKeys", () => {
  it("starts with Density and Accent, then the widget's own compact settings", () => {
    const keys = defaultQuickKeys(defsOf("NowPlaying"));
    expect(keys.slice(0, 2)).toEqual(["sizeTier", "accent"]);
    expect(keys.length).toBeGreaterThan(2);
    expect(keys.length).toBeLessThanOrEqual(4);
  });

  it("gives every widget at least one key, all of them quick-bar controls", () => {
    for (const m of modules) {
      const defs = m.settings ?? [];
      const keys = defaultQuickKeys(defs);
      expect(keys.length, m.id).toBeGreaterThan(0);
      for (const k of keys) expect(quickable(defs.find((d) => d.key === k)!), `${m.id}.${k}`).toBe(true);
    }
  });

  it("picks no other standard key and no More row", () => {
    for (const m of modules) {
      const defs = m.settings ?? [];
      for (const k of defaultQuickKeys(defs).filter((k) => k !== "sizeTier" && k !== "accent")) {
        expect(STANDARD_KEYS.has(k), `${m.id}.${k}`).toBe(false);
        expect(isMore(defs.find((d) => d.key === k)!), `${m.id}.${k}`).toBe(false);
      }
    }
  });

  it("never picks the same key twice or a preset bundle", () => {
    for (const m of modules) {
      const keys = defaultQuickKeys(m.settings ?? []);
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys).not.toContain("preset");
    }
  });
});

const zone = (id: string, module: string): Placement =>
  ({ id, module, colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true }) as Placement;

describe("quickDefsFor", () => {
  it("shows a widget's default set until it has pins", () => {
    const z = zone("a", "NowPlaying");
    expect(quickDefsFor([z], {}, zoneDefs).map((d) => d.key)).toEqual(defaultQuickKeys(zoneDefs(z)));
  });

  it("follows the type's pins, in pin order", () => {
    const keys = quickDefsFor([zone("a", "Clock")], { Clock: ["accent", "sizeTier", "align"] }, zoneDefs).map((d) => d.key);
    expect(keys).toEqual(["accent", "sizeTier", "align"]);
  });

  it("keeps only the pins every selected type shares", () => {
    const pins = { Clock: ["sizeTier", "accent"], Weather: ["accent", "skin"] };
    expect(quickDefsFor([zone("a", "Clock"), zone("b", "Weather")], pins, zoneDefs).map((d) => d.key)).toEqual(["accent"]);
  });

  it("drops pins that are not compact controls and is empty without a selection", () => {
    expect(quickDefsFor([zone("a", "Clock")], { Clock: ["icon", "label", "accent"] }, zoneDefs).map((d) => d.key)).toEqual(["accent"]);
    expect(quickDefsFor([], {}, zoneDefs)).toEqual([]);
  });

  it("files every panel under one type", () => {
    expect(pinTypeOf({ module: "x", panel: { layout: "stack", widgets: [] } } as unknown as Placement)).toBe("panel");
    expect(pinTypeOf({ module: "Clock" })).toBe("Clock");
  });
});

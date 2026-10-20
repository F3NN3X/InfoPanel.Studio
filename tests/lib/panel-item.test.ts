import { describe, expect, it } from "vitest";
import { itemFollows, itemLevels, resolvedItem, withItemFollow } from "@/lib/panel-item";
import type { Widget } from "@/lib/panel-model";
import { resolveWith } from "@/lib/style-resolve";

const widget = (extra: Partial<Widget> = {}): Widget => ({ id: "w", kind: "stat", visible: true, ...extra });

describe("itemFollows", () => {
  it("follows the panel where the widget has no own values, else is custom (no flags: older widgets keep theirs)", () => {
    expect(itemFollows(widget(), "colors")).toBe(true);
    expect(itemFollows(widget({ color: "#ff0000" }), "colors")).toBe(false);
    expect(itemFollows(widget({ fontSize: 40 }), "type")).toBe(false);
    expect(itemFollows(widget({ align: "center" }), "type")).toBe(false);
    expect(itemFollows(widget({ decimals: 1 }), "format")).toBe(false);
    expect(itemFollows(widget({ thr: { warn: 50 } }), "thresholds")).toBe(false);
    // Unit, maximum and multiply by are per widget: they never make Units & format custom.
    expect(itemFollows(widget({ unit: "%", max: 200, scale: 2 }), "format")).toBe(true);
  });

  it("reads its flag first, and always follows a section the profile locks", () => {
    expect(itemFollows(widget({ color: "#ff0000", follow: { colors: true } }), "colors")).toBe(true);
    expect(itemFollows(widget({ follow: { colors: false } }), "colors")).toBe(false);
    expect(itemFollows(widget({ color: "#ff0000" }), "colors", { colors: true })).toBe(true);
  });

});

describe("itemLevels and itemTone", () => {
  const look = { "warn.load": 75, "crit.load": 90 };

  it("follows the panel's levels for the quantity; off where no theme level sets them", () => {
    expect(itemLevels(widget(), look, "load")).toEqual({ warn: 75, crit: 90 });
    expect(itemLevels(widget(), look, "temp")).toEqual({ warn: "off", crit: "off" });
    expect(itemLevels(widget(), {}, "load")).toEqual({ warn: "off", crit: "off" });
  });

  it("custom: its own levels, each unset one the panel's; a lock brings the panel's back", () => {
    const own = widget({ thr: { warn: 50 } });
    expect(itemLevels(own, look, "load")).toEqual({ warn: 50, crit: 90 });
    expect(itemLevels(widget({ thr: { warn: "off", crit: 60 } }), look, "load")).toEqual({ warn: "off", crit: 60 });
    expect(itemLevels(own, look, "load", { thresholds: true })).toEqual({ warn: 75, crit: 90 });
    expect(itemLevels(withItemFollow(own, "thresholds", true), look, "load")).toEqual({ warn: 75, crit: 90 });
  });

});

describe("resolvedItem", () => {
  it("leaves a widget without own values as it is", () => {
    const w = widget({ sensor: "cpu.load", unit: "%" });
    expect(resolvedItem(w, {})).toBe(w);
  });

  it("follows the chain item → panel → page → profile", () => {
    const levels = {
      profile: { values: { decimals: "1", "warn.load": 70 } },
      page: { values: { decimals: "2" }, follow: { format: false } },
    };
    // The panel zone follows the theme: the page's custom Units & format wins over the profile's.
    const look = resolveWith(levels, { label: "Rig" }, undefined) ?? {};
    expect(resolvedItem(widget(), look).decimals).toBe(2);
    expect(itemLevels(widget(), look, "load").warn).toBe(70);
    // A panel with its own Units & format: the item follows the panel's value.
    const own = resolveWith(levels, { decimals: "0" }, { format: false }) ?? {};
    expect(resolvedItem(widget(), own).decimals).toBe(0);
  });
});

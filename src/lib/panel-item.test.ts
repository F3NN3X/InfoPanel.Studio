import { describe, expect, it } from "vitest";
import { itemFollows, itemLevels, itemQuantity, itemTone, resolvedItem, withItemFollow } from "./panel-item";
import type { Widget } from "./panel-model";
import { resolveWith } from "./style-resolve";

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

  it("Use panel then Customize keeps the own values", () => {
    const custom = widget({ color: "#ff0000" });
    const panel = withItemFollow(custom, "colors", true);
    expect(panel.color).toBe("#ff0000");
    expect(itemFollows(panel, "colors")).toBe(true);
    const back = withItemFollow(panel, "colors", false);
    expect(itemFollows(back, "colors")).toBe(false);
    expect(back.color).toBe("#ff0000");
  });
});

describe("itemQuantity", () => {
  it("picks the quantity from the unit: % load, a degree temperature, else value", () => {
    expect(itemQuantity("%")).toBe("load");
    expect(itemQuantity("°C")).toBe("temp");
    expect(itemQuantity("°F")).toBe("temp");
    expect(itemQuantity("MB/s")).toBe("value");
    expect(itemQuantity(undefined)).toBe("value");
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

  it("trips at or above a level; off never trips", () => {
    expect(itemTone(74, { warn: 75, crit: 90 })).toBe("ok");
    expect(itemTone(75, { warn: 75, crit: 90 })).toBe("warn");
    expect(itemTone(95, { warn: 75, crit: 90 })).toBe("crit");
    expect(itemTone(95, { warn: 75, crit: "off" })).toBe("warn");
    expect(itemTone(95, { warn: "off", crit: "off" })).toBe("ok");
    expect(itemTone(undefined, { warn: 1, crit: 2 })).toBe("ok");
  });
});

describe("resolvedItem", () => {
  it("leaves a widget without own values as it is", () => {
    const w = widget({ sensor: "cpu.load", unit: "%" });
    expect(resolvedItem(w, {})).toBe(w);
  });

  it("keeps the own values of a custom section, drops a following one's", () => {
    const w = widget({ color: "#ff0000", fontSize: 40, decimals: 2 });
    expect(resolvedItem(w, {})).toEqual(w);
    const following = { ...w, follow: { colors: true, type: true, format: true } };
    const r = resolvedItem(following, { decimals: "1" });
    expect(r.color).toBeUndefined();
    expect(r.fontSize).toBeUndefined();
    expect(r.decimals).toBe(1);
  });

  it("takes the panel's decimals while Units & format follows (auto = the kind's own)", () => {
    expect(resolvedItem(widget(), { decimals: "2" }).decimals).toBe(2);
    expect(resolvedItem(widget(), { decimals: "auto" }).decimals).toBeUndefined();
    expect(resolvedItem(widget({ follow: { format: false } }), { decimals: "2" }).decimals).toBe(2);
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

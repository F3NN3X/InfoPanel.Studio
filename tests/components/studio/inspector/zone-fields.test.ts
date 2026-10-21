import { describe, expect, it } from "vitest";
import type { Placement } from "@/lib/layout";
import type { ModuleSetting } from "@/modules/types";
import { customised, shownValue, withFollow, zoneLookValues } from "@/components/studio/inspector/zone-fields";

const zone = (patch: Partial<Placement>): Placement => ({
  id: "z",
  module: "SystemOverview",
  colStart: 1,
  rowStart: 1,
  colSpan: 2,
  rowSpan: 1,
  visible: true,
  ...patch,
});

const accent: ModuleSetting = { key: "accent", label: "Accent", type: "color", default: "" };

describe("withFollow", () => {
  it("Customize and Use theme flip one section and keep the own values (SPEC §9: they come back)", () => {
    const own = zone({ settings: { accent: "#ff0000" } });
    const custom = withFollow(own, "colors", false);
    expect(custom.follow).toEqual({ colors: false });
    const back = withFollow(custom, "colors", true);
    expect(back.follow).toBeUndefined();
    expect(back.settings).toEqual({ accent: "#ff0000" });
    expect(shownValue(zoneLookValues(withFollow(back, "colors", false), {}), "accent", accent)).toBe("#ff0000");
  });
});

describe("customised", () => {
  const glow: ModuleSetting = { key: "glow", label: "Edge glow", type: "select", default: "none" };
  const label: ModuleSetting = { key: "label", label: "Title", type: "text", default: "", perWidget: true };
  const defs = [accent, glow, label];

  it("turns each following section an edited key belongs to custom", () => {
    const edited = customised(zone({}), {}, defs, ["accent", "glow"]);
    expect(edited.follow).toEqual({ colors: false, border: false });
  });

  it("leaves a custom section, a per-widget key and an unknown key alone", () => {
    const own = zone({ follow: { colors: false } });
    expect(customised(own, {}, defs, ["accent"])).toBe(own);
    const plain = zone({});
    expect(customised(plain, {}, defs, ["label", "nope"])).toEqual(plain);
  });

  it("leaves a section the screen locks alone", () => {
    const plain = zone({});
    expect(customised(plain, { profile: { locks: { colors: true } } }, defs, ["accent"])).toBe(plain);
  });
});

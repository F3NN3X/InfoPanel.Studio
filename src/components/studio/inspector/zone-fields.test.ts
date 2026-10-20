import { describe, expect, it } from "vitest";
import type { Placement } from "@/lib/layout";
import type { ModuleSetting } from "@/modules/types";
import { shownValue, withFollow, zoneLookValues } from "./zone-fields";

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

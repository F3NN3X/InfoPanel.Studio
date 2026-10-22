import { describe, expect, it } from "vitest";
import { ISLAND_DEFAULTS } from "@/lib/island/config";
import { islandIdleWidth } from "@/components/island/island-model";
import { fitSlots, gapPlacement, gapWidth, splitCenter } from "@/widgets/StatusBar/layout";
import { isWifi, shownOf } from "@/widgets/StatusBar/items";

describe("island gap width", () => {
  const idle = islandIdleWidth({ ...ISLAND_DEFAULTS, enabled: true }, { width: 1920, height: 480 });
  it("Auto follows the island's idle width plus a margin", () => {
    expect(idle).toBeGreaterThan(0);
    expect(gapWidth("auto", 160, idle)).toBe(idle + 48);
  });
  it("Auto is none while the island is off or hidden", () => {
    expect(islandIdleWidth({ ...ISLAND_DEFAULTS, enabled: false }, { width: 1920, height: 480 })).toBe(0);
    expect(islandIdleWidth({ ...ISLAND_DEFAULTS, idle: "hidden" }, { width: 1920, height: 480 })).toBe(0);
    expect(islandIdleWidth(undefined, { width: 1920, height: 480 })).toBe(0);
    expect(gapWidth("auto", 160, 0)).toBe(0);
  });
  it("Off is none and Custom is clamped to 80-400", () => {
    expect(gapWidth("off", 160, idle)).toBe(0);
    expect(gapWidth("custom", 20, 0)).toBe(80);
    expect(gapWidth("custom", 999, 0)).toBe(400);
    expect(gapWidth("custom", 200, 0)).toBe(200);
  });
});

describe("island gap placement", () => {
  it("centres on the page, not on the bar", () => {
    // a bar from 100 to 700 on a page centred at 500: the gap sits 400 from the bar's left, not at its middle (300)
    expect(gapPlacement({ barLeft: 100, barWidth: 600, pageCentre: 500, width: 100 })).toEqual({ left: 350, width: 100 });
  });
  it("is ignored when it is not wholly inside the bar", () => {
    expect(gapPlacement({ barLeft: 0, barWidth: 300, pageCentre: 500, width: 100 })).toBeNull();
    expect(gapPlacement({ barLeft: 480, barWidth: 300, pageCentre: 500, width: 100 })).toBeNull();
    expect(gapPlacement({ barLeft: 0, barWidth: 1000, pageCentre: 500, width: 0 })).toBeNull();
  });
});

describe("narrow bar", () => {
  const slots = { left: ["a", "b"], center: ["c", "d"], right: ["e", "f", "g"] };
  const cost = () => 10;
  it("keeps everything that fits", () => {
    expect(fitSlots(slots, 70, cost)).toEqual(slots);
  });
  it("drops from the slot with more items, at its outer end, the right first on a tie", () => {
    expect(fitSlots(slots, 60, cost)).toEqual({ left: ["a", "b"], center: ["c", "d"], right: ["e", "f"] });
    expect(fitSlots(slots, 50, cost)).toEqual({ left: ["a", "b"], center: ["c", "d"], right: ["e"] });
    expect(fitSlots(slots, 40, cost)).toEqual({ left: ["b"], center: ["c", "d"], right: ["e"] });
  });
  it("keeps the centre however narrow", () => {
    expect(fitSlots(slots, 5, cost)).toEqual({ left: [], center: ["c", "d"], right: [] });
  });
  it("splits the centre around the gap, the odd one to the left", () => {
    expect(splitCenter(["c", "d", "e"])).toEqual([["c", "d"], ["e"]]);
  });
});

describe("item display", () => {
  it("tells wireless from wired", () => {
    expect(isWifi("wifi")).toBe(true);
    expect(isWifi("Intel Wi-Fi 6 AX200")).toBe(true);
    expect(isWifi("ethernet")).toBe(false);
  });
  it("shows a glyph item's icon only unless set to values", () => {
    const volume = { icon: "volume_up", value: "40%", glyph: true };
    expect(shownOf(volume, "both")).toEqual({ icon: true, value: undefined });
    expect(shownOf(volume, "value")).toEqual({ icon: false, value: "40%" });
    expect(shownOf({ icon: "memory", value: "12%" }, "both")).toEqual({ icon: true, value: "12%" });
    expect(shownOf({ icon: "memory", value: "12%" }, "icon")).toEqual({ icon: true, value: undefined });
    expect(shownOf({ value: "14:05" }, "icon")).toEqual({ icon: false, value: "14:05" });
  });
});

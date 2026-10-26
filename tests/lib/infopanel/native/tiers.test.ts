import { describe, expect, it } from "vitest";
import { modules } from "../../../../src/modules/index.ts";
import { choicesFor, MODULE_TIERS, notCompatible, PANEL_KIND_TIERS, tierOf } from "../../../../src/lib/infopanel/native/tiers.ts";

/** Every panel widget kind; a new `WidgetKind` fails the type of `PANEL_KIND_TIERS` and this list together. */
const KINDS = ["stat", "value", "bar", "gauge", "customGauge", "sparkline", "table", "text", "image", "clock", "shape"] as const;

describe("tiers", () => {
  it("has an entry for every panel widget kind", () => {
    expect(Object.keys(PANEL_KIND_TIERS).sort()).toEqual([...KINDS].sort());
  });

  it("has an entry for every registered module, and none for a module that isn't there", () => {
    const ids = modules.map((m) => m.id);
    expect(ids.filter((id) => !(id in MODULE_TIERS))).toEqual([]);
    expect(Object.keys(MODULE_TIERS).filter((id) => !ids.includes(id))).toEqual([]);
  });

  it("marks the widgets that are not InfoPanel data native-only, each with a reason, left out unless a snapshot is picked", () => {
    const only = Object.entries(MODULE_TIERS).filter(([, e]) => e.tier === "native-only");
    expect(only.map(([id]) => id).sort()).toEqual(["BottleneckLens", "CodingAgents", "Countdown", "DayPlanner", "FrameHistogram", "OnAirBeacon", "RadialClockStack", "SessionStats", "ThresholdTimeline", "Timer", "WaveLink", "WebPage"]);
    for (const [, e] of only) {
      expect(e.reason).toBeTruthy();
      expect(choicesFor(e)).toEqual(["leave", "snapshot"]);
    }
    expect(notCompatible("Countdown")).toBe("Countdown isn't compatible with InfoPanel and is left out");
  });

  it("defaults a built module to recreate and an unbuilt one to a snapshot, and never offers a live image", () => {
    expect(choicesFor(tierOf("CpuMonitor"))).toEqual(["recreate", "snapshot", "leave"]);
    expect(choicesFor({ tier: "native", built: false })).toEqual(["snapshot", "leave"]);
  });
});

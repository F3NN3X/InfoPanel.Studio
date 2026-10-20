import { describe, expect, it } from "vitest";
import type { DashboardModule } from "@/modules/types";
import { TEMPLATE_MODULES } from "@/widgets/registry";
import { createIslandBus } from "@/lib/island/bus";
import { ISLAND_SETTING, runDataFeeds, storeSource, type IslandSourceDef } from "@/lib/island/sources";
import { fakeClock } from "@/lib/island/test-clock";

describe("widgets as island sources", () => {
  it("gives the source widgets a Send to island setting, off by default", () => {
    const withIsland = TEMPLATE_MODULES.filter((m) => m.island).map((m) => m.id).sort();
    expect(withIsland).toEqual([
      "Achievements",
      "DriveSpace",
      "FpsMonitor",
      "NetworkAdapters",
      "NetworkThroughput",
      "Notifications",
      "NowPlaying",
      "SteamFriends",
      "SteamNews",
      "Timer",
      "VolumeMixer",
      "WaveLink",
      "Weather",
    ]);
    for (const m of TEMPLATE_MODULES.filter((m) => m.island)) {
      expect(m.settings?.find((s) => s.key === ISLAND_SETTING)).toMatchObject({ type: "boolean", default: false, group: m.island!.group });
    }
    expect(TEMPLATE_MODULES.find((m) => m.id === "Clock")?.settings?.some((s) => s.key === ISLAND_SETTING)).toBe(false);
  });

});

describe("the data feed pass", () => {
  const derive = (prev: unknown, next: Record<string, unknown>) => ({
    notices: prev ? [{ id: "n", severity: "info" as const, title: String(next["x.v"]), ttl: 1000 }] : [],
    activity: { id: "a", title: `now ${String(next["x.v"])}` },
  });
  const mod = {
    id: "W",
    title: "W",
    prefixes: ["x."],
    render: () => null,
    island: { from: "data", hint: "", defaultOn: true, group: "W", derive } satisfies IslandSourceDef,
  } as DashboardModule & { island: IslandSourceDef };
  const feeds = [{ module: mod, settings: {} }];

  it("waits for the source's keys, takes the first data as the baseline, then raises changes", () => {
    const bus = createIslandBus(fakeClock().clock);
    const prev = new Map();
    runDataFeeds(bus, feeds as never, { "y.other": "1" }, prev);
    expect(prev.size).toBe(0);
    runDataFeeds(bus, feeds as never, { "x.v": "1" }, prev);
    expect(bus.getSnapshot()).toMatchObject({ expanded: null, activity: { source: "W", title: "now 1" } });
    runDataFeeds(bus, feeds as never, { "x.v": "2" }, prev);
    expect(bus.getSnapshot().expanded).toMatchObject({ source: "W", id: "n", title: "2" });
  });

});

describe("island options and store sources", () => {

  it("runs a store source over the current state first, then each new one, with the zone's settings", () => {
    let listener: ((n: number) => void) | null = null;
    const store = { getState: () => 1, subscribe: (fn: (n: number) => void) => ((listener = fn), () => (listener = null)) };
    const seen: [number | null, number, unknown][] = [];
    const def = storeSource<number>({ store, hint: "", defaultOn: false, group: "G", derive: (prev, next, settings) => (seen.push([prev, next, settings.k]), {}) });
    const updates: unknown[] = [];
    const stop = def.watch(() => ({ k: "v" }), (u) => updates.push(u));
    listener!(2);
    stop();
    expect(seen).toEqual([
      [null, 1, "v"],
      [1, 2, "v"],
    ]);
    expect(updates).toHaveLength(2);
    expect(listener).toBeNull();
  });
});

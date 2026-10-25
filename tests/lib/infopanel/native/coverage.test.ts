import { describe, expect, it } from "vitest";
import { defaultPalette } from "../../../../src/lib/infopanel/elements/palette.ts";
import type { ConvertContext } from "../../../../src/lib/infopanel/native/items.ts";
import { CONVERTERS } from "../../../../src/lib/infopanel/native/modules/index.ts";
import { coverage, MODULE_TIERS } from "../../../../src/lib/infopanel/native/tiers.ts";
import type { DataApiValue } from "../../../../src/lib/infopanel/sensors.ts";
import { fixtureSensors } from "../../../../src/widgets/__fixtures__/index.ts";

/** Modules whose values are tagged in the shared primitives and read from the page (`decompose.ts`). */
const DECOMPOSED = ["CpuMonitor", "GpuMonitor", "MemoryUsage"];

/**
 * Known gaps: modules the spike marks recreatable that this build doesn't recreate. Each needs a reason. Empty means
 * every recreatable module is built; a module added here is a gap on purpose, to be closed, not a way round the guard.
 */
const KNOWN_GAPS: Record<string, string> = {};

/**
 * Modules whose plugin isn't in the captured snapshot (`src/widgets/__fixtures__`), so their converter finds nothing to
 * build there. They run against a synthetic Data API in `modules.test.ts` or the native import-check case instead.
 */
const NO_DATA_IN_SNAPSHOT: Record<string, string> = {
  CoreHeatmap: "the snapshot has no refs, which the Cores element needs; covered by modules.test.ts",
  DriveSpace: "the snapshot has no refs for the drives; covered by modules.test.ts",
  StorageHealth: "the same drives as Drive Space; covered by modules.test.ts",
  Notifications: "the Notifications plugin wasn't running; covered by modules.test.ts",
};

const look = { Font: "Segoe UI", FontSize: 20, Color: "#FFFFFFFF", BackgroundColor: "#FF101010" };
const sensors = fixtureSensors() as unknown as Record<string, DataApiValue>;
const ctx = (): ConvertContext => ({ look, palette: defaultPalette(look), sensors, notes: [] });
const box = { x: 0, y: 0, w: 480, h: 240 };

describe("recreate coverage", () => {
  const recreatable = Object.entries(MODULE_TIERS).filter(([, e]) => e.tier !== "native-only");

  it("every recreatable module is built, or listed as a known gap with a reason", () => {
    const unbuilt = recreatable.filter(([id, e]) => !e.built && !(id in KNOWN_GAPS)).map(([id]) => id);
    expect(unbuilt).toEqual([]);
    for (const [id, why] of Object.entries(KNOWN_GAPS)) expect(why, id).toBeTruthy();
  });

  it("a built module has a converter or is decomposed from its tags, so built means it converts", () => {
    const missing = recreatable.filter(([id, e]) => e.built && !CONVERTERS[id] && !DECOMPOSED.includes(id)).map(([id]) => id);
    expect(missing).toEqual([]);
  });

  it("each converter runs against the captured sensors without throwing, and most find their readings", () => {
    const empty: string[] = [];
    for (const [id, convert] of Object.entries(CONVERTERS)) {
      // The widgets that read a sensor of the user's choosing are given one.
      const items = convert(box, ctx(), { sensor: Object.keys(sensors)[0], sensors: "" });
      if (items.length === 0) empty.push(id);
    }
    expect(empty.filter((id) => !(id in NO_DATA_IN_SNAPSHOT))).toEqual([]);
  });

  it("lists every module once in the coverage table, with a reason for each snapshot and left-out widget", () => {
    const table = coverage();
    expect(table).toHaveLength(Object.keys(MODULE_TIERS).length);
    for (const row of table) {
      expect(["recreated", "snapshot", "native-only"]).toContain(row.outcome);
      if (row.outcome !== "recreated") expect(row.reason, row.id).toBeTruthy();
    }
  });
});

import { describe, expect, it } from "vitest";
import { readAdaptersFlat, readCpuFlat, readSystemFlat } from "@/lib/system-metrics";
import { fixtureSensors } from "@/widgets/__fixtures__";
import { hw } from "@/widgets/core/data";
import { readings } from "@/widgets/shared/hardware-readings";
import { toFlat, toNames } from "@/widgets/shared/data-adapter";
import { DEVICE_SOURCES, deviceItems, SOURCE_FIELDS, sourceKeys } from "@/widgets/recipe/sources";

// The device sources a Repeat runs over (Phase F, G38), on the captured readings the e2e servers serve: each lists what the built-ins'
// own enumeration lists, in its order, with fields that are readings with their units; and the keys a save keeps are enough for the
// Sample to list the same items.

const data = toFlat(fixtureSensors());
const names = toNames(fixtureSensors());

describe("device sources", () => {
  it("drives: one per drive SystemOverview lists, with its used space and temperature", () => {
    const items = deviceItems("drives", data, names);
    expect(items).toHaveLength(readSystemFlat(data, names).disks.length);
    expect(items.map((i) => i.name)).toEqual(["Kingston", "WDC"]);
    expect(items[0]).toMatchObject({ model: "Kingston SFYRD2000G", used: expect.stringMatching(/^46\.9\d* %$/), temp: expect.stringMatching(/ °C$/) });
    // the Data API's rates are bytes per second (B20)
    expect(String(items[0].read)).toMatch(/ B\/s$/);
  });

  it("cores: the first CPU's threads in thread order, as Core Heatmap draws them", () => {
    const items = deviceItems("cores", data, names);
    const cpu = readCpuFlat(data, hw(data).cpu!);
    expect(items).toHaveLength(cpu.cores.length);
    expect(items).toHaveLength(32);
    expect(items[0]).toEqual({ name: "Core 1", load: `${cpu.cores[0]} %` });
    expect(items[31].name).toBe("Core 32");
  });

  it("fans: every fan reading in RPM, as Thermals lists them; a fan at 0 and a duty in % are left out", () => {
    const items = deviceItems("fans", data, names);
    expect(items.map((i) => i.name)).toEqual(readings(data, names).filter((r) => r.kind === "fan" && r.unit === "RPM").map((r) => r.label));
    expect(items.every((i) => String(i.rpm).endsWith(" RPM"))).toBe(true);
    expect(items.some((i) => String(i.name).includes("Embedded Controller"))).toBe(false);
    expect(items.length).toBeGreaterThanOrEqual(4);
  });

  it("adapters and GPUs: each adapter's rates, each GPU's readings with the preferred one first", () => {
    const adapters = deviceItems("adapters", data, names);
    expect(adapters).toHaveLength(readAdaptersFlat(data, names).length);
    expect(String(adapters[0].down)).toMatch(/ B\/s$/);
    const gpus = deviceItems("gpus", data, names);
    expect(gpus).toHaveLength(1);
    expect(gpus[0]).toMatchObject({ name: "NVIDIA GeForce RTX 5090", load: expect.stringMatching(/ %$/), temp: expect.stringMatching(/ °C$/), vram: expect.stringMatching(/ MB$/) });
  });

  it("every item's fields are its source's, and nothing is listed without data", () => {
    for (const source of DEVICE_SOURCES) {
      for (const item of deviceItems(source, data, names)) for (const f of Object.keys(item)) expect(SOURCE_FIELDS[source], `${source} ${f}`).toContain(f);
      expect(deviceItems(source, undefined)).toEqual([]);
      expect(deviceItems(source, {})).toEqual([]);
    }
  });

  it("the keys a save keeps list the same items again (the builder's Sample)", () => {
    for (const source of DEVICE_SOURCES) {
      const kept = Object.fromEntries(sourceKeys(source, data).map((k) => [k, data[k]]));
      expect(deviceItems(source, kept).length, source).toBe(deviceItems(source, data).length);
      expect(Object.keys(kept).length, source).toBeLessThan(Object.keys(data).length / 2);
    }
  });
});

describe("found in Phase F", () => {
  // B26 (assigned to a later phase; fixing it changes SystemOverview's drive row): `readDisks` takes a drive's temperature from
  // `_temperature__N` or `_composite_temperature`, so a drive whose sensor is the bare `_temperature` (the WDC SATA drive here) has
  // none, in SystemOverview as in a Repeat over drives; Thermals reads that key. `it.fails` until it is fixed, then it becomes `it`.
  it("B26: the WDC drive has a bare temperature reading, and is listed", () => {
    expect(String(data["libre.wdc_wds100t2b0a_00sm50_temperature"])).toMatch(/ °C$/);
    expect(deviceItems("drives", data, names).find((i) => i.name === "WDC")).toBeDefined();
  });
  it.fails("B26: every drive with a temperature reading has a temp field", () => {
    expect(deviceItems("drives", data, names).find((i) => i.name === "WDC")?.temp).toBeDefined();
  });
});

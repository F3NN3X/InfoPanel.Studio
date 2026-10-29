import { describe, expect, it } from "vitest";
import { ALIAS_RULES } from "@/lib/hwinfo-aliases";
import fixture from "../fixtures/hwinfo-names.json";

// The names and units HWiNFO uses, from public CSV logs and a live capture (`tools/hwinfo-names.mjs`, refreshed by hand).
type Names = Record<string, Record<string, number>>;
const sources: Names[] = [fixture.github.names, fixture.live.names];

/** name -> its units' counts over both sources. */
const known = new Map<string, Map<string, number>>();
for (const names of sources) {
  for (const [name, units] of Object.entries(names)) {
    const counts = known.get(name) ?? new Map<string, number>();
    for (const [unit, n] of Object.entries(units)) counts.set(unit, (counts.get(unit) ?? 0) + n);
    known.set(name, counts);
  }
}
const commonUnit = (name: string): string => [...known.get(name)!].sort((a, b) => b[1] - a[1])[0][0];

/**
 * Names the board rules match without being the reading: they pass on the unit, which the rule checks (a VRM is °C).
 * Anything else a rule matches in the fixture must carry a unit the rule accepts.
 */
const LOOSE = new Set(["VR VCC Current (SVID IOUT)"]);

describe("alias rules against HWiNFO's names", () => {
  it("accept the commonest unit of every known name they match", () => {
    const wrong = ALIAS_RULES.flatMap((rule) =>
      [...known.keys()]
        .filter((name) => rule.name.test(name) && !LOOSE.has(name))
        // a name can have a rule per unit (MB converts, GB stays): one accepting is enough
        .filter((name) => !ALIAS_RULES.some((r) => r.as === rule.as && r.name.source === rule.name.source && (!r.unit || r.unit.test(commonUnit(name)))))
        .map((name) => `${rule.as}: "${name}" is [${commonUnit(name)}], rule wants ${rule.unit}`),
    );
    expect(wrong).toEqual([]);
  });

  it("lists the aliases no known name confirms", () => {
    const unconfirmed = [...new Set(ALIAS_RULES.filter((rule) => ![...known.keys()].some((name) => rule.name.test(name))).map((rule) => rule.as))].sort();
    // a fixture refresh that confirms one of these fails here: move it out, and check its unit
    expect(unconfirmed).toEqual([
      "ccd1__tdie", "ccd2__tdie", "cpu_package", "gpu_core", "gpu_core_load", "gpu_core_voltage", "gpu_hot_spot", "gpu_memory", "gpu_memory_clock", "gpu_memory_controller", "gpu_memory_junction", "gpu_memory_used", "gpu_package", "gpu_video_engine", "power_on_hours", "temperature", "virtual_memory_memory_available", "virtual_memory_memory_used",
    ]);
  });
});

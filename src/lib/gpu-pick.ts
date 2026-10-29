/**
 * The GPU the hardware widgets read when there are several (a CPU's integrated graphics beside a card): the one with the
 * most dedicated memory, and never an integrated one while a discrete one is there. By key slug, so the readings
 * (`system-metrics.ts`) and the widgets' `hw()` agree.
 */

/** LibreHardwareMonitor's names for integrated graphics: "AMD Radeon(TM) Graphics", "Intel(R) UHD Graphics 770", "Intel Iris Xe". */
const INTEGRATED = /(^|_)(radeon_tm__graphics|radeon_graphics|uhd_graphics|hd_graphics|iris)(_|$)|^intel_arc_graphics$/;

/** The id (key slug) to read among `ids`; `memory` is an id's dedicated memory in MB (NaN when unknown). */
export function preferredGpu(ids: readonly string[], memory: (id: string) => number): string | undefined {
  const score = (id: string) => (INTEGRATED.test(id) ? -1 : 0) * 1e9 + (Number.isFinite(memory(id)) ? memory(id) : 0);
  return [...ids].sort((a, b) => score(b) - score(a) || a.localeCompare(b))[0];
}

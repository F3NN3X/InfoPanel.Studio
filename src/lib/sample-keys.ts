/**
 * The built-in panels and the sample layout were drawn on one PC (a Ryzen 9 9950X3D, an RTX 5090, an adapter named
 * Ethernet, one Yr weather place). `onThisPc` points one of their keys at the same reading on this PC: its CPU, GPU and
 * busiest adapter, by role where the key differs between vendors (AMD's `_package` power is Intel's `_cpu_package_power`),
 * and its first Yr place; HWiNFO readings stand in, under their alias keys, where LibreHardwareMonitor has none (`hwinfo-aliases.ts`). A key
 * this PC has, or one with no match, is kept.
 */
import { getCatalog } from "@/lib/catalog";
import { withHwinfoAliases } from "@/lib/hwinfo-aliases";
import type { PanelDef } from "@/lib/layout";
import { sensorStore } from "@/lib/sensor-store";
import type { SensorMap } from "@/modules/types";

const SAMPLE_CPU = "libre.amd_ryzen_9_9950x3d_";
const SAMPLE_GPU = "libre.nvidia_geforce_rtx_5090_";
const SAMPLE_ADAPTER = "libre.ethernet_";
const YR = /^plugins\.yr-weather-plugin\.[^.]+\./;

/**
 * The sample CPU readings whose key differs by vendor: the keys that stand in for them, best first (AMD's, then Intel's
 * and HWiNFO's, as `system-metrics.ts` finds them; kept apart from it so the studio's entry stays small).
 */
const CPU_STAND_INS: Record<string, string[]> = {
  package: ["package", "cpu_package_power"],
  ccd1__tdie: ["ccd1__tdie", "core__tctl_tdie", "core__tctl", "cpu_package"],
  core__tctl_tdie: ["core__tctl_tdie", "core__tctl", "cpu_package"],
  cores__average_effective: ["cores__average_effective", "cores__average"],
};

/** What the studio has read of the Data API: the catalog and the live streams. */
export const liveSensors = (): SensorMap => ({ ...getCatalog().sensors, ...sensorStore.getValues() });

/** `key` (a sample key) as this PC's key for the same reading. */
export function onThisPc(key: string, live: SensorMap): string {
  const all = withHwinfoAliases(live);
  if (key in all) return key;
  const keys = Object.keys(all).sort();
  const id = (re: RegExp) => keys.map((k) => re.exec(k)?.[1]).find((x) => x !== undefined);
  const found = (k: string | undefined) => (k && k in all ? k : undefined);
  let next: string | undefined;
  if (key.startsWith(SAMPLE_CPU)) {
    const rest = key.slice(SAMPLE_CPU.length);
    const cpu = id(/^libre\.(.+)_cpu_total$/);
    for (const tail of CPU_STAND_INS[rest] ?? [rest]) next ??= found(cpu && `libre.${cpu}_${tail}`);
  } else if (key.startsWith(SAMPLE_GPU)) {
    next = found(`libre.${id(/^libre\.(.+)_gpu_core_load$/)}_${key.slice(SAMPLE_GPU.length)}`);
  } else if (key.startsWith(SAMPLE_ADAPTER)) {
    // the busiest adapter, as Network Traffic picks it
    const speed = (k: string) => (typeof all[k].value === "number" ? all[k].value! : -1);
    const adapter = keys.filter((k) => /^libre\..+_download_speed$/.test(k)).sort((a, b) => speed(b) - speed(a))[0]?.slice(6, -"_download_speed".length);
    next = found(adapter && `libre.${adapter}_${key.slice(SAMPLE_ADAPTER.length)}`);
  } else if (YR.test(key)) {
    const place = keys.find((k) => YR.test(k))?.match(YR)?.[0];
    next = found(place && key.replace(YR, place));
  }
  return next ?? key;
}

/** The panel with its widgets' keys on this PC (a new object; the panel is not changed). */
export function retargetPanel(panel: PanelDef, live: SensorMap): PanelDef {
  return { ...panel, widgets: panel.widgets.map((w) => (w.sensor ? { ...w, sensor: onThisPc(w.sensor, live) } : w)) };
}

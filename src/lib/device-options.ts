import { audioIds, deviceLabel, type Flow } from "@/widgets/audio-data";
import { detect, diskName, fmtRate, hw, pretty } from "@/widgets/core/data";
import type { DeviceKind, SensorMap } from "@/modules/types";

export interface DeviceOption {
  value: string;
  label: string;
  /** Audio devices: whether it plays (output) or records (input). */
  flow?: Flow;
}

const DRIVE_NAME = /^plugins\.drive-info-plugin\.([^.]+)\.name$/;

const text = (sensors: SensorMap, key: string): string => {
  const s = sensors[key];
  return s?.text ?? (s?.value !== undefined ? String(s.value) : "");
};

/**
 * The devices of one kind found in the live keys, "" (Auto) first. Values are the ids the widgets
 * match on (hardware slug, level-meter container, drive letter); a label is the sensor's display
 * name when it has one, else the id made readable.
 */
export function deviceOptions(kind: DeviceKind, sensors: SensorMap): DeviceOption[] {
  // `hw()` and `detect()` read keys only
  const data = Object.fromEntries(Object.keys(sensors).map((k) => [k, ""]));
  const auto: DeviceOption = { value: "", label: "Auto" };
  const slugs = (ids: (string | undefined)[]): DeviceOption[] =>
    ids.flatMap((id) => (id ? [{ value: id, label: pretty(id) }] : []));
  switch (kind) {
    case "cpu":
      return [auto, ...slugs(detect(data, /^libre\.(.+)_cpu_total$/))];
    case "gpu":
      return [auto, ...slugs(detect(data, /^libre\.(.+)_gpu_core_load$/))];
    case "disk":
      // the drive's volumes first ("C: Windows · Kingston SFYRD2000G"), so a drive is picked by its letter
      return [
        auto,
        ...hw(data).disks.map((id) => {
          const volumes = sensors[`libre.${id}_volumes`]?.text;
          return { value: id, label: volumes ? `${volumes} · ${diskName(id)}` : diskName(id) };
        }),
      ];
    case "adapter":
      return [auto, ...slugs(hw(data).adapters)];
    case "audio":
      return [
        auto,
        ...audioIds(data).map((id) => ({
          value: id,
          label: deviceLabel(id, text(sensors, `plugins.audio-level-meter.${id}.device-name`)) || id,
          flow: text(sensors, `plugins.audio-level-meter.${id}.data-flow`) === "input" ? ("input" as const) : ("output" as const),
        })),
      ];
    case "drive": {
      const ids = [...new Set(Object.keys(sensors).map((k) => k.match(DRIVE_NAME)?.[1]).filter((id): id is string => !!id))];
      return [
        auto,
        ...ids.map((id) => ({ value: id, label: text(sensors, `plugins.drive-info-plugin.${id}.name`) || id.toUpperCase() })),
      ];
    }
  }
}

/** What Auto picks, per kind (SPEC §4.5: stated in the picker, not hidden in a hint). */
export const AUTO_RULES: Readonly<Record<DeviceKind, string>> = {
  cpu: "First detected processor",
  gpu: "First detected GPU",
  disk: "First detected drive",
  drive: "First detected drive",
  adapter: "Busiest adapter",
  audio: "Loudest live device",
};

const reading = (sensors: SensorMap, key: string): number | undefined => {
  const v = Number(sensors[key]?.value);
  return sensors[key] !== undefined && Number.isFinite(v) ? v : undefined;
};

/** How busy a device is right now (what "busiest" / "loudest" compares), when its kind has a reading. */
function activity(kind: DeviceKind, id: string, sensors: SensorMap): number | undefined {
  switch (kind) {
    case "cpu":
      return reading(sensors, `libre.${id}_cpu_total`);
    case "gpu":
      return reading(sensors, `libre.${id}_gpu_core_load`);
    case "disk":
      return reading(sensors, `libre.${id}_composite_temperature`) ?? reading(sensors, `libre.${id}_temperature`);
    case "adapter": {
      const down = reading(sensors, `libre.${id}_download_speed`);
      const up = reading(sensors, `libre.${id}_upload_speed`);
      return down === undefined && up === undefined ? undefined : (down ?? 0) + (up ?? 0);
    }
    case "audio":
      return reading(sensors, `plugins.audio-level-meter.${id}.audio-level`);
    case "drive": {
      const used = reading(sensors, `plugins.drive-info-plugin.${id}.used_space`);
      const total = reading(sensors, `plugins.drive-info-plugin.${id}.total_size`);
      return used !== undefined && total ? (used / total) * 100 : undefined;
    }
  }
}

/** A device's live reading as the picker shows it ("34 %", "61 °C", "1.2 MB/s"); undefined without one. */
export function deviceReading(kind: DeviceKind, id: string, sensors: SensorMap): string | undefined {
  const v = activity(kind, id, sensors);
  if (v === undefined) return undefined;
  if (kind === "adapter") return fmtRate(v);
  if (kind === "disk") return `${Math.round(v)} °C`;
  return `${Math.round(v)} %`;
}

/** The device Auto picks right now (undefined: none found): the busiest adapter, the loudest audio device, else the first. */
export function autoDevice(kind: DeviceKind, sensors: SensorMap): string | undefined {
  const ids = deviceOptions(kind, sensors).flatMap((o) => (o.value ? [o.value] : []));
  if (kind !== "adapter" && kind !== "audio") return ids[0];
  const ranked = ids.map((id) => [id, activity(kind, id, sensors) ?? -Infinity] as const).sort((a, b) => b[1] - a[1]);
  return ranked[0]?.[0];
}

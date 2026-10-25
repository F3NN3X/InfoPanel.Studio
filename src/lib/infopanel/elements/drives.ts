/**
 * The Drives element's sensors: one set per drive, found in the live Data API by its native ref.
 * LibreHardwareMonitor names a drive "/<nvme|ssd|hdd>/<n>/…": "Used Space" (a load, %), "Free Space"
 * (data, GB) and the "Composite Temperature" (or the first temperature). The drive's name is the
 * sensor name without its trailing "Used Space" or "Free Space".
 *
 * HWiNFO (best effort, written from how it names things, not from a capture): its drive groups are
 * "Drive: <model>" and "S.M.A.R.T.: <model>", with readings "Drive Temperature", "Total Activity",
 * "Drive Remaining Life", "Read Rate" and "Write Rate". The Data API joins group and reading in the
 * name; a separator of "·", "-" or ":" or a space is accepted. HWiNFO reports no used space for a
 * drive, so its tile's bar and percent read "Total Activity", and it has no free space.
 */
import type { ChosenSensor } from "../editor/bind.ts";
import type { DataApiValue } from "../sensors.ts";

export interface DriveSensors {
  /** The drive's device path ("/nvme/2"). */
  id: string;
  name: string;
  used?: ChosenSensor;
  free?: ChosenSensor;
  temp?: ChosenSensor;
}

const REF = /^libre:(\/(?:nvme|ssd|hdd)\/(\d+))\/(load|data|temperature)\/(\d+)$/i;

const chosen = (key: string, v: DataApiValue): ChosenSensor => ({ key, name: v.name ?? key, ...(v.unit ? { unit: v.unit } : {}), ...(v.ref ? { ref: v.ref } : {}) });

const HWINFO = /^(?:S\.M\.A\.R\.T\.|Drive):\s*(.+?)\s*(?:[·:-]\s*|\s)(Drive Temperature|Total Activity|Drive Remaining Life|Read Rate|Write Rate)$/i;

/** HWiNFO's drives by model, in the order they first appear. */
function hwinfoDrives(sensors: Readonly<Record<string, DataApiValue>>): DriveSensors[] {
  const byModel = new Map<string, DriveSensors>();
  for (const [key, v] of Object.entries(sensors)) {
    const m = v.name ? HWINFO.exec(v.name.trim()) : null;
    if (!m || (v.ref && !/^hwinfo:/i.test(v.ref))) continue;
    const drive = byModel.get(m[1].toLowerCase()) ?? { id: `hwinfo:${m[1]}`, name: m[1] };
    const reading = m[2].toLowerCase();
    if (reading === "drive temperature") drive.temp ??= chosen(key, v);
    else if (reading === "total activity") drive.used ??= chosen(key, v);
    byModel.set(m[1].toLowerCase(), drive);
  }
  return [...byModel.values()].filter((d) => d.used || d.temp);
}

/** The machine's drives in device order (LibreHardwareMonitor's, then HWiNFO's); empty when none are found. */
export function detectDrives(sensors: Readonly<Record<string, DataApiValue>>): DriveSensors[] {
  const byId = new Map<string, DriveSensors & { n: number; tempIndex: number }>();
  for (const [key, v] of Object.entries(sensors)) {
    const m = v.ref ? REF.exec(v.ref) : null;
    const name = v.name?.trim();
    if (!m || !name) continue;
    const [, id, n, kind, index] = m;
    const drive = byId.get(id) ?? { id, name: name, n: Number(n), tempIndex: Infinity };
    const base = (suffix: RegExp) => name.replace(suffix, "").trim();
    if (kind === "load" && /Used Space$/i.test(name)) Object.assign(drive, { used: chosen(key, v), name: base(/\s*Used Space$/i) });
    else if (kind === "data" && /Free Space$/i.test(name)) {
      Object.assign(drive, { free: chosen(key, v) });
      if (!drive.used) drive.name = base(/\s*Free Space$/i);
    } else if (kind === "temperature" && Number(index) < drive.tempIndex && !/(Warning|Critical)/i.test(name)) Object.assign(drive, { temp: chosen(key, v), tempIndex: Number(index) });
    byId.set(id, drive);
  }
  const libre = [...byId.values()]
    .filter((d) => d.used || d.free)
    .sort((a, b) => a.n - b.n)
    .map(({ n: _n, tempIndex: _t, ...drive }) => drive);
  return libre.length ? libre : hwinfoDrives(sensors);
}

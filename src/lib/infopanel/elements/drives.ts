/**
 * The Drives element's sensors: one set per drive, found in the live Data API by its native ref.
 * LibreHardwareMonitor names a drive "/<nvme|ssd|hdd>/<n>/…": "Used Space" (a load, %), "Free Space"
 * (data, GB) and the "Composite Temperature" (or the first temperature). The drive's name is the
 * sensor name without its trailing "Used Space" or "Free Space".
 *
 * HWiNFO, from a real capture: a drive is two devices of one instance number, "S.M.A.R.T.: <model>"
 * (sensor id 4026532096, with "Drive Temperature") and "Drive: <model>" (4026532097, with "Total
 * Activity"). The readings carry no device in their names, so drives pair by instance, and the name
 * is the device's (from the Data API's HWiNFO tree) without its "S.M.A.R.T.:" or "Drive:" prefix, else
 * "Drive 1", "Drive 2". HWiNFO reports no used space for a drive, so its tile's bar and percent read
 * "Total Activity", and it has no free space.
 */
import type { ApiHwinfoDevice } from "../../catalog.ts";
import type { ChosenSensor } from "../editor/bind.ts";
import { fixUnit, type DataApiValue } from "../sensors.ts";

export interface DriveSensors {
  /** The drive's device path ("/nvme/2"). */
  id: string;
  name: string;
  used?: ChosenSensor;
  free?: ChosenSensor;
  temp?: ChosenSensor;
}

const REF = /^libre:(\/(?:nvme|ssd|hdd)\/(\d+))\/(load|data|temperature)\/(\d+)$/i;

const chosen = (key: string, v: DataApiValue): ChosenSensor => ({ key, name: v.name ?? key, ...(v.unit ? { unit: fixUnit(v.unit) } : {}), ...(v.ref ? { ref: v.ref } : {}) });

const HWINFO_REF = /^hwinfo:(-?\d+)\/(\d+)\/(\d+)\/\d+$/i;
const SMART = 4026532096;
const DRIVE = 4026532097;

/** HWiNFO's drives by instance, in instance order. */
function hwinfoDrives(sensors: Readonly<Record<string, DataApiValue>>, devices: readonly ApiHwinfoDevice[]): DriveSensors[] {
  const byInstance = new Map<string, DriveSensors & { remote: number; instance: number }>();
  for (const [key, v] of Object.entries(sensors)) {
    const m = v.ref ? HWINFO_REF.exec(v.ref) : null;
    const name = v.name?.trim();
    if (!m || (Number(m[2]) !== SMART && Number(m[2]) !== DRIVE)) continue;
    const reading = name === "Drive Temperature" ? "temp" : name === "Total Activity" ? "used" : null;
    if (!reading) continue;
    const id = `hwinfo:${m[1]}/${m[3]}`;
    const drive = byInstance.get(id) ?? { id, name: "", remote: Number(m[1]), instance: Number(m[3]) };
    drive[reading] ??= chosen(key, v);
    byInstance.set(id, drive);
  }
  return [...byInstance.values()]
    .sort((a, b) => a.remote - b.remote || a.instance - b.instance)
    .map(({ remote, instance, ...drive }, i) => {
      const device = [SMART, DRIVE].map((sensorId) => devices.find((d) => d.id === `${remote}/${sensorId}/${instance}`)?.name).find(Boolean);
      return { ...drive, name: device?.replace(/^(?:S\.M\.A\.R\.T\.|Drive):\s*/i, "").trim() || `Drive ${i + 1}` };
    });
}

/** The machine's drives in device order (LibreHardwareMonitor's, then HWiNFO's); empty when none are found. */
export function detectDrives(sensors: Readonly<Record<string, DataApiValue>>, hwinfo: readonly ApiHwinfoDevice[] = []): DriveSensors[] {
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
  return libre.length ? libre : hwinfoDrives(sensors, hwinfo);
}

/**
 * A drive's name for a tile's one line: a leading vendor word goes when a model follows ("WDC WDS100T2B0A-00SM50" is
 * "WDS100T2B0A-00SM50"; a word is a vendor when it has no digit and a later word does), and a trailing " #n" moves to
 * the front ("#2 SFYRD2000G") so a second drive of one model stays apart and survives the ellipsis.
 */
export function shortDriveName(name: string): string {
  const index = /\s+#(\d+)$/.exec(name.trim());
  const words = name.trim().replace(/\s+#\d+$/, "").split(/\s+/).filter(Boolean);
  const body = words.length > 1 && !/\d/.test(words[0]) && words.slice(1).some((w) => /\d/.test(w)) ? words.slice(1) : words;
  return (index ? `#${index[1]} ` : "") + body.join(" ");
}

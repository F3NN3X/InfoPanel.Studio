/**
 * The sensors a profile template reads, by role ("CPU load", "GPU temperature"), found in the live
 * Data API. Each role has rules in order of trust: the native `ref` first (LibreHardwareMonitor
 * identifiers and plugin ids), then the sensor's name and unit, as LibreHardwareMonitor and HWiNFO
 * name them, for Data API builds that report no refs. The first rule that matches anything wins;
 * among its matches, a sensor with a ref comes first (it exports natively), then key order. Network
 * speeds skip virtual adapters and take the busiest one. A role nothing matches stays unbound.
 */
import type { ChosenSensor } from "../editor/bind.ts";
import type { DataApiValue } from "../sensors.ts";

export const ROLES = [
  "cpu.load", "cpu.temp", "cpu.clock", "cpu.power",
  "gpu.load", "gpu.temp", "gpu.clock", "gpu.power",
  "ram.load", "ram.used", "disk.load", "disk.temp",
  "net.down", "net.up", "uptime", "clock.second",
] as const;
export type Role = (typeof ROLES)[number];

export interface RoleInfo {
  /** The item's name and the Remap row's, in plain words. */
  label: string;
  /** The sensor's usual unit; a value shows the sensor's own unless `scaled`. */
  unit: string;
  /** The range a ring or bar covers. */
  min: number;
  max: number;
  /** Decimals shown. */
  precision: number;
  /** Shown divided by `divide` in `unit` instead of the sensor's own (KB/s as MB/s). */
  scaled?: { divide: number; unit: string };
  /** Warning and critical thresholds (InfoPanel's Threshold1 and 2); none for rates and clocks. */
  warn?: number;
  crit?: number;
}

export const ROLE_INFO: Record<Role, RoleInfo> = {
  "cpu.load": { label: "CPU load", unit: "%", min: 0, max: 100, precision: 0, warn: 80, crit: 95 },
  "cpu.temp": { label: "CPU temperature", unit: "°C", min: 0, max: 100, precision: 0, warn: 75, crit: 90 },
  "cpu.clock": { label: "CPU clock", unit: "MHz", min: 0, max: 6000, precision: 0 },
  "cpu.power": { label: "CPU power", unit: "W", min: 0, max: 250, precision: 0 },
  "gpu.load": { label: "GPU load", unit: "%", min: 0, max: 100, precision: 0, warn: 90, crit: 98 },
  "gpu.temp": { label: "GPU temperature", unit: "°C", min: 0, max: 100, precision: 0, warn: 75, crit: 85 },
  "gpu.clock": { label: "GPU clock", unit: "MHz", min: 0, max: 3200, precision: 0 },
  "gpu.power": { label: "GPU power", unit: "W", min: 0, max: 450, precision: 0 },
  "ram.load": { label: "RAM load", unit: "%", min: 0, max: 100, precision: 0, warn: 85, crit: 95 },
  "ram.used": { label: "RAM used", unit: "GB", min: 0, max: 64, precision: 1 },
  "disk.load": { label: "Disk activity", unit: "%", min: 0, max: 100, precision: 0 },
  "disk.temp": { label: "Disk temperature", unit: "°C", min: 0, max: 80, precision: 0, warn: 60, crit: 70 },
  "net.down": { label: "Download", unit: "KB/s", min: 0, max: 100000, precision: 1, scaled: { divide: 1024, unit: "MB/s" } },
  "net.up": { label: "Upload", unit: "KB/s", min: 0, max: 100000, precision: 1, scaled: { divide: 1024, unit: "MB/s" } },
  uptime: { label: "Uptime", unit: "", min: 0, max: 100, precision: 0 },
  "clock.second": { label: "Clock second", unit: "", min: 0, max: 59, precision: 0 },
};

/** One way to recognise a role's sensor: every pattern given must match. */
interface Rule {
  ref?: RegExp;
  name?: RegExp;
  unit?: string;
}

const CPU = String.raw`^libre:\/[a-z]*cpu\/0\/`;
const GPU = String.raw`^libre:\/gpu-[a-z]+\/0\/`;
const DISK = String.raw`^libre:\/(?:nvme|ssd|hdd)\/\d+\/`;
const re = (s: string) => new RegExp(s, "i");

const RULES: Record<Role, readonly Rule[]> = {
  "cpu.load": [{ ref: re(CPU + "load/0$") }, { name: /\bCPU Total$/i, unit: "%" }, { name: /^Total CPU Usage$/i }, { name: /^CPU Load$/i }],
  "cpu.temp": [
    { ref: re(CPU + "temperature/"), name: /(Tctl\/Tdie\)|\bPackage)$/i },
    { name: /^(?!.*GPU).*(Core \(Tctl\/Tdie\)|CPU Package)$/i, unit: "°C" },
    { name: /^(CPU \(Tctl\/Tdie\)|CPU Package|CPU Package Temp|CPU Die \(average\))$/i },
    { ref: re(CPU + "temperature/") },
  ],
  "cpu.clock": [
    { ref: re(CPU + "clock/"), name: /Cores \(Average\)$/i },
    { name: /^(?!.*GPU).*Cores \(Average\)$/i, unit: "MHz" },
    { name: /^(Core Clocks \(avg\)|Average Effective Clock)$/i },
    { ref: re(CPU + "clock/1$") },
  ],
  "cpu.power": [
    { ref: re(CPU + "power/0$") },
    { name: /^(?!.*GPU).*\bPackage$/i, unit: "W" },
    { name: /^CPU Package Power$/i },
  ],
  "gpu.load": [{ ref: re(GPU + "load/0$") }, { name: /\bGPU Core$/i, unit: "%" }, { name: /^(GPU Core Load|GPU Utilization|GPU D3D Usage)$/i }],
  "gpu.temp": [{ ref: re(GPU + "temperature/0$") }, { name: /\bGPU Core$/i, unit: "°C" }, { name: /^GPU Temperature$/i }],
  "gpu.clock": [{ ref: re(GPU + "clock/0$") }, { name: /\bGPU Core$/i, unit: "MHz" }, { name: /^GPU Clock$/i }],
  "gpu.power": [
    { ref: re(GPU + "power/0$") },
    { name: /\bGPU (Package|Power)$/i, unit: "W" },
    { name: /^(GPU Power|GPU Package Power|Total Board Power)$/i, unit: "W" },
  ],
  "ram.load": [
    { ref: /^libre:\/ram\/load\/0$/i },
    { name: /^(?!.*(Virtual|GPU|D3D)).*\bMemory$/i, unit: "%" },
    { name: /^Physical Memory Load$/i },
    { name: /^RAM Load$/i },
  ],
  "ram.used": [{ ref: /^libre:\/ram\/data\/0$/i }, { name: /^(?!.*(Virtual|GPU|D3D)).*\bMemory Used$/i, unit: "GB" }, { name: /^Physical Memory Used$/i }],
  "disk.load": [{ ref: re(DISK + "load/"), name: /Total Activity$/i }, { name: /\bTotal Activity$/i, unit: "%" }],
  "disk.temp": [
    { ref: re(DISK + "temperature/0$") },
    { name: /\bComposite Temperature$/i, unit: "°C" },
    { name: /^(Drive Temperature|SSD Temperature)$/i },
  ],
  "net.down": [{ ref: /^libre:\/nic\/.+\/throughput\/8$/i }, { name: /\bDownload Speed$/i }, { name: /^Current DL rate$/i }],
  "net.up": [{ ref: /^libre:\/nic\/.+\/throughput\/7$/i }, { name: /\bUpload Speed$/i }, { name: /^Current UP rate$/i }],
  uptime: [{ ref: /^plugin:\/.+\/uptime\/formatted$/i }, { name: /^Uptime · Formatted$/i }, { name: /^(System )?Uptime$/i }],
  // InfoPanel's clock plugin; the Data API names it "Clock · Second" (the dot may arrive mangled).
  "clock.second": [{ ref: /^plugin:\/clock-plugin\/clock\/second$/i }, { name: /^Clock\W+Second$/i }],
};

/** Adapters that aren't the machine's own link (virtual switches, VPNs, Bluetooth). */
const VIRTUAL_NIC = /vEthernet|Bluetooth|Tailscale|ZeroTier|Loopback|VPN|Hyper-V|WSL|Npcap|VirtualBox|VMware/i;

const matches = (rule: Rule, v: DataApiValue): boolean =>
  (!rule.ref || (v.ref !== undefined && rule.ref.test(v.ref))) &&
  (!rule.name || (v.name !== undefined && rule.name.test(v.name.trim()))) &&
  (rule.unit === undefined || (v.unit ?? "") === rule.unit);

const byKey = new Intl.Collator("en", { numeric: true }).compare;

/** The sensor a role reads, or undefined when nothing on this machine matches. */
export function resolveRole(role: Role, sensors: Readonly<Record<string, DataApiValue>>): ChosenSensor | undefined {
  const net = role === "net.down" || role === "net.up";
  const entries = Object.entries(sensors).filter(([, v]) => !net || !VIRTUAL_NIC.test(v.name ?? ""));
  for (const rule of RULES[role]) {
    const hits = entries.filter(([, v]) => matches(rule, v));
    if (hits.length === 0) continue;
    const value = (v: DataApiValue) => (typeof v.value === "number" ? v.value : -1);
    hits.sort(([ka, a], [kb, b]) => Number(!a.ref) - Number(!b.ref) || (net ? value(b) - value(a) : 0) || byKey(ka, kb));
    const [key, v] = hits[0];
    return { key, name: v.name ?? key, ...(v.unit ? { unit: v.unit } : {}), ...(v.ref ? { ref: v.ref } : {}) };
  }
  return undefined;
}

/** Every role's sensor that can be found. */
export function resolveRoles(sensors: Readonly<Record<string, DataApiValue>>, roles: readonly Role[] = ROLES): Map<Role, ChosenSensor> {
  const out = new Map<Role, ChosenSensor>();
  for (const role of roles) {
    const s = resolveRole(role, sensors);
    if (s) out.set(role, s);
  }
  return out;
}

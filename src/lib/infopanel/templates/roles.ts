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
  "fps", "fps.low1", "fps.low01", "frametime",
  "vram.used", "vram.total", "vram.temp",
  "gpu.memclock", "gpu.hotspot", "gpu.fan", "gpu.volt",
  "ram.total", "ram.free", "disk.free",
  "cpu.maxcore", "cpu.ccd1", "cpu.ccd2",
  "psu.12v", "ups.power", "ram.speed",
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
  fps: { label: "FPS", unit: "FPS", min: 0, max: 240, precision: 0 },
  "fps.low1": { label: "1% low FPS", unit: "FPS", min: 0, max: 240, precision: 0 },
  "fps.low01": { label: "0.1% low FPS", unit: "FPS", min: 0, max: 240, precision: 0 },
  frametime: { label: "Frame time", unit: "ms", min: 0, max: 50, precision: 1 },
  "vram.used": { label: "VRAM used", unit: "MB", min: 0, max: 32768, precision: 1, scaled: { divide: 1024, unit: "GB" } },
  "vram.total": { label: "VRAM total", unit: "MB", min: 0, max: 32768, precision: 0, scaled: { divide: 1024, unit: "GB" } },
  "vram.temp": { label: "VRAM temperature", unit: "°C", min: 0, max: 120, precision: 0, warn: 85, crit: 100 },
  "gpu.memclock": { label: "GPU memory clock", unit: "MHz", min: 0, max: 15000, precision: 0 },
  "gpu.hotspot": { label: "GPU hot spot", unit: "°C", min: 0, max: 120, precision: 0, warn: 85, crit: 100 },
  "gpu.fan": { label: "GPU fan", unit: "RPM", min: 0, max: 4000, precision: 0 },
  "gpu.volt": { label: "GPU voltage", unit: "V", min: 0, max: 1.5, precision: 2 },
  "ram.total": { label: "RAM total", unit: "GB", min: 0, max: 128, precision: 0 },
  "ram.free": { label: "RAM free", unit: "GB", min: 0, max: 128, precision: 1 },
  "disk.free": { label: "Disk free", unit: "GB", min: 0, max: 4000, precision: 0 },
  "cpu.maxcore": { label: "CPU busiest core", unit: "%", min: 0, max: 100, precision: 0, warn: 80, crit: 95 },
  "cpu.ccd1": { label: "CPU CCD1 temperature", unit: "°C", min: 0, max: 100, precision: 0, warn: 75, crit: 90 },
  "cpu.ccd2": { label: "CPU CCD2 temperature", unit: "°C", min: 0, max: 100, precision: 0, warn: 75, crit: 90 },
  "psu.12v": { label: "12V rail", unit: "V", min: 10, max: 14, precision: 2 },
  "ups.power": { label: "UPS power", unit: "W", min: 0, max: 1500, precision: 0 },
  "ram.speed": { label: "Memory speed", unit: "MHz", min: 0, max: 8000, precision: 0 },
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
const RTSS = (id: string) => new RegExp(String.raw`^plugin:\/InfoPanel\.RTSS\/rtss\/${id}$`, "i");

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
  // RTSS through InfoPanel's RTSS plugin; HWiNFO's own frame readings by name.
  fps: [{ ref: RTSS("fps") }, { name: /^RTSS\W+Frames Per Second$/i }, { name: /^Framerate \(Presented\)$/i }],
  "fps.low1": [{ ref: RTSS("1% low fps") }, { name: /^RTSS\W+1% Low FPS$/i }, { name: /^Framerate 1% Low$/i }],
  "fps.low01": [{ ref: RTSS("0\\.1% low fps") }, { name: /^RTSS\W+0\.1% Low FPS$/i }, { name: /^Framerate 0\.1% Low$/i }],
  frametime: [{ ref: RTSS("current frame time") }, { name: /^RTSS\W+Current Frame Time$/i }, { name: /^Frame Time$/i, unit: "ms" }],
  "vram.used": [{ ref: re(GPU + "smalldata/1$") }, { name: /\bGPU Memory Used$/i }, { name: /^GPU Memory Allocated$/i }],
  "vram.total": [{ ref: re(GPU + "smalldata/2$") }, { name: /\bGPU Memory Total$/i }],
  "vram.temp": [{ ref: re(GPU + "temperature/3$"), name: /Memory (Junction|Temperature)$/i }, { name: /\bGPU Memory (Junction|Temperature)$/i, unit: "°C" }],
  "gpu.memclock": [{ ref: re(GPU + "clock/4$") }, { name: /\bGPU Memory$/i, unit: "MHz" }, { name: /^GPU Memory Clock$/i }],
  "gpu.hotspot": [{ ref: re(GPU + "temperature/2$"), name: /Hot ?Spot$/i }, { name: /\bGPU Hot ?Spot$/i, unit: "°C" }, { name: /^GPU Hot Spot Temperature$/i }],
  "gpu.fan": [{ ref: re(GPU + "fan/1$") }, { name: /\bGPU Fan( 1)?$/i, unit: "RPM" }, { name: /^GPU Fan$/i }],
  "gpu.volt": [{ ref: re(GPU + "voltage/0$") }, { name: /\bGPU Core Voltage$/i, unit: "V" }],
  "ram.total": [{ name: /^(Physical|Total Physical) Memory Total$/i }, { name: /^Total Physical Memory$/i }],
  "ram.free": [{ ref: /^libre:\/ram\/data\/1$/i }, { name: /^(?!.*(Virtual|GPU|D3D)).*\bMemory Available$/i, unit: "GB" }, { name: /^Physical Memory Available$/i }],
  "disk.free": [{ ref: re(DISK + "data/"), name: /Free Space$/i }, { name: /\bFree Space$/i, unit: "GB" }],
  "cpu.maxcore": [{ ref: re(CPU + "load/1$"), name: /Core Max$/i }, { name: /^(?!.*GPU).*CPU Core Max$/i, unit: "%" }, { name: /^Max CPU\/Thread Usage$/i }],
  "cpu.ccd1": [{ ref: re(CPU + "temperature/"), name: /CCD1 \(Tdie\)$/i }, { name: /CCD1 \(Tdie\)$/i, unit: "°C" }],
  "cpu.ccd2": [{ ref: re(CPU + "temperature/"), name: /CCD2 \(Tdie\)$/i }, { name: /CCD2 \(Tdie\)$/i, unit: "°C" }],
  // Best effort: boards and UPS plugins name these as they please.
  "psu.12v": [{ name: /^(\+12V|12V|PSU 12V|12V Rail)$/i, unit: "V" }],
  "ups.power": [{ name: /^UPS .*(Power|Load)$/i, unit: "W" }, { name: /^UPS Power$/i }],
  // HWiNFO's memory group; best effort, not in the capture.
  "ram.speed": [{ name: /^(Memory Clock|DRAM Frequency)$/i, unit: "MHz" }],
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

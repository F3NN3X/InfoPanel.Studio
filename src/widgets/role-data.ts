// The sensors the analysis widgets default to, found by display name in a widget's flat data, so they work on
// drop with LibreHardwareMonitor, HWiNFO or RTSS names alike. Memoised per data object.
// A small copy of the name rules of `lib/infopanel/templates/roles.ts` for the roles used here: that file also
// carries the InfoPanel profile templates' tables, which the kiosk entry has no use for (`history.test` keeps the two in step).
import { num, type Data } from "./kit";

export type Role = "cpu.load" | "cpu.temp" | "cpu.maxcore" | "gpu.load" | "gpu.temp" | "vram.used" | "vram.total" | "fps" | "frametime";

interface Rule {
  name: RegExp;
  unit?: string;
}

/** In order of trust: the first rule that matches anything wins. */
export const RULES: Record<Role, readonly Rule[]> = {
  "cpu.load": [{ name: /\bCPU Total$/i, unit: "%" }, { name: /^Total CPU Usage$/i }, { name: /^CPU Load$/i }],
  "cpu.temp": [
    { name: /^CPU \(Tctl\/Tdie\)$/i, unit: "°C" },
    { name: /^(?!.*GPU).*(Core \(Tctl\/Tdie\)|CPU Package)$/i, unit: "°C" },
    { name: /^(CPU \(Tctl\/Tdie\)|CPU Package|CPU Package Temp|CPU Die \(average\))$/i },
  ],
  "cpu.maxcore": [{ name: /^(?!.*GPU).*CPU Core Max$/i, unit: "%" }, { name: /^Max CPU\/Thread Usage$/i }],
  "gpu.load": [{ name: /\bGPU Core$/i, unit: "%" }, { name: /^(GPU Core Load|GPU Utilization|GPU D3D Usage)$/i }],
  "gpu.temp": [{ name: /\bGPU Core$/i, unit: "°C" }, { name: /^GPU Temperature$/i }],
  "vram.used": [{ name: /\bGPU Memory Used$/i }, { name: /^GPU Memory Allocated$/i }],
  "vram.total": [{ name: /\bGPU Memory Total$/i }],
  fps: [{ name: /^RTSS\W+Frames Per Second$/i }, { name: /^Framerate( \(Presented\))?$/i }],
  frametime: [{ name: /^RTSS\W+Current Frame Time$/i }, { name: /^Frame Time$/i, unit: "ms" }],
};

export interface RoleReading {
  key: string;
  value: number;
  unit: string;
}

export type Roles = Partial<Record<Role, RoleReading>>;

export interface RoleData {
  roles: Roles;
  /** A thermal-throttle flag reads on (HWiNFO's "Thermal Throttling (...)", "Performance Limit - Thermal"). */
  thermalThrottle: boolean;
  /** A power-limit flag reads on ("Performance Limit - Power"). */
  powerThrottle: boolean;
}

const THERMAL_FLAG = /^(Thermal Throttling\b|Performance Limit - Thermal$)/i;
const POWER_FLAG = /^(Performance Limit - Power$|Power Throttling\b)/i;

const cache = new WeakMap<Data, RoleData>();
const byKey = new Intl.Collator("en", { numeric: true }).compare;

/** The unit of a flat reading (`"58.9 °C"` → `"°C"`), with the Data API's doubled-encoding prefix (`Â°C`) repaired. */
export const unitOf = (raw: string): string => raw.replace(/^[-\d.,\s]+/, "").replace(/Â(?=[°²³µ])/g, "").trim();

/** The roles the analysis widgets read, found from the flat data and the sensors' display names. */
export function roleData(data: Data, names: Record<string, string> = {}): RoleData {
  const hit = cache.get(data);
  if (hit) return hit;
  const found: { key: string; name: string; value: number; unit: string }[] = [];
  let thermalThrottle = false,
    powerThrottle = false;
  for (const [key, raw] of Object.entries(data)) {
    const text = typeof raw === "object" ? raw.value : raw;
    const value = num(text);
    const name = names[key]?.trim();
    if (!name || !Number.isFinite(value)) continue;
    const unit = unitOf(text);
    found.push({ key, name, value, unit });
    if (value >= 1 && unit === "Yes/No") {
      thermalThrottle ||= THERMAL_FLAG.test(name);
      powerThrottle ||= POWER_FLAG.test(name);
    }
  }
  found.sort((a, b) => byKey(a.key, b.key));
  const roles: Roles = {};
  for (const role of Object.keys(RULES) as Role[]) {
    for (const rule of RULES[role]) {
      const m = found.find((f) => rule.name.test(f.name) && (rule.unit === undefined || f.unit === rule.unit));
      if (m) {
        roles[role] = { key: m.key, value: m.value, unit: m.unit };
        break;
      }
    }
  }
  const out = { roles, thermalThrottle, powerThrottle };
  cache.set(data, out);
  return out;
}

/** The value of a role, NaN when nothing on this machine matches it. */
export const roleValue = (r: Roles, role: Role): number => r[role]?.value ?? Number.NaN;

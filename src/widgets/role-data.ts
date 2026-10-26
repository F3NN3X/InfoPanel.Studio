// The sensor roles (`lib/infopanel/templates/roles.ts`) found in a widget's flat data, so the analysis widgets
// work on drop with LibreHardwareMonitor, HWiNFO or RTSS names alike. Memoised per data object.
import { resolveRoles, type Role } from "@/lib/infopanel/templates/roles";
import { fixUnit, type DataApiValue } from "@/lib/infopanel/sensors";
import { num, type Data } from "./kit";

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

const ROLES_USED: Role[] = ["cpu.load", "cpu.temp", "cpu.maxcore", "gpu.load", "gpu.temp", "gpu.clock", "vram.used", "vram.total", "fps", "fps.low1", "frametime", "ram.load"];

const cache = new WeakMap<Data, RoleData>();

/** The unit of a flat reading (`"58.9 °C"` → `"°C"`), with the Data API's doubled-encoding prefix (`Â°C`) repaired. */
export const unitOf = (raw: string): string => fixUnit(raw.replace(/^[-\d.,\s]+/, "").trim()) ?? "";

/** The roles the analysis widgets read, resolved from the flat data and the sensors' display names. */
export function roleData(data: Data, names: Record<string, string> = {}): RoleData {
  const hit = cache.get(data);
  if (hit) return hit;
  const sensors: Record<string, DataApiValue> = {};
  let thermalThrottle = false,
    powerThrottle = false;
  for (const [key, raw] of Object.entries(data)) {
    const text = typeof raw === "object" ? raw.value : raw;
    const value = num(text);
    const name = names[key];
    if (!Number.isFinite(value)) continue;
    sensors[key] = { value, unit: unitOf(text), ...(name ? { name } : {}) };
    if (name && value >= 1 && /^Yes\/No$/i.test(unitOf(text))) {
      thermalThrottle ||= THERMAL_FLAG.test(name);
      powerThrottle ||= POWER_FLAG.test(name);
    }
  }
  const roles: Roles = {};
  for (const [role, s] of resolveRoles(sensors, ROLES_USED)) roles[role] = { key: s.key, value: sensors[s.key].value ?? NaN, unit: sensors[s.key].unit ?? "" };
  const out = { roles, thermalThrottle, powerThrottle };
  cache.set(data, out);
  return out;
}

/** The value of a role, NaN when nothing on this machine matches it. */
export const roleValue = (r: Roles, role: Role): number => r[role]?.value ?? Number.NaN;

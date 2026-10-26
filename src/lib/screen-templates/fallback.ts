/**
 * No empty slots (pure). A spare zone whose sensor role isn't found on this PC is filled from a ranked list of similar
 * roles (the first that is found and isn't read elsewhere on the page); when none is, the zone is left out and the
 * neighbours that border it exactly take its space, so nothing overlaps and nothing leaves the grid.
 */
import type { Role } from "../infopanel/templates/roles";
import type { At, Zone } from "./kit";

interface Alike {
  role: Role;
  /** The zone's label when this role fills it. */
  label: string;
}

const alike = (role: Role, label: string): Alike => ({ role, label });

/** For a role, the roles that can stand in for it, best first. */
export const FALLBACKS: Readonly<Partial<Record<Role, readonly Alike[]>>> = {
  "fps.low1": [alike("fps.low01", "0.1% low"), alike("frametime", "Frametime")],
  "fps.low01": [alike("fps.low1", "1% low"), alike("frametime", "Frametime")],
  frametime: [alike("fps.low1", "1% low"), alike("fps.low01", "0.1% low")],
  "gpu.hotspot": [alike("vram.temp", "VRAM temp"), alike("gpu.temp", "GPU temp")],
  "vram.temp": [alike("gpu.hotspot", "Hot spot"), alike("gpu.temp", "GPU temp")],
  "cpu.ccd1": [alike("cpu.maxcore", "Busiest core"), alike("cpu.temp", "CPU temp")],
  "cpu.ccd2": [alike("cpu.maxcore", "Busiest core"), alike("cpu.temp", "CPU temp")],
  "gpu.fan": [alike("gpu.volt", "Voltage"), alike("gpu.memclock", "Memory clock")],
  "gpu.volt": [alike("gpu.fan", "Fan"), alike("gpu.memclock", "Memory clock")],
  "gpu.memclock": [alike("gpu.clock", "GPU clock"), alike("gpu.power", "GPU power")],
  "gpu.power": [alike("gpu.clock", "GPU clock"), alike("gpu.memclock", "Memory clock")],
  "gpu.clock": [alike("gpu.memclock", "Memory clock"), alike("gpu.power", "GPU power")],
  "cpu.power": [alike("cpu.clock", "CPU clock"), alike("cpu.maxcore", "Busiest core")],
  "cpu.clock": [alike("cpu.power", "CPU power"), alike("cpu.maxcore", "Busiest core")],
  "cpu.maxcore": [alike("cpu.load", "CPU load")],
  "disk.temp": [alike("disk.load", "Disk activity"), alike("disk.free", "Disk free")],
  "disk.free": [alike("disk.load", "Disk activity")],
  "ram.used": [alike("ram.free", "RAM free"), alike("ram.total", "RAM total")],
  "ram.free": [alike("ram.used", "RAM used"), alike("ram.total", "RAM total")],
  "ram.total": [alike("ram.used", "RAM used"), alike("ram.free", "RAM free")],
  "ram.speed": [alike("ram.total", "RAM total"), alike("ram.used", "RAM used")],
  "vram.used": [alike("vram.total", "VRAM total")],
  "vram.total": [alike("vram.used", "VRAM")],
  "psu.12v": [alike("cpu.power", "CPU power")],
  "ups.power": [alike("cpu.power", "CPU power")],
};

/** A zone as it is placed: its box (possibly grown over a left-out neighbour), the sensors found and the label that replaces its own. */
export interface Placed {
  zone: Zone;
  at: At;
  /** Setting key to sensor key. */
  bound: Readonly<Record<string, string>>;
  label?: string;
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

/** The neighbours that border a left-out box on one side and together cover that whole side take its space; otherwise nothing changes. */
function absorb(items: readonly Placed[], [c, r, w, h]: At): readonly Placed[] {
  const rows = (a: At) => a[1] >= r && a[1] + a[3] <= r + h;
  const cols = (a: At) => a[0] >= c && a[0] + a[2] <= c + w;
  const sides: readonly { near: (a: At) => boolean; length: (a: At) => number; span: number; grow: (a: At) => At }[] = [
    { near: (a) => a[0] + a[2] === c && rows(a), length: (a) => a[3], span: h, grow: (a) => [a[0], a[1], a[2] + w, a[3]] },
    { near: (a) => a[0] === c + w && rows(a), length: (a) => a[3], span: h, grow: (a) => [c, a[1], a[2] + w, a[3]] },
    { near: (a) => a[1] + a[3] === r && cols(a), length: (a) => a[2], span: w, grow: (a) => [a[0], a[1], a[2], a[3] + h] },
    { near: (a) => a[1] === r + h && cols(a), length: (a) => a[2], span: w, grow: (a) => [a[0], r, a[2], a[3] + h] },
  ];
  for (const side of sides) {
    const near = items.filter((i) => side.near(i.at));
    if (near.length > 0 && sum(near.map((i) => side.length(i.at))) === side.span) return items.map((i) => (near.includes(i) ? { ...i, at: side.grow(i.at) } : i));
  }
  return items;
}

/**
 * A page's zones as placed on a machine: `keyOf` gives the sensor key of a role (undefined when not found). A spare zone
 * with a role missing takes the first similar role that is found and not read elsewhere on the page, with that role's
 * label; one with all its roles missing and no stand-in is left out.
 */
export function placePage(zones: readonly Zone[], keyOf: (role: Role) => string | undefined): Placed[] {
  const used = new Set<Role>(zones.flatMap((z) => Object.values(z.roles ?? {})).filter((role) => keyOf(role) !== undefined));
  const kept: Placed[] = [];
  const left: At[] = [];
  for (const zone of zones) {
    const entries = Object.entries(zone.roles ?? {});
    const bound: Record<string, string> = {};
    let label: string | undefined;
    for (const [setting, role] of entries) {
      let key = keyOf(role);
      if (key === undefined && zone.spare) {
        const stand = FALLBACKS[role]?.find((f) => !used.has(f.role) && keyOf(f.role) !== undefined);
        if (stand) {
          used.add(stand.role);
          key = keyOf(stand.role);
          label = stand.label;
        }
      }
      if (key !== undefined) bound[setting] = key;
    }
    if (zone.spare && entries.length > 0 && Object.keys(bound).length === 0) left.push(zone.at);
    else kept.push({ zone, at: zone.at, bound, ...(label ? { label } : {}) });
  }
  // A left-out box next to another one is taken once that one is, so go over them again until none changes.
  let items: readonly Placed[] = kept;
  let pending = left;
  for (let progress = true; progress && pending.length > 0; ) {
    progress = false;
    const stuck: At[] = [];
    for (const box of pending) {
      const next = absorb(items, box);
      if (next === items) stuck.push(box);
      else progress = true;
      items = next;
    }
    pending = stuck;
  }
  return [...items];
}

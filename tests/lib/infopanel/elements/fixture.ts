/** One of each studio element on a new profile, for the element tests. */
import { newStored, readStored } from "@/lib/infopanel/import/stored.ts";
import { newCores, newElement } from "@/lib/infopanel/elements/create.ts";
import type { CoreSensor } from "@/lib/infopanel/elements/cores.ts";
import { defaultPalette } from "@/lib/infopanel/elements/palette.ts";
import type { DisplayItem } from "@/lib/infopanel/schema.ts";

export const profile = readStored(newStored({ name: "Cards", width: 800, height: 480, now: new Date("2026-10-24T00:00:00Z") })).profile;
export const palette = defaultPalette(profile);

export const cores: CoreSensor[] = [1, 2, 3, 4].map((n) => ({ key: `libre.core_${n}`, name: `CPU Core #${n}`, unit: "%", ref: `libre:/intelcpu/0/load/${n}`, core: n, thread: 0 }));

/** Ring, LED bar, Card, Glow, Divider, Icon, Cores (4 bound bars) and Sparkline, in that order. */
export function oneOfEach(): DisplayItem[] {
  const types = ["ring", "ledbar", "card", "glow", "divider", "icon"] as const;
  return [
    ...types.map((t, i) => ({ ...newElement(t, profile, palette), X: 10 + i * 20, Y: 10 }) as DisplayItem),
    newCores(profile, palette, cores, 300, 300),
    newElement("sparkline", profile, palette),
  ];
}

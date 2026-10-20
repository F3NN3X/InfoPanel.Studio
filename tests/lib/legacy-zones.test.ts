import { describe, expect, it } from "vitest";
import { modules } from "@/modules";
import { settingKeys } from "@/modules/types";
import type { Placement } from "@/lib/layout";
import { LEGACY_MODULE_IDS, migrateLegacyZone, migrateLegacyZones } from "@/lib/legacy-zones";
import { migrateSettingsV7, migrateSettingsV8 } from "@/lib/settings-migrate";
import { CASES } from "@/lib/legacy-zones.cases";

const zone = (module: string, settings?: Placement["settings"]): Placement => ({ id: "z", module, colStart: 1, rowStart: 1, colSpan: 3, rowSpan: 2, visible: true, settings });
const plain = { styledSurface: false };
const byId = new Map(modules.map((m) => [m.id, m]));

// The snapshots were taken while the aliases still rendered: each output rendered to the same markup as
// its alias from the widget fixtures (renderToString, every case below).
describe("migrateLegacyZone", () => {
  for (const c of CASES)
    it(c.name, () => {
      const out = migrateLegacyZone(zone(c.module, c.settings), plain);
      expect({ module: out.module, settings: out.settings }).toMatchSnapshot();
      // Only keys the template has a setting for (once the later steps renamed the shared keys, config v7,
      // and the sample widgets' own, v8), besides the ones it reads from the saved values.
      const known = new Set((byId.get(out.module)?.settings ?? []).flatMap(settingKeys));
      const later = migrateSettingsV8(out.module, migrateSettingsV7(out.module, out.settings, true).settings, true).settings;
      expect(Object.keys(later ?? {}).filter((k) => !known.has(k))).toEqual(c.unlisted ?? []);
    });

  it("maps every legacy id to a registered template", () => {
    for (const id of LEGACY_MODULE_IDS) {
      expect(byId.has(id), id).toBe(false);
      expect(byId.has(migrateLegacyZone(zone(id), plain).module), id).toBe(true);
    }
  });

  it("keeps the zone's box, id, design and style mode", () => {
    const z = { ...zone("textfile", { showMeta: false }), design: { accent: "#f00" }, styleMode: "follow" as const };
    expect(migrateLegacyZone(z, plain)).toEqual({ ...z, module: "TextFile", settings: { showMeta: false, surface: "theme" } });
  });

  it("leaves the card surface to a dashboard or profile style that sets one", () => {
    expect(migrateLegacyZone(zone("vbz"), { styledSurface: true }).settings).toBeUndefined();
  });

  it("passes template, panel and unknown zones through unchanged", () => {
    const zones = [zone("SystemOverview", { sections: "cpu" }), zone("panel"), zone("someplugin", { x: 1 }), zone("toString")];
    expect(migrateLegacyZones(zones, plain)).toBe(zones);
    expect(migrateLegacyZones([...zones, zone("vbz")], plain).slice(0, 4)).toEqual(zones);
  });
});

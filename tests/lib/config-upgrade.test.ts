import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { upgradeConfig } from "@/lib/config-upgrade";
import { CONFIG_VERSION, defaultConfig, isCurrentConfig, mergeConfig, readConfig, readImportedConfig, type StoredConfig } from "@/lib/layout";
import { PARITY_CASES } from "@/lib/settings-migrate.v8.cases";
import { arcv2Profile } from "@tests/lib/__fixtures__/arcv2-profile";
import { sampleProfile } from "@tests/lib/__fixtures__/sample-profile";

/** A config as the server stores it: the JSON a save wrote. */
const saved = (c: unknown): StoredConfig => JSON.parse(JSON.stringify(c));

// What a current config is: whatever the upgrade made of an older one, saved, and the configs this build writes.
const older: StoredConfig[] = [
  { version: 2, profiles: [sampleProfile() as never] },
  { version: 7, profiles: [arcv2Profile() as never], theme: { card: "200 50% 40%" }, radius: 0.75 },
  { version: 7, profiles: [{ ...sampleProfile(), pages: [{ id: "main", name: "Main", placements: PARITY_CASES.map((c) => ({ id: c.id, module: c.module, colStart: 1, rowStart: 1, colSpan: 3, rowSpan: 2, visible: true, ...(c.settings ? { settings: c.settings } : {}) })) }] } as never] },
  { version: 15, profiles: [sampleProfile() as never], background: { type: "color", color: "#123456" }, style: { accent: "#ff0000" } },
];
const current: StoredConfig[] = [
  saved(defaultConfig()),
  JSON.parse(fs.readFileSync("tests/fixtures/perf/data/config.json", "utf8")),
  ...older.map((c) => saved(upgradeConfig(c))),
];

describe("mergeConfig on a current config", () => {
  it("gives what the full upgrade gives: the steps it leaves out change nothing at this version", () => {
    for (const c of current) {
      expect(c.version).toBe(CONFIG_VERSION);
      expect(mergeConfig(c)).toEqual(upgradeConfig(c));
    }
  });
});

describe("readConfig", () => {
  it("merges a current or newer config as it is", async () => {
    for (const c of current) expect(await readConfig(c)).toEqual(mergeConfig(c));
    const newer = { ...current[0], version: CONFIG_VERSION + 1 };
    expect(isCurrentConfig(newer)).toBe(true);
    expect(await readConfig(newer)).toEqual(mergeConfig(newer));
  });
  it("upgrades an older one, or one with no version", async () => {
    for (const c of [...older, { profiles: [sampleProfile() as never] }]) {
      expect(isCurrentConfig(c)).toBe(false);
      expect(await readConfig(c)).toEqual(upgradeConfig(c));
    }
    // The v15 dashboard background is the screen's own after the upgrade.
    expect((await readConfig(older[3])).profiles[0]).toMatchObject({ background: { type: "color", color: "#123456" } });
  });
});

describe("readImportedConfig", () => {
  it("runs the upgrade's ungated repairs on a file labelled current: a dead widget preset key goes", async () => {
    const file = saved(current[1]);
    const zone = file.profiles?.[0].pages?.[0].placements?.[0];
    if (!zone) throw new Error("no zone");
    zone.settings = { ...zone.settings, preset: "mono" };
    const settings = (c: { profiles: { pages: { placements: { settings?: object }[] }[] }[] }) => c.profiles[0].pages[0].placements[0].settings;
    expect(settings(await readImportedConfig(file))).not.toHaveProperty("preset");
    expect(await readImportedConfig(file)).toEqual(upgradeConfig(file));
  });
});

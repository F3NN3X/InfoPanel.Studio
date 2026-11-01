import { upgradeConfig } from "@/lib/config-upgrade";
import { describe, expect, it } from "vitest";
import type { Placement, StoredConfig } from "@/lib/layout";
import { migratePlacementStreamDeck } from "@/lib/settings-migrate";

const zone = (id: string, module: string, settings?: Record<string, unknown>) => ({ id, module, colStart: 2, rowStart: 1, colSpan: 4, rowSpan: 2, visible: true, ...(settings ? { settings } : {}) });

const stored = (version: number, placements: Record<string, unknown>[]): StoredConfig =>
  ({ version, activeProfile: "auto", profiles: [{ id: "p", name: "Desk", width: 1920, height: 1080, cols: 12, rows: 6, fit: "scroll", pages: [{ id: "main", name: "Main", placements }] }] }) as unknown as StoredConfig;

const zonesOf = (c: ReturnType<typeof upgradeConfig>): Placement[] => c.profiles[0].pages[0].placements;

describe("the Elgato Stream Deck widget replaces the plugin mirror", () => {
  it("keeps the zone's id and place, drops the mirror's keys and leaves the device empty", () => {
    const migrated = upgradeConfig(stored(15, [zone("deck", "StreamDeck", { showProfile: false, showLabels: false, accent: "#ff6a3d" })]));
    const [deck] = zonesOf(migrated);
    expect(deck).toMatchObject({ id: "deck", module: "StreamDeck", colStart: 2, rowStart: 1, colSpan: 4, rowSpan: 2 });
    expect(deck.settings).toEqual({ accent: "#ff6a3d" });
  });

  it("drops the settings object when only the mirror's keys were in it, and maps the legacy zone to the same id", () => {
    const migrated = upgradeConfig(stored(2, [zone("legacy", "streamdeck", { showLabels: false })]));
    const [deck] = zonesOf(migrated);
    expect(deck.module).toBe("StreamDeck");
    expect(deck.settings?.showLabels).toBeUndefined();
    expect(deck.settings?.device).toBeUndefined();
  });

  it("leaves a new-style zone and other widgets alone", () => {
    const fresh = zone("deck", "StreamDeck", { device: "abc", showTitles: false }) as unknown as Placement;
    expect(migratePlacementStreamDeck(fresh)).toBe(fresh);
    const other = zone("n", "Notifications", { showLabels: false }) as unknown as Placement;
    expect(migratePlacementStreamDeck(other)).toBe(other);
  });
});

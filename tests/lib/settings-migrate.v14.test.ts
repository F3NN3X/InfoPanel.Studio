import { describe, expect, it } from "vitest";
import { CANVAS_ID, CONFIG_VERSION, defaultConfig, mergeConfig, type DashboardConfig, type StoredConfig } from "@/lib/layout";
import { migrateProfileV14 } from "@/lib/settings-migrate";
import { importAsProfile } from "@/components/studio/import-actions";
import { parseProfileFile, profileFileText } from "@/components/studio/profile-file";
import { newStored } from "@/lib/infopanel/import/stored";

const canvas = newStored({ name: "Arc", width: 800, height: 480, now: new Date("2026-10-26T00:00:00Z") });
const zone = (id: string, module: string, box: [number, number, number, number], extra: Record<string, unknown> = {}) => ({
  id, module, colStart: box[0], rowStart: box[1], colSpan: box[2], rowSpan: box[3], visible: true, ...extra,
});

/** A v13 config: a Studio screen, an InfoPanel profile (one canvas filling a 2 × 1 grid), a screen with a free area, a mixed two-page one. */
const v13 = (): StoredConfig =>
  ({
    version: 13,
    activeProfile: "auto",
    profiles: [
      { id: "desk", name: "Desk", width: 1920, height: 1080, cols: 12, rows: 6, fit: "scroll", pages: [{ id: "p1", name: "Main", placements: [zone("cpu", "CpuMonitor", [1, 1, 3, 2], { settings: { accent: "#fff" } })] }] },
      { id: "arc", name: "Arc", width: 800, height: 480, cols: 2, rows: 1, fit: "fill", pages: [{ id: "a1", name: "Page 1", placements: [zone("c", CANVAS_ID, [1, 1, 2, 1], { canvas })] }] },
      { id: "area", name: "Area", width: 1024, height: 600, cols: 4, rows: 3, fit: "fill", pages: [{ id: "r1", name: "Main", placements: [zone("free", CANVAS_ID, [2, 1, 2, 2], { canvas }), zone("clk", "Clock", [1, 1, 1, 1])] }] },
      {
        id: "mix", name: "Mix", width: 800, height: 480, cols: 2, rows: 1, fit: "fill",
        pages: [
          { id: "m1", name: "Free", placements: [zone("c2", CANVAS_ID, [1, 1, 2, 1], { canvasRef: "ref-1" })] },
          { id: "m2", name: "Grid", placements: [zone("w", "Weather", [1, 1, 1, 1])] },
        ],
      },
    ],
  }) as unknown as StoredConfig;

/** The config with the v14 fields taken off, to compare the rest. */
const withoutV14 = (c: DashboardConfig) =>
  JSON.parse(JSON.stringify(c), (k, v) => (k === "layout" || k === "madeFor" ? undefined : v === null ? null : v)) as unknown;

describe("v14: Free pages and Made for", () => {
  const out = mergeConfig(v13());
  const byId = (id: string) => out.profiles.find((p) => p.id === id)!;

  it("stamps the version", () => {
    expect(CONFIG_VERSION).toBe(14);
    expect(out.version).toBe(14);
  });

  it("marks a page that is one canvas filling the grid as Free, and a screen of only Free pages as made for InfoPanel", () => {
    expect(byId("arc").pages[0].layout).toBe("free");
    expect(byId("arc").madeFor).toBe("infopanel");
    // A canvas only in the store (a ref) is the same page.
    expect(byId("mix").pages[0].layout).toBe("free");
  });

  it("leaves grid pages, free areas and mixed screens as they are", () => {
    expect(byId("desk").pages[0]).not.toHaveProperty("layout");
    expect(byId("desk").madeFor).toBeUndefined();
    expect(byId("area").pages[0]).not.toHaveProperty("layout");
    expect(byId("area").madeFor).toBeUndefined();
    expect(byId("mix").pages[1]).not.toHaveProperty("layout");
    expect(byId("mix").madeFor).toBeUndefined();
  });

  it("changes nothing else: every screen and profile loads with the same content as before", () => {
    const before = { ...mergeConfig(v13()) };
    // What a v13 build loaded is this load without the two new fields.
    expect(withoutV14(out)).toEqual(withoutV14(before));
    expect(byId("arc").pages[0].placements[0].canvas).toEqual(canvas);
    expect(byId("desk").pages[0].placements[0].settings).toEqual({ accent: "#fff" });
  });

  it("a v14 config saved and loaded again is identical", () => {
    const again = mergeConfig(JSON.parse(JSON.stringify(out)) as StoredConfig);
    expect(again).toEqual(out);
  });

  it("runs once: a v14 page the user made a grid page (or a screen made for Studio) stays so", () => {
    const stored = JSON.parse(JSON.stringify(out)) as StoredConfig & { profiles: { madeFor?: string; pages: { layout?: string }[] }[] };
    stored.profiles[1].pages[0].layout = "grid";
    stored.profiles[1].madeFor = "studio";
    const p = mergeConfig(stored).profiles[1];
    expect(p.pages[0].layout).toBe("grid");
    expect(p.madeFor).toBe("studio");
  });

  it("drops a Free flag the page doesn't hold, and values it doesn't know", () => {
    const stored = v13() as unknown as { version: number; profiles: Record<string, unknown>[] };
    stored.version = 14;
    (stored.profiles[0] as { pages: Record<string, unknown>[] }).pages[0].layout = "free";
    (stored.profiles[2] as { pages: Record<string, unknown>[] }).pages[0].layout = "sideways";
    stored.profiles[0].madeFor = "everyone";
    const c = mergeConfig(stored as unknown as StoredConfig);
    expect(c.profiles[0].pages[0]).not.toHaveProperty("layout");
    expect(c.profiles[2].pages[0]).not.toHaveProperty("layout");
    expect(c.profiles[0].madeFor).toBeUndefined();
    // Nothing on the page is lost.
    expect(c.profiles[0].pages[0].placements.map((z) => z.id)).toEqual(["cpu"]);
  });

  it("an old dashboard (v2, legacy placements) opens", () => {
    const old = mergeConfig({ version: 2, profiles: [{ id: "o", name: "Old", width: 800, height: 480, cols: 2, rows: 1, fit: "fill", placements: [zone("c", CANVAS_ID, [1, 1, 2, 1], { canvas })] }] } as unknown as StoredConfig);
    expect(old.version).toBe(14);
    expect(old.profiles[0].pages[0].layout).toBe("free");
    expect(old.profiles[0].madeFor).toBe("infopanel");
  });

  it("the default config and an empty profile list stay as they were", () => {
    expect(mergeConfig({}).profiles[0].madeFor).toBeUndefined();
    expect(migrateProfileV14({ cols: 2, rows: 1, pages: [] }, { legacy: true })).toEqual({ cols: 2, rows: 1, pages: [] });
    const same = { cols: 2, rows: 1, pages: [{ placements: [] }] };
    expect(migrateProfileV14(same, { legacy: true })).toBe(same);
  });
});

describe("v14 where screens come in", () => {
  it("an imported InfoPanel profile is a Free page made for InfoPanel", () => {
    const r = importAsProfile(defaultConfig(), canvas, "Arc", { width: 800, height: 480 });
    const p = r.config.profiles.find((x) => x.id === r.profileId)!;
    expect(p.madeFor).toBe("infopanel");
    expect(p.pages[0].layout).toBe("free");
    // And it loads as it was made.
    expect(mergeConfig(JSON.parse(JSON.stringify(r.config))).profiles.find((x) => x.id === r.profileId)).toEqual(p);
  });

  it("a screen file keeps the page layout and Made for", () => {
    const p = mergeConfig(v13()).profiles[1];
    const read = parseProfileFile(profileFileText(p));
    expect("profile" in read && read.profile).toEqual(p);
  });

  it("a v13 screen file is migrated on import", () => {
    const raw = (v13().profiles ?? [])[1];
    const read = parseProfileFile(JSON.stringify({ type: "infopanel-studio-profile", version: 1, configVersion: 13, profile: raw }));
    expect("profile" in read && read.profile.pages[0].layout).toBe("free");
  });
});

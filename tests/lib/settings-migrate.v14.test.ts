import { describe, expect, it } from "vitest";
import { CANVAS_ID, defaultConfig, mergeConfig, type StoredConfig } from "@/lib/layout";
import { migrateProfileV14 } from "@/lib/settings-migrate";
import { isFreePage } from "@/lib/free-pages";
import { importAsProfile } from "@/components/studio/import-actions";
import { parseProfileFile, profileFileText } from "@/components/studio/profile-file";
import { newStored } from "@/lib/infopanel/import/stored";

// v14 marked Free pages with a `layout` flag; v15 (settings-migrate.v15.test.ts) reads them from their shape and drops
// the flag. These cases keep v14's own rule (`migrateProfileV14`) and what it decided that still holds after v15.

/** An InfoPanel profile's canvas, as an import stores it. */
const canvas = { ...newStored({ name: "Arc", width: 800, height: 480, now: new Date("2026-10-26T00:00:00Z") }), source: { name: "Arc", origin: "file" as const, importedAt: "2026-10-26T00:00:00Z" } };
const zone = (id: string, module: string, box: [number, number, number, number], extra: Record<string, unknown> = {}) => ({
  id, module, colStart: box[0], rowStart: box[1], colSpan: box[2], rowSpan: box[3], visible: true, ...extra,
});

/** A v13 config: a Studio screen, an InfoPanel profile (one canvas filling a 2 × 1 grid), a mixed two-page one. */
const v13 = (): StoredConfig =>
  ({
    version: 13,
    activeProfile: "auto",
    profiles: [
      { id: "desk", name: "Desk", width: 1920, height: 1080, cols: 12, rows: 6, fit: "scroll", pages: [{ id: "p1", name: "Main", placements: [zone("cpu", "CpuMonitor", [1, 1, 3, 2], { settings: { accent: "#fff" } })] }] },
      { id: "arc", name: "Arc", width: 800, height: 480, cols: 2, rows: 1, fit: "fill", pages: [{ id: "a1", name: "Page 1", placements: [zone("c", CANVAS_ID, [1, 1, 2, 1], { canvas })] }] },
      {
        id: "mix", name: "Mix", width: 800, height: 480, cols: 2, rows: 1, fit: "fill",
        pages: [
          { id: "m1", name: "Free", placements: [zone("c2", CANVAS_ID, [1, 1, 2, 1], { canvasRef: "ref-1" })] },
          { id: "m2", name: "Grid", placements: [zone("w", "Weather", [1, 1, 1, 1])] },
        ],
      },
    ],
  }) as unknown as StoredConfig;

describe("v14's rule (migrateProfileV14)", () => {
  type V14Page = { layout?: "grid" | "free"; placements: { module: string; colStart: number; rowStart: number; colSpan: number; rowSpan: number }[] };
  type V14Profile = { cols: number; rows: number; madeFor?: "studio" | "infopanel"; pages: V14Page[] };
  const free = (cols = 2, rows = 1): V14Page => ({ placements: [{ module: CANVAS_ID, colStart: 1, rowStart: 1, colSpan: cols, rowSpan: rows }] });

  it("marks a page that is one canvas filling the grid as Free, and a screen of only Free pages as made for InfoPanel", () => {
    const p = migrateProfileV14<V14Profile>({ cols: 2, rows: 1, pages: [free()] }, { legacy: true });
    expect(p.pages[0].layout).toBe("free");
    expect(p.madeFor).toBe("infopanel");
  });

  it("leaves a grid page, a smaller canvas and a mixed screen unmarked", () => {
    const area: V14Page = { placements: [{ module: CANVAS_ID, colStart: 2, rowStart: 1, colSpan: 2, rowSpan: 2 }] };
    const p = migrateProfileV14<V14Profile>({ cols: 4, rows: 3, pages: [area, { placements: [{ module: "Clock", colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1 }] }] }, { legacy: true });
    expect(p.pages.map((pg) => pg.layout)).toEqual([undefined, undefined]);
    expect(p.madeFor).toBeUndefined();
    const mixed = migrateProfileV14<V14Profile>({ cols: 2, rows: 1, pages: [free(), { placements: [] }] }, { legacy: true });
    expect(mixed.pages[0].layout).toBe("free");
    expect(mixed.madeFor).toBeUndefined();
  });

  it("runs once, and keeps a page the user made a grid page or a screen made for Studio", () => {
    const same = { cols: 2, rows: 1, pages: [free()] };
    expect(migrateProfileV14(same, { legacy: false })).toBe(same);
    const kept = migrateProfileV14({ cols: 2, rows: 1, madeFor: "studio" as const, pages: [{ ...free(), layout: "grid" as const }] }, { legacy: true });
    expect(kept.pages[0].layout).toBe("grid");
    expect(kept.madeFor).toBe("studio");
  });

  it("an empty profile list and a page with nothing on it stay as they were", () => {
    expect(migrateProfileV14({ cols: 2, rows: 1, pages: [] }, { legacy: true })).toEqual({ cols: 2, rows: 1, pages: [] });
    const same = { cols: 2, rows: 1, pages: [{ placements: [] }] };
    expect(migrateProfileV14(same, { legacy: true })).toBe(same);
  });
});

describe("a v13 config loaded now (v14, then v15)", () => {
  const out = mergeConfig(v13());
  const byId = (id: string) => out.profiles.find((p) => p.id === id)!;

  it("an InfoPanel profile is made for InfoPanel, its page still one canvas and no flag stored", () => {
    expect(isFreePage(byId("arc"), byId("arc").pages[0])).toBe(true);
    expect(byId("arc").madeFor).toBe("infopanel");
    expect(byId("arc").pages[0]).not.toHaveProperty("layout");
    expect(byId("arc").pages[0].placements[0].canvas).toEqual(canvas);
    // A canvas only in the store (a ref) stays the same page, on a screen that isn't only canvases.
    expect(isFreePage(byId("mix"), byId("mix").pages[0])).toBe(true);
    expect(byId("mix").pages[0].placements[0].canvasRef).toBe("ref-1");
    expect(byId("mix").madeFor).toBeUndefined();
  });

  it("a Studio screen is as it was", () => {
    expect(byId("desk").madeFor).toBeUndefined();
    expect(byId("desk").pages[0].placements[0].settings).toEqual({ accent: "#fff" });
    expect(byId("mix").pages[1].placements.map((z) => z.id)).toEqual(["w"]);
  });

  it("saved and loaded again it is identical", () => {
    const again = mergeConfig(JSON.parse(JSON.stringify(out)) as StoredConfig);
    expect(again).toEqual(out);
  });

  it("an old dashboard (v2, legacy placements) opens", () => {
    const old = mergeConfig({ version: 2, profiles: [{ id: "o", name: "Old", width: 800, height: 480, cols: 2, rows: 1, fit: "fill", placements: [zone("c", CANVAS_ID, [1, 1, 2, 1], { canvas })] }] } as unknown as StoredConfig);
    expect(old.version).toBe(15);
    expect(isFreePage(old.profiles[0], old.profiles[0].pages[0])).toBe(true);
    expect(old.profiles[0].madeFor).toBe("infopanel");
  });

  it("the default config stays made for nothing", () => {
    expect(mergeConfig({}).profiles[0].madeFor).toBeUndefined();
  });
});

describe("where screens come in", () => {
  it("an imported InfoPanel profile is one canvas made for InfoPanel, and loads as it was made", () => {
    const r = importAsProfile(defaultConfig(), canvas, "Arc", { width: 800, height: 480 });
    const p = r.config.profiles.find((x) => x.id === r.profileId)!;
    expect(p.madeFor).toBe("infopanel");
    expect(isFreePage(p, p.pages[0])).toBe(true);
    expect(mergeConfig(JSON.parse(JSON.stringify(r.config)) as StoredConfig).profiles.find((x) => x.id === r.profileId)).toEqual(p);
  });

  it("a screen file keeps the page and Made for", () => {
    const p = mergeConfig(v13()).profiles[1];
    const read = parseProfileFile(profileFileText(p));
    expect("profile" in read && read.profile).toEqual(p);
  });

  it("a v13 screen file is migrated on import", () => {
    const raw = (v13().profiles ?? [])[1];
    const read = parseProfileFile(JSON.stringify({ type: "infopanel-studio-profile", version: 1, configVersion: 13, profile: raw }));
    if (!("profile" in read)) throw new Error("not read");
    expect(isFreePage(read.profile, read.profile.pages[0])).toBe(true);
    expect(read.profile.madeFor).toBe("infopanel");
  });
});


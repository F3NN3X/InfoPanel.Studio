import { describe, expect, it } from "vitest";
import { zoneFits } from "@/components/studio/zone-geometry";
import { invalidStyleKeys } from "@/lib/appearance-presets";
import { TEMPLATES } from "@/lib/infopanel/templates/catalog";
import { shapeClassOf, type ShapeClass } from "@/lib/infopanel/templates/layout";
import type { DataApiValue } from "@/lib/infopanel/sensors";
import { CONFIG_VERSION, defaultConfig, mergeConfig } from "@/lib/layout";
import { SCREEN_TEMPLATES } from "@/lib/screen-templates/catalog";
import { instantiate, splitOf } from "@/lib/screen-templates/instantiate";
import { modules } from "@/modules";

/** Two sizes of each class, of different aspects, so the grid split is exercised. */
const SIZES: Record<ShapeClass, readonly [number, number][]> = {
  strip: [[1920, 480], [1280, 160]],
  wide: [[1920, 720], [1920, 540]],
  standard: [[1024, 600], [1920, 1080]],
  tall: [[480, 1920], [1080, 1920]],
};

const byId = new Map(modules.map((m) => [m.id, m]));

/** The settings a zone holds that its widget doesn't declare, or whose value isn't one it offers. */
function badSettings(module: string, settings: Record<string, unknown>): string[] {
  const defs = byId.get(module)?.settings ?? [];
  return Object.entries(settings).flatMap(([key, value]) => {
    const def = defs.find((d) => d.key === key || d.keyY === key);
    if (!def) return [`${key} (unknown)`];
    if ((def.type === "select" || def.type === "preset") && def.options?.length) {
      const offered = def.options.map((o) => o.value);
      const parts = String(value).split(",");
      // An empty list is a valid pick of a multiple select (a bar slot left empty), as the widgets' own presets set it.
      return value === "" || parts.every((p) => offered.includes(p)) ? [] : [`${key}=${String(value)}`];
    }
    return [];
  });
}

const rows = SCREEN_TEMPLATES.flatMap((t) => t.fits.map((cls) => [t.id, cls, t] as const));

describe("native screen templates", () => {
  it.each(rows)("%s at %s makes a valid screen at two sizes", (_id, cls, t) => {
    for (const [width, height] of SIZES[cls]) {
      const { profile } = instantiate(t, { name: t.name, width, height });
      expect(profile).toMatchObject({ width, height, fit: "fill" });
      expect(profile.pages).toHaveLength(t.pages?.length ?? 1);
      expect(invalidStyleKeys(profile.widgetTheme?.values ?? {})).toEqual([]);
      for (const page of profile.pages) {
        expect(page.placements.length).toBeGreaterThan(0);
        for (const z of page.placements) {
          const others = page.placements.filter((o) => o.id !== z.id);
          const rect = { col: z.colStart, row: z.rowStart, cols: z.colSpan, rows: z.rowSpan };
          expect(zoneFits(rect, others, profile.cols, profile.rows), `${page.name} ${z.module} at ${width}×${height}`).toBe(true);
          const meta = byId.get(z.module);
          expect(meta, z.module).toBeDefined();
          expect(z.colSpan).toBeGreaterThanOrEqual(meta?.minCols ?? 1);
          expect(z.rowSpan).toBeGreaterThanOrEqual(meta?.minRows ?? 1);
          expect(badSettings(z.module, z.settings ?? {})).toEqual([]);
        }
      }
      // Saved and loaded again, nothing is clamped or dropped.
      const loaded = mergeConfig({ ...defaultConfig(), version: CONFIG_VERSION, profiles: [profile] }).profiles[0];
      expect(loaded.pages).toEqual(profile.pages);
      expect({ cols: loaded.cols, rows: loaded.rows, background: loaded.background, theme: loaded.theme }).toEqual({
        cols: profile.cols,
        rows: profile.rows,
        background: profile.background,
        theme: profile.theme,
      });
    }
  });

  it.each(SCREEN_TEMPLATES.map((t) => [t.id, t] as const))("%s fits at least one class, its size's included, with a layout for each", (_id, t) => {
    expect(t.fits.length).toBeGreaterThan(0);
    if (t.size) expect(t.fits).toContain(shapeClassOf(t.size.width, t.size.height));
    for (const cls of t.fits) expect(t.layouts[cls]?.pages.length).toBe(t.pages?.length ?? 1);
  });

  it("has a native version of every InfoPanel template, listed under the same shapes", () => {
    for (const ip of TEMPLATES) {
      const port = SCREEN_TEMPLATES.find((t) => t.id === ip.id);
      expect(port?.port, ip.id).toBe(true);
      expect(port?.fits, ip.id).toEqual(ip.fits);
    }
  });

  it("splits the grid so its cells keep their shape at a longer size of the class", () => {
    expect(splitOf({ cols: 12, rows: 2 }, "strip", 1920, 480)).toEqual({ kx: 1, ky: 1 });
    expect(splitOf({ cols: 12, rows: 2 }, "strip", 1280, 160)).toEqual({ kx: 2, ky: 1 });
    expect(splitOf({ cols: 6, rows: 12 }, "tall", 480, 1920)).toEqual({ kx: 1, ky: 2 });
    // Never past the most columns a grid takes.
    expect(splitOf({ cols: 24, rows: 1 }, "strip", 4000, 100).kx).toBe(1);
  });

  it("binds a setting given by role to this machine's sensor, and lists what isn't found", () => {
    const minimal = SCREEN_TEMPLATES.find((t) => t.id === "minimal")!;
    const sensors: Record<string, DataApiValue> = {
      "libre.cpu_package": { value: 51, unit: "°C", name: "CPU Package", ref: "libre:/intelcpu/0/temperature/0" },
    };
    const { profile, unbound } = instantiate(minimal, { name: "M", width: 1920, height: 1080, sensors });
    const values = profile.pages[0].placements.filter((z) => z.module === "SensorValue");
    expect(values.map((z) => z.settings?.sensor)).toEqual(["libre.cpu_package", undefined, undefined]);
    expect(unbound).toEqual(["GPU temperature", "RAM load"]);
  });
});

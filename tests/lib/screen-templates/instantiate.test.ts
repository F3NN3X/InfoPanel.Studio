import { upgradeConfig } from "@/lib/config-upgrade";
import { describe, expect, it } from "vitest";
import { zoneFits } from "@/components/studio/zone-geometry";
import { invalidStyleKeys } from "@/lib/appearance-presets";
import { TEMPLATES } from "@/lib/infopanel/templates/catalog";
import { shapeClassOf, type ShapeClass } from "@/lib/infopanel/templates/layout";
import type { DataApiValue } from "@/lib/infopanel/sensors";
import { resolveRole, type Role } from "@/lib/infopanel/templates/roles";
import snapshot from "@/widgets/__fixtures__/snapshot.json";
import extra from "@/widgets/__fixtures__/extra.json";
import { CONFIG_VERSION, defaultConfig } from "@/lib/layout";
import { SCREEN_TEMPLATES } from "@/lib/screen-templates/catalog";
import { instantiate, splitOf, zoneZoom } from "@/lib/screen-templates/instantiate";
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

/** A real machine's sensors (the widgets' fixtures), and the same without the readings a role finds. */
const CAPTURE = { ...snapshot.sensors, ...extra.sensors } as unknown as Record<string, DataApiValue>;
const without = (roles: readonly Role[]) => {
  const gone = new Set(roles.map((r) => resolveRole(r, CAPTURE)?.key));
  return Object.fromEntries(Object.entries(CAPTURE).filter(([key]) => !gone.has(key)));
};
const MISSING: readonly Role[] = ["fps.low01", "gpu.hotspot", "cpu.ccd1", "cpu.ccd2", "vram.temp", "gpu.fan", "gpu.volt"];

/** Every template in every palette it offers, at each class it fits. */
const rows = SCREEN_TEMPLATES.flatMap((t) => t.fits.flatMap((cls) => (t.variants ?? [undefined]).map((v) => [t.id, cls, v?.id ?? "its own palette", t, v?.id] as const)));

describe("native screen templates", () => {
  it.each(rows)("%s at %s in %s makes a valid screen at two sizes, with this machine's sensors and without", (_id, cls, _palette, t, variant) => {
    for (const [width, height, sensors] of SIZES[cls].flatMap(([w, h]) => [[w, h, undefined], [w, h, CAPTURE], [w, h, without(MISSING)]] as const)) {
      const { profile } = instantiate(t, { name: t.name, variant, width, height, sensors });
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
      const loaded = upgradeConfig({ ...defaultConfig(), version: CONFIG_VERSION, profiles: [profile] }).profiles[0];
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
    expect(t.size.width).toBeGreaterThan(0);
    expect(t.size.height).toBeGreaterThan(0);
    expect(t.fits).toContain(shapeClassOf(t.size.width, t.size.height));
    for (const cls of t.fits) expect(t.layouts[cls]?.pages.length).toBe(t.pages?.length ?? 1);
  });

  it("has a native version of every InfoPanel template, listed under the same shapes", () => {
    for (const ip of TEMPLATES) {
      const port = SCREEN_TEMPLATES.find((t) => t.id === ip.id);
      expect(port?.port, ip.id).toBe(true);
      expect(port?.fits, ip.id).toEqual(ip.fits);
      // The same palettes, by id and in order, the first being the template's own.
      expect(port?.variants?.map((v) => v.id), ip.id).toEqual(ip.variants.map((v) => v.id));
    }
  });

  it("gives every palette other than the first something that changes the screen", () => {
    for (const t of SCREEN_TEMPLATES) {
      const [own, ...others] = t.variants ?? [];
      if (own) expect([own.theme, own.style, own.swap, own.zones, own.background], t.id).toEqual([undefined, undefined, undefined, undefined, undefined]);
      for (const v of others) {
        expect(v.theme ?? v.style ?? v.swap ?? v.zones ?? v.background, `${t.id} ${v.id}`).toBeDefined();
        const { width, height } = t.size;
        const a = instantiate(t, { name: t.name, width, height, sensors: CAPTURE });
        const b = instantiate(t, { name: t.name, variant: v.id, width, height, sensors: CAPTURE });
        expect(JSON.stringify([b.profile.theme, b.profile.widgetTheme, b.profile.background, b.profile.pages.map((p) => p.placements.map((z) => z.settings))]), `${t.id} ${v.id}`).not.toBe(
          JSON.stringify([a.profile.theme, a.profile.widgetTheme, a.profile.background, a.profile.pages.map((p) => p.placements.map((z) => z.settings))]),
        );
      }
    }
  });

  it("recolours a palette's zones and keeps the first palette as designed", () => {
    const glass = SCREEN_TEMPLATES.find((t) => t.id === "glass")!;
    const gauges = (variant?: string) => instantiate(glass, { name: "G", variant, width: 1920, height: 1080, sensors: CAPTURE }).profile.pages[0].placements.map((z) => z.settings?.accent).filter(Boolean);
    expect(gauges()).toEqual(["#60a5fa", "#a78bfa", "#22d3ee"]);
    expect(gauges("aurora")).toEqual(gauges());
    expect(gauges("sunset")).toEqual(["#fb7185", "#fdba74", "#f472b6"]);
    // An id the template doesn't have falls back to the first palette.
    expect(gauges("nope")).toEqual(gauges());
  });

  it("gives a reading whose sensor reports no unit the unit of its role", () => {
    const readout = SCREEN_TEMPLATES.find((t) => t.id === "readout")!;
    const unit = (u: string) => Object.fromEntries(Object.entries(CAPTURE).map(([k, v]) => [k, k === resolveRole("vram.used", CAPTURE)?.key ? { ...v, unit: u } : v]));
    const units = (sensors: Record<string, DataApiValue>) =>
      instantiate(readout, { name: "R", width: 1920, height: 1080, sensors }).profile.pages[0].placements.filter((z) => z.settings?.label === "VRAM").map((z) => z.settings?.unit);
    expect(units(unit(""))).toEqual(["MB", "MB"]);
    expect(units(unit("GB"))).toEqual([undefined, undefined]);
  });

  it("fills a missing reading from a similar one, or leaves it out and lets its neighbours take the room", () => {
    const tower = SCREEN_TEMPLATES.find((t) => t.id === "tower")!;
    const labels = (sensors: Record<string, DataApiValue>) =>
      instantiate(tower, { name: "T", width: 480, height: 1920, sensors }).profile.pages[0].placements.map((z) => z.settings?.label);
    // The capture has no 0.1% low reading and nothing else to stand in for it: its zone is left out.
    const here = labels(CAPTURE);
    expect(here).not.toContain("0.1% low");
    expect(here).toContain("1% low");
    expect(here).toHaveLength(16);
    // A missing fan is filled by another GPU reading the page doesn't show yet.
    const noFan = labels(without(["gpu.fan"]));
    expect(noFan).not.toContain("Fan");
    expect(noFan).toContain("Memory clock");
    expect(noFan).toHaveLength(16);
  });

  it("shrinks a zone's Size % with the screen's size below the template's own, within bounds", () => {
    const design = { width: 1000, height: 500 };
    expect(zoneZoom(design, 1000, 500)).toBe(1);
    // The tighter side decides.
    expect(zoneZoom(design, 1200, 500)).toBe(1);
    expect(zoneZoom(design, 800, 500)).toBe(0.8);
    expect(zoneZoom(design, 10, 10)).toBe(0.6);
    // A larger screen keeps it: the widget shell grows large zones itself.
    expect(zoneZoom(design, 10000, 10000)).toBe(1);
  });

  it("leaves a zone's Size % as designed at the template's size and above, and shrinks it below", () => {
    const quota = SCREEN_TEMPLATES.find((t) => t.id === "quota")!;
    const clock = (width: number, height: number) =>
      instantiate(quota, { name: "Q", width, height, sensors: CAPTURE }).profile.pages[0].placements.find((z) => z.module === "Clock")?.settings?.scale;
    expect(clock(quota.size.width, quota.size.height)).toBe(220);
    expect(clock(1920, 1080)).toBe(220);
    expect(clock(480, 320)).toBe(132);
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

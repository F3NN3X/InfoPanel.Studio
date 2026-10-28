import { describe, expect, it } from "vitest";
import { appearanceOf, lockedIn, resolveStyle, resolveWith, zoneResolver } from "@/lib/style-resolve";
import type { ThemeLevels } from "@/lib/theme-model";

const base = { accent: "#ff0000", surface: "theme", radius: "8" };
const profile = { values: { accent: "#00ff00", textColor: "#ffffff" } };
const own = { accent: "#0000ff", font: "mono", sensor: "libre.cpu", layout: "compact" };
const moduleDefaults = { surface: "bordered", padding: "4", label: "Legacy" };
const levels: ThemeLevels = { base, profile };
const CUSTOM = { colors: false, type: false } as const;

describe("resolveStyle", () => {
  it("layers default → the base layer → profile → own for custom sections", () => {
    const { settings, source } = resolveStyle({ moduleDefaults, levels, own, follow: CUSTOM });
    expect(settings).toEqual({
      surface: "theme",
      padding: "4",
      accent: "#0000ff",
      radius: "8",
      textColor: "#ffffff",
      font: "mono",
      sensor: "libre.cpu",
      layout: "compact",
    });
    expect(source).toEqual({
      surface: "app",
      padding: "default",
      accent: "own",
      radius: "app",
      textColor: "profile",
      font: "own",
    });
  });

  it("ignores the widget's own values in a following section (the default)", () => {
    const { settings, source } = resolveStyle({ levels, own });
    expect(settings.accent).toBe("#00ff00");
    expect(settings.font).toBeUndefined();
    expect(source.accent).toBe("profile");
    expect(Object.values(source)).not.toContain("own");
  });

  it("follows per section: Colors custom, Typography following", () => {
    const { settings } = resolveStyle({ levels, own, follow: { colors: false } });
    expect(settings.accent).toBe("#0000ff");
    expect(settings.font).toBeUndefined();
  });

  it("ignores own values in a section the profile locks, custom or not", () => {
    const locked: ThemeLevels = { base, profile: { ...profile, locks: { colors: true } } };
    const { settings, source } = resolveStyle({ levels: locked, own, follow: CUSTOM });
    expect(settings.accent).toBe("#00ff00");
    expect(settings.font).toBe("mono");
    expect(source.radius).toBe("app");
  });

  it("takes a page's values only for the sections the page makes its own", () => {
    const page = { values: { accent: "#123456", font: "serif" }, follow: { colors: false } };
    const { settings, source } = resolveStyle({ levels: { base, profile, page }, own });
    expect(settings.accent).toBe("#123456");
    expect(source.accent).toBe("page");
    expect(settings.font).toBeUndefined();
  });

  it("always keeps the other keys from the widget, never from a layer", () => {
    for (const follow of [undefined, CUSTOM]) {
      const { settings, source } = resolveStyle({ moduleDefaults, levels: { base: { ...base, sensor: "x" } }, own, follow });
      expect(settings.sensor).toBe("libre.cpu");
      expect(settings.layout).toBe("compact");
      expect(settings.label).toBeUndefined();
      expect(source.sensor).toBeUndefined();
    }
  });

  it("no longer layers autoScale, variant and compactView (per widget from v6)", () => {
    const { settings } = resolveStyle({ levels: { base: { variant: "studio" } }, own: { compactView: "on" } });
    expect(settings).toEqual({ compactView: "on" });
  });

  it("skips undefined values and empty layers", () => {
    expect(resolveStyle({})).toEqual({ settings: {}, source: {} });
    const { source } = resolveStyle({ levels: { base: { accent: undefined as never } }, own: { accent: "#123456" }, follow: CUSTOM });
    expect(source).toEqual({ accent: "own" });
  });
});

describe("resolveWith", () => {
  it("passes the own settings through without a theme", () => {
    expect(resolveWith(undefined, own, undefined)).toBe(own);
  });

  it("resolves under a theme and returns undefined when empty", () => {
    expect(resolveWith(levels, own, undefined)?.accent).toBe("#00ff00");
    expect(resolveWith(levels, own, { colors: false })?.accent).toBe("#0000ff");
    expect(resolveWith({}, undefined, undefined)).toBeUndefined();
    expect(resolveWith({}, undefined, undefined, moduleDefaults)).toEqual({ surface: "bordered", padding: "4" });
  });
});

describe("the app's clock", () => {
  it("is the clock where no level sets one; a level's \"auto\" (the locale's) beats it, as before v16", () => {
    const app = { base: { clock: "12" } };
    expect(resolveStyle({ levels: app }).settings.clock).toBe("12");
    expect(resolveStyle({ levels: app }).source.clock).toBe("app");
    expect(resolveStyle({ levels: { ...app, profile: { values: { clock: "24" } } } }).settings.clock).toBe("24");
    expect(resolveStyle({ levels: { ...app, profile: { values: { clock: "auto" } } } }).settings.clock).toBe("auto");
    expect(resolveStyle({ levels: app, own: { clock: "auto" }, follow: { format: false } }).settings.clock).toBe("auto");
    // With no app clock and no level's, the module default.
    expect(resolveStyle({ moduleDefaults: { clock: "auto" }, levels: { profile: { values: { clock: "auto" } } } }).settings.clock).toBe("auto");
  });
});

describe("appearanceOf / lockedIn", () => {
  const config = { general: { clock: "24" as const }, profiles: [{ id: "p", pages: [{ id: "a", name: "Desk" }, { id: "b", name: "Gaming" }] }] };

  it("collects the levels (the base: the app's clock) and the names a Follow bar shows", () => {
    const page = { values: { accent: "#123456" }, follow: { colors: false } };
    expect(appearanceOf(config, { id: "p", name: "Main", widgetTheme: profile, pageId: "b", pageTheme: page })).toEqual({
      base: { clock: "24" },
      profile,
      page,
      profileName: "Main",
      pageName: "Gaming",
    });
    expect(appearanceOf(config, { id: "p", name: "Main" }).pageName).toBe("Desk");
    expect(appearanceOf({}, undefined)).toEqual({ base: undefined, profile: undefined, page: undefined, profileName: undefined, pageName: undefined });
  });

  it("says whether the profile locks a section", () => {
    expect(lockedIn({ profile: { locks: { colors: true } } }, "colors")).toBe(true);
    expect(lockedIn({ profile: { locks: { colors: true } } }, "type")).toBe(false);
    expect(lockedIn(undefined, "colors")).toBe(false);
  });
});

describe("zoneResolver", () => {
  it("resolves each zone under the theme of its own page", () => {
    const z1 = { id: "z1", settings: { accent: "#0000ff" }, follow: { colors: false } };
    const z2 = { id: "z2", settings: { accent: "#0000ff" } };
    const resolve = zoneResolver(
      { general: { clock: "12" } },
      {
        widgetTheme: profile,
        pages: [
          { placements: [z1] },
          { placements: [z2], widgetTheme: { values: { accent: "#abcdef" }, follow: { colors: false } } },
        ],
      }
    );
    expect(resolve(z1)?.accent).toBe("#0000ff");
    expect(resolve(z2)?.accent).toBe("#abcdef");
    expect(resolve({ id: "elsewhere", settings: { accent: "#111111" } })).toEqual({ accent: "#111111" });
  });
});

describe("resolveStyle: the schema's perWidget rows and palette roles", () => {
  it("a perWidget row keeps its own value while its section follows", () => {
    const defs = [{ key: "accent", perWidget: true }];
    expect(resolveStyle({ levels, own: { accent: "#0000ff" }, defs }).settings.accent).toBe("#0000ff");
    expect(resolveStyle({ levels, own: { accent: "#0000ff" } }).settings.accent).toBe("#00ff00");
  });

  it("a colour row with a role reads the role's theme colour, its own value only while custom", () => {
    const defs = [{ key: "hotColor", role: "crit" as const }];
    const roleLevels: ThemeLevels = { profile: { values: { crit: "#ff0000" } } };
    expect(resolveStyle({ levels: roleLevels, own: { hotColor: "#123456" }, defs }).settings.hotColor).toBe("#ff0000");
    expect(resolveStyle({ levels: roleLevels, own: { hotColor: "#123456" }, follow: { palette: false }, defs }).settings.hotColor).toBe("#123456");
  });

  it("a threshold follows the theme until Thresholds is custom", () => {
    const own = { "warn.load": 70 };
    const theme: ThemeLevels = { profile: { values: { "warn.load": 85 } } };
    expect(resolveWith(theme, own, undefined)?.["warn.load"]).toBe(85);
    expect(resolveWith(theme, own, { thresholds: false })?.["warn.load"]).toBe(70);
  });
});

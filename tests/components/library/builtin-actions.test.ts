import { describe, expect, it, vi } from "vitest";
import type { AppearancePreset } from "@/lib/appearance-presets";
import { defaultConfig, type DashboardConfig } from "@/lib/layout";
import type { LibraryItem } from "@/lib/library";
import { builtinItems, configItems } from "@/lib/my-library/config-items";
import { duplicatePanel } from "@/components/library/library-actions";
import { resolveStyle } from "@/lib/style-resolve";
import { presetScopes, presetSecondary, type PresetContext } from "@/components/library/preset-actions";

/** A bridge over a plain config: each setConfig is applied in place, as the studio's history would. */
function ctxOver(start: DashboardConfig) {
  let config = start;
  const ctx = {
    bridge: {
      get config() {
        return config;
      },
      profileId: config.profiles[0].id,
      setConfig: (fn: (c: DashboardConfig) => DashboardConfig) => {
        config = fn(config);
      },
      toast: vi.fn(),
    },
    pageId: config.profiles[0].pages[0].id,
    selectionStyle: null,
    onEditInTheme: vi.fn(),
    select: vi.fn(),
    rename: vi.fn(),
  } as unknown as PresetContext;
  return { ctx, now: () => config };
}

const look: AppearancePreset = { id: "glass:ice", name: "Glass · Ice", description: "", theme: "ocean", radius: 0.75, style: { surface: "glass" }, background: { type: "color", color: "#001122" } };
const items = builtinItems({ looks: [look] });
const skin = items.find((i) => i.id === "builtin-skin:tui")!;
const lookItem = items.find((i) => i.kind === "theme")!;
const run = (list: { label: string; run: () => void }[], label: string) => list.find((a) => a.label === label)!.run();

describe("a skin in the Library", () => {
  it("applies at All screens, a screen or a page, as Theme › Start from does", () => {
    const { ctx, now } = ctxOver(defaultConfig());
    const [all, screen, page] = presetScopes(skin, ctx);
    all.run();
    expect(now().style).toMatchObject({ skin: "tui", surface: "auto" });
    screen.run();
    expect(now().profiles[0].widgetTheme?.values).toMatchObject({ skin: "tui" });
    expect(page.disabled).toBeFalsy();
    page.run();
    expect(now().profiles[0].pages[0].widgetTheme?.values).toMatchObject({ skin: "tui" });
  });

  it("shows on a page it is applied to: the page customises the sections it writes, not ones its screen locks", () => {
    const start = defaultConfig();
    const locked: DashboardConfig = {
      ...start,
      profiles: start.profiles.map((p, i) => (i === 0 ? { ...p, widgetTheme: { locks: { surface: true } } } : p)),
    };
    const { ctx, now } = ctxOver(locked);
    presetScopes(skin, ctx)[2].run();
    const profile = now().profiles[0];
    const page = profile.pages[0];
    expect(page.widgetTheme?.follow).toEqual({ skin: false });
    expect(resolveStyle({ levels: { base: now().style, profile: profile.widgetTheme, page: page.widgetTheme } }).settings.skin).toBe("tui");
  });

  it("duplicates into a saved Theme with the current colors and that skin; it can't be renamed or deleted", () => {
    const { ctx, now } = ctxOver(defaultConfig());
    const actions = presetSecondary(skin, ctx);
    expect(actions.map((a) => a.label)).toEqual(["Duplicate"]);
    run(actions, "Duplicate");
    const saved = now().appearancePresets![0];
    expect(saved).toMatchObject({ name: "TUI skin", theme: now().theme, radius: now().radius, style: { skin: "tui", surface: "auto" } });
  });
});

describe("a template look in the Library", () => {
  it("applies as a whole Theme, its background included", () => {
    const { ctx, now } = ctxOver(defaultConfig());
    presetScopes(lookItem, ctx)[0].run();
    expect(now().background).toMatchObject({ type: "color" });
    expect(now().radius).toBe(0.75);
  });

  it("duplicates into a saved Theme of the user's own, leaving the built-in as it was", () => {
    const { ctx, now } = ctxOver(defaultConfig());
    run(presetSecondary(lookItem, ctx), "Duplicate");
    const saved = now().appearancePresets![0];
    expect(saved).toMatchObject({ name: "Glass · Ice copy", radius: 0.75, style: { surface: "glass" } });
    expect(saved.id).not.toBe(look.id);
    saved.style.surface = "changed";
    expect(look.style.surface).toBe("glass");
  });
});

describe("a built-in palette in the Library", () => {
  it("duplicates into a saved palette, not a saved Theme", () => {
    const { ctx, now } = ctxOver(defaultConfig());
    const ocean = configItems(defaultConfig()).find((i) => i.id === "builtin-theme:ocean")!;
    run(presetSecondary(ocean, ctx), "Duplicate");
    expect(now().palettes).toMatchObject([{ name: `${ocean.name} copy`, tokens: (ocean.data as { tokens: object }).tokens }]);
    expect(now().appearancePresets).toBeUndefined();
  });
});

describe("duplicatePanel", () => {
  const builtin = items.find((i) => i.id === "builtin-panel:system")!;

  it("saves a built-in panel's copy as a panel of the user's own, with fresh widgets", () => {
    const next = duplicatePanel(defaultConfig(), builtin, "p1");
    const [copy] = next.panelPresets!;
    expect(copy).toMatchObject({ id: "p1", name: `${builtin.name} copy` });
    expect(copy.panel.widgets.length).toBeGreaterThan(0);
  });

  it("copies a saved panel under a new id and keeps the original", () => {
    const one = duplicatePanel(defaultConfig(), builtin, "p1");
    const saved = configItems(one).find((i) => i.kind === "panel") as LibraryItem;
    const two = duplicatePanel(one, saved, "p2");
    expect(two.panelPresets!.map((p) => [p.id, p.name])).toEqual([
      ["p1", `${builtin.name} copy`],
      ["p2", `${builtin.name} copy copy`],
    ]);
    expect(two.panelPresets![1].panel).not.toBe(two.panelPresets![0].panel);
  });

  it("leaves the config alone for a server item", () => {
    const config = defaultConfig();
    expect(duplicatePanel(config, { ...builtin, id: "lib_1" }, "p3")).toBe(config);
  });
});

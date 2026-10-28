import { describe, expect, it, vi } from "vitest";
import { defaultConfig, type DashboardConfig } from "@/lib/layout";
import type { LibraryItem } from "@/lib/library";
import { builtinItems, configItems } from "@/lib/my-library/config-items";
import { duplicatePanel } from "@/components/library/library-actions";
import { presetSecondary, type PresetContext } from "@/components/library/preset-actions";

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
    selectionStyle: null,
    select: vi.fn(),
    rename: vi.fn(),
  } as unknown as PresetContext;
  return { ctx, now: () => config };
}

const items = builtinItems();
const style = configItems(defaultConfig()).find((i) => i.id === "builtin-style:vivid")!;
const run = (list: { label: string; run: () => void }[], label: string) => list.find((a) => a.label === label)!.run();

describe("a built-in Style in the Library", () => {
  it("offers Duplicate only, which saves a Style of the user's own and leaves the built-in as it was", () => {
    const { ctx, now } = ctxOver(defaultConfig());
    const actions = presetSecondary(style, ctx);
    expect(actions.map((a) => a.label)).toEqual(["Duplicate"]);
    run(actions, "Duplicate");
    const [saved] = now().stylePresets!;
    expect(saved).toMatchObject({ name: "Frosted copy", settings: { surface: "glass" } });
    saved.settings.surface = "changed";
    expect((style.data as { settings: { surface: string } }).settings.surface).toBe("glass");
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

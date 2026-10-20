import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STANDARD_SETTINGS } from "@/modules/standard-settings";
import { isIslandKey } from "@/lib/island/sources";
import { isVisible } from "@/components/studio/inspector-model";
import { effectiveSettings, type ModuleSettings, type SensorMap } from "@/modules/types";
import snapshot from "@/widgets/__fixtures__/snapshot.json";
import { GROUP_D } from "@/widgets/registry/d";

const SPECS = import.meta.glob("/docs/redesign/widgets/docs/widgets/*.md", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const specBlock = (id: string): string => {
  const raw = Object.entries(SPECS).find(([p]) => p.endsWith(`/${id}.md`))?.[1] ?? "";
  return /Widget-specific:\s*```\r?\n([\s\S]*?)```/.exec(raw)?.[1] ?? "";
};

// Each spec prop and the settings that reach it (a flattened object prop is reached by its entries).
const MANIFEST: Record<string, Record<string, string[]>> = {
  FpsMonitor: { target: ["target"] },
  GameSpotlight: { layout: ["spotlightLayout"], motion: ["motion"], scrim: ["scrim"], music: ["music"], progress: ["progress"], vizMode: ["vizMode"] },
  OsdStrip: { cells: ["cells"], target: ["target"] },
  FramePacing: { budgets: ["budgets"], window: ["window"] },
  PlaytimeShare: { colors: ["color1", "color2", "color3", "color4", "color5", "color6"] },
  SteamProfile: {},
  SteamFriends: { view: ["view"], sort: ["sort"], showCounts: ["showCounts"], ingameOnly: ["ingameOnly"], showTime: ["showTime"], colors: ["ingameColor", "onlineColor", "awayColor", "busyColor", "offlineColor"] },
  SteamGame: { art: ["art"], scrim: ["scrim"] },
  Achievements: {},
  SteamLibrary: { showNews: ["showNews"] },
  SteamNews: { lines: ["lines"] },
};
// Props the template has that its spec block does not list.
const BEYOND_SPEC: Record<string, Record<string, string[]>> = {
  FpsMonitor: { view: ["view"], showMetrics: ["showMetrics"], sparkline: ["sparkline"], ringColor: ["ringColor"], sparkColor: ["sparkColor"] },
  GameSpotlight: { showStats: ["showStats"], showNews: ["showNews"] },
  Achievements: { display: ["display"] },
};

const SENSORS = (snapshot as unknown as { sensors: SensorMap }).sensors;
const STANDARD_KEYS = new Set(STANDARD_SETTINGS.map((s) => s.key));
// The island's "Send to island" toggle and its options are shared like the standard block: they reach no widget prop;
// nor does a read-only status row (SteamProfile's source).
const OWN_KEYS = (id: string): string[] =>
  (GROUP_D.find((m) => m.id === id)!.settings ?? []).filter((s) => !STANDARD_SETTINGS.includes(s) && !isIslandKey(s.key) && s.type !== "status").map((s) => s.key);

describe("group D inspector schema", () => {
  for (const [id, props] of Object.entries(MANIFEST)) {
    describe(id, () => {
      const mod = GROUP_D.find((m) => m.id === id)!;
      const all = { ...props, ...BEYOND_SPEC[id] };

      it("is registered", () => expect(mod).toBeDefined());

      it("keeps the manifest, keys and enum defaults, and renders from its defaults", () => {
        const block = specBlock(id);
        for (const p of Object.keys(props)) expect(block, p).toMatch(new RegExp(`\\b${p}\\b`));
        { // reaches every prop through exactly one setting each
          const own = OWN_KEYS(id);
          for (const [prop, via] of Object.entries(all)) for (const k of via) expect(own.filter((x) => x === k), `${prop} via ${k}`).toHaveLength(1);
          expect(own.sort()).toEqual(Object.values(all).flat().sort());
        }
        { // keeps its keys off the standard keys
          expect(OWN_KEYS(id).filter((k) => STANDARD_KEYS.has(k))).toEqual([]);
        }
        { // has every enum default inside its options
          for (const s of mod.settings ?? []) {
            if (s.type !== "select" || !s.options || s.multiple) continue;
            expect(s.options.map((o) => o.value), s.key).toContain(String(s.default));
          }
        }
        { // renders from its default settings
          expect(renderToString(mod.render(SENSORS, effectiveSettings(mod, {})) as never).length).toBeGreaterThan(0);
        }
      });
    });
  }
});

describe("group D dependent settings", () => {
  const shown = (id: string, values: ModuleSettings) => {
    const mod = GROUP_D.find((m) => m.id === id)!;
    return (mod.settings ?? []).filter((d) => isVisible(d, { ...effectiveSettings(mod, {}), ...values })).map((d) => d.key);
  };

  it("hides the gauge-only FpsMonitor settings in the frame-time graph", () => {
    const hidden = ["showMetrics", "sparkline", "ringColor", "sparkColor"];
    for (const k of hidden) expect(shown("FpsMonitor", {})).not.toContain(k);
    for (const view of ["gauge", "trend"]) for (const k of hidden) expect(shown("FpsMonitor", { view })).toContain(k);
    expect(shown("FpsMonitor", {})).toContain("target");
  });

  it("gates the GameSpotlight scrim, motion, music card and composite toggles on the layout", () => {
    const layouts: Record<string, string[]> = {
      hero: ["motion", "scrim"],
      ticker: ["motion"],
      poster: [],
      logo: ["motion", "scrim"],
      combo: ["motion", "scrim", "music", "progress"],
      composite: ["motion", "scrim", "showStats", "showNews"],
    };
    const gated = ["motion", "scrim", "music", "progress", "vizMode", "showStats", "showNews"];
    for (const [spotlightLayout, expected] of Object.entries(layouts)) {
      const keys = shown("GameSpotlight", { spotlightLayout });
      expect(gated.filter((k) => keys.includes(k)), spotlightLayout).toEqual(gated.filter((k) => expected.includes(k)));
    }
    expect(shown("GameSpotlight", { spotlightLayout: "combo", progress: "visualizer" })).toContain("vizMode");
  });

  it("offers no Hide when idle (removed)", () => {
    for (const mod of GROUP_D) expect((mod.settings ?? []).map((d) => d.key), mod.id).not.toContain("hideWhenIdle");
  });
});

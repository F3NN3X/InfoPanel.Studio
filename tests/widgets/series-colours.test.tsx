import { createElement as h, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { modules } from "@/modules";
import type { ModuleSettings } from "@/modules/types";
import { renderModule } from "@/widgets/test-render";
import { fixtureSensors } from "@/widgets/__fixtures__";
import { agentColour } from "@/widgets/coding-agents/colours";
import { toFlat } from "@/widgets/shared/data-adapter";
import { GlassPill } from "@/widgets/core/primitives";
import { meterColour, seriesColour, SkinCtx } from "@/widgets/core/theme";
import { skinContext } from "@/widgets/core/look";
import { WeatherGlyph } from "@/widgets/core/weather-icon";
import { levelOwnOf } from "@/widgets/shared/audio-settings";
import audioMeter from "@/widgets/audio-meter/widget";
import meterBridge from "@/widgets/meter-bridge/widget";
import NetworkThroughput from "@/widgets/network-throughput/NetworkThroughput";
import SteamFriends from "@/widgets/steam-friends/SteamFriends";
import SystemOverview from "@/widgets/system-overview/SystemOverview";
import volumeMixer from "@/widgets/volume-mixer/widget";
import waveLink from "@/widgets/wave-link/widget";

// v3: the widgets' own colours give way to a Look's series and meter colours (T3 `series-<n>`, `meter-ok`), and a colour a widget or
// the theme's palette sets wins over both. A Look that sets none draws, and writes its markup, as before.
const draw = (id: string, settings: ModuleSettings = {}) => renderModule(modules.find((m) => m.id === id)!, settings);
/** A widget's component with a pack Look's T3 values, as the module hands them (`t3`), on the widget fixtures. */
const view = (C: (p: never) => ReactElement, props: Record<string, unknown>) => renderToString(h(C as (p: Record<string, unknown>) => ReactElement, { data: toFlat(fixtureSensors()), ...props }));
const T3 = { "series-1": "{accent}", "series-2": "{muted}" };
const LOOK = { series: ["var(--w-accent)", "var(--w-muted)"] };

describe("series colours", () => {
  it("are the Look's series over the widget's own colour", () => {
    expect(seriesColour({}, 2, "#a78bfa")).toBe("#a78bfa");
    expect(seriesColour(LOOK, 2, "#a78bfa")).toBe("var(--w-s2)");
    expect(seriesColour(LOOK, 3, "#2dd4bf")).toBe("#2dd4bf");
    expect([agentColour({}, "claude"), agentColour({}, "codex")]).toEqual(["#d97757", "#10a37f"]);
    expect([agentColour(LOOK, "claude"), agentColour(LOOK, "codex")]).toEqual(["var(--w-s1)", "var(--w-s2)"]);
  });

  it("System Overview's sections take the Look's series over their own palette; a section colour set on the widget wins", () => {
    expect(view(SystemOverview, { sections: ["cpu", "gpu", "ram"] })).toContain("--w-accent:#38bdf8");
    const worn = view(SystemOverview, { sections: ["cpu", "gpu", "ram"], t3: T3 });
    // the card resolves the series, so a section's own --w-accent never reads itself
    expect(worn).toContain("--w-s1:var(--w-accent);--w-s2:var(--w-muted)");
    for (const c of ["--w-accent:var(--w-s1)", "--w-accent:var(--w-s2)", "--w-accent:#2dd4bf"]) expect(worn, c).toContain(c);
    expect(worn).not.toContain("#38bdf8");
    expect(view(SystemOverview, { sections: ["cpu"], t3: T3, colors: { cpu: "#123456" } })).toContain("--w-accent:#123456");
  });

  it("Network Traffic's download and upload take Series 1 and 2 over the accent and its turn", () => {
    expect(view(NetworkThroughput, {})).toContain("calc(h + 70)");
    const worn = view(NetworkThroughput, { t3: { ...T3, "series-2": "#5EF6FF" } });
    expect(worn).toContain("--w-s2:#5EF6FF");
    expect(worn).not.toContain("calc(h + 70)");
    const set = view(NetworkThroughput, { t3: { ...T3, "series-2": "#5EF6FF" }, uploadColor: "#123456" });
    expect(set).toContain("#123456");
    expect(set).not.toContain("var(--w-s2)");
  });

  it("Steam Friends' in-game and offline take Series 1 and 2 over Steam's colours; the statuses keep their own rows", () => {
    expect(view(SteamFriends, {})).toContain("#90ba3c");
    const worn = view(SteamFriends, { t3: T3 });
    expect(worn).not.toContain("#90ba3c");
    expect(worn).toContain("var(--w-s1)");
    expect(view(SteamFriends, { t3: T3, colors: { ingame: "#123456" } })).toContain("#123456");
  });
});

describe("meter colours", () => {
  it("the level colour the theme hands down (its OK) gives way to the Look's meter colour; one of the widget's own stays", () => {
    expect(meterColour({}, undefined)).toBe("var(--w-accent)");
    expect(meterColour({}, "#2BF59A", false)).toBe("#2BF59A");
    expect(meterColour({ meterOk: "var(--w-accent)" }, "#2BF59A", false)).toBe("var(--w-accent)");
    expect(meterColour({ meterOk: "var(--w-accent)" }, "#123456", true)).toBe("#123456");
    expect(levelOwnOf({ levelColor: "#2bf59a", ok: "#2BF59A" })).toBe(false);
    expect(levelOwnOf({ levelColor: "", ok: "#2BF59A" })).toBe(false);
    expect(levelOwnOf({ levelColor: "#123456", ok: "#2BF59A" })).toBe(true);
    expect(levelOwnOf({ levelColor: "#123456" })).toBe(true);
    // the zone's own settings hold no OK: the theme's is in the settings as the theme resolves them
    expect(levelOwnOf({ levelColor: "#2BF59A" }, { ok: "#2BF59A" })).toBe(false);
  });

  it.each([
    ["Audio Meter", audioMeter],
    ["Meter Bridge", meterBridge],
    ["Volume Mixer", volumeMixer],
    ["Wave Link", waveLink],
  ])("%s tells the theme's level colour from its own", (_, def) => {
    const props = (s: ModuleSettings) => def.render.toProps(s, { ...s, ok: "#2BF59A" }) as { levelOwn?: boolean };
    expect(props({ levelColor: "#2BF59A" }).levelOwn).toBe(false);
    expect(props({ levelColor: "#123456" }).levelOwn).toBe(true);
  });

  it("Audio Meter draws its ladder in the Look's meter colour unless the colour is its own; Classic's keeps its level colour", () => {
    expect(draw("AudioMeter")).toContain("background:var(--w-accent)");
    expect(draw("AudioMeter", { levelColor: "#123456" })).toContain("background:#123456");
  });
});

describe("the chips and icons a Look reaches", () => {
  it("a pill on artwork is a chip, so a pack's badge style reaches it", () => {
    expect(renderToString(h(GlassPill, null, "Live"))).toContain('data-part="chip"');
  });

  it("weather glyphs take a Look's icon colour: the app icons always, Meteocons as one colour while the widget keeps the default style", () => {
    const glyph = (props: Record<string, unknown>, iconColor?: string) =>
      renderToString(h(SkinCtx.Provider, { value: { ...skinContext("default"), ...(iconColor ? { iconColor } : null) } }, h(WeatherGlyph, { kind: "clear", night: false, ...props })));
    expect(glyph({}, "#5EF6FF")).toContain("color:#5EF6FF");
    expect(glyph({ set: "meteocons", themed: true }, "#5EF6FF")).toContain("color:#5EF6FF");
    // a style the widget chose is its own; without a Look icon colour nothing changes
    expect(glyph({ set: "meteocons", style: "fill", themed: false }, "#5EF6FF")).not.toContain("#5EF6FF");
    expect(glyph({ set: "meteocons", themed: true })).not.toContain("color:");
    expect(glyph({})).not.toContain("color:");
  });
});

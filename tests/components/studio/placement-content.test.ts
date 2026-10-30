import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { placementContent, placementPrefixes } from "@/components/studio/placement-content";
import { BLANK_MODULE, CANVAS_ID, CARDS_ID, NOT_LOADED, type Placement } from "@/lib/layout";
import { YR_FORECAST_KEY } from "@/lib/sensors";
import { SENSORLESS } from "@/widgets/module";
import { TEMPLATE_MODULES } from "@/widgets/registry";
import { fixtureSensors } from "@/widgets/__fixtures__";

const place = (extra: Partial<Placement>): Placement =>
  ({ id: "p", module: "", col: 1, row: 1, colSpan: 2, rowSpan: 1, visible: true, ...extra }) as Placement;

describe("placementPrefixes", () => {
  it("reads a module's owned and read prefixes", () => {
    expect(placementPrefixes(place({ module: "Departures" }))).toEqual(["plugins.InfoPanel.VBZ."]);
    expect(placementPrefixes(place({ module: "NowPlaying" }))).toEqual([
      "plugins.media-plugin.",
      "plugins.spotify-plugin.",
      "spotify.",
      "plugins.audio-level-meter.",
    ]);
  });

  it("subscribes a panel to its visible widgets' keys", () => {
    const panel = {
      title: "t",
      widgets: [
        { id: "a", kind: "stat", visible: true, sensor: "libre.cpu_load", subSensor: "libre.cpu_temp" },
        { id: "b", kind: "table", visible: true, sensor: YR_FORECAST_KEY },
        { id: "c", kind: "stat", visible: false, sensor: "system.ram.load" },
        { id: "d", kind: "clock", visible: true },
      ],
    };
    expect(placementPrefixes(place({ module: "panel", panel } as Partial<Placement>))).toEqual([
      "libre.cpu_load",
      "libre.cpu_temp",
      "plugins.yr-weather-plugin.",
    ]);
  });

  it("needs everything for the cards grid and nothing for blank or sensorless zones", () => {
    expect(placementPrefixes(place({ module: CARDS_ID }))).toBeNull();
    expect(placementPrefixes(place({ module: BLANK_MODULE }))).toEqual([]);
    expect(placementPrefixes(place({ module: "unknown" }))).toEqual([]);
  });

  it("subscribes a template that reads unnamed keys to every stream, but not a sensorless one", () => {
    for (const id of ["SystemOverview", "SensorValue", "Thermals", "GameSpotlight"]) expect(placementPrefixes(place({ module: id }))).toBeNull();
    for (const id of ["WaveLink", "WebPage"]) expect(placementPrefixes(place({ module: id }))).toEqual([]);
  });

  it("subscribes a template to the streams it reads but does not own", () => {
    // the visualiser's levels (it read them only when another zone on the profile opened that stream)
    expect(placementPrefixes(place({ module: "NowPlaying" }))).toContain("plugins.audio-level-meter.");
    expect(placementPrefixes(place({ module: "Calendar" }))).toEqual(["plugins.clock-plugin."]);
  });

  it("subscribes a template to the sensor its settings bind, and to the weather it reads", () => {
    expect(placementPrefixes(place({ module: "RadialClockStack" }))).toEqual([]);
    expect(placementPrefixes(place({ module: "RadialClockStack", settings: { sensor: "libre.cpu_total" } }))).toEqual(["libre.cpu_total"]);
    expect(placementPrefixes(place({ module: "DayPlanner" }))).toEqual(["plugins.yr-weather-plugin."]);
  });

  it("subscribes a canvas zone to the keys its items read", () => {
    const canvas = { items: [{ kind: "Sensor", $: { key: "libre.cpu" } }, { kind: "Group", DisplayItems: [{ kind: "Bar", $: { key: "libre.gpu" } }] }] };
    expect(placementPrefixes(place({ module: CANVAS_ID, canvas: canvas as never }))).toEqual(["libre.cpu", "libre.gpu"]);
    expect(placementPrefixes(place({ module: CANVAS_ID }))).toEqual([]);
  });
});

describe("canvas zones", () => {
  it("names the zone after the imported profile and draws nothing without a canvas", () => {
    const canvas = { format: "infopanel-canvas", version: 1, source: { name: "ARCv2" }, items: [] } as never;
    const r = placementContent(place({ module: CANVAS_ID, canvas }), {}, []);
    expect(r).toMatchObject({ hasData: true, title: "ARCv2" });
    expect(placementContent(place({ module: CANVAS_ID }), {}, [])).toMatchObject({ content: null, hasData: false, title: "InfoPanel canvas" });
  });

  it("says in the studio that a canvas only its canvasRef points at isn't loaded yet (Edit v3 SPEC §15)", () => {
    const r = placementContent(place({ module: CANVAS_ID, canvasRef: "abc" }), {}, [], undefined, true);
    expect(r.hasData).toBe(true);
    expect(renderToString(r.content).replaceAll("&#x27;", "'")).toContain(NOT_LOADED);
  });
});

describe("a widget this build doesn't have (Edit v3 SPEC §15)", () => {
  it("draws the grey box, so the zone is kept and shown, not dropped", () => {
    const r = placementContent(place({ module: "FromANewerBuild" }), {}, []);
    expect(r.hasData).toBe(true);
    expect(renderToString(r.content)).toContain("Widget not available in this version");
  });
});

describe("placementContent", () => {
  const paused = { "plugins.media-plugin.media.playback-state": { value: 1 } } as never;
  const playing = { "plugins.media-plugin.media.playback-state": { value: 2 } } as never;

  it("shows a widget with a stored Hide when idle (removed) while its source is idle", () => {
    const hiding = place({ module: "NowPlaying", settings: { source: "media", hideWhenIdle: true } });
    for (const sensors of [paused, playing]) {
      const r = placementContent(hiding, sensors, []);
      expect(r.hasData).toBe(true);
      expect("idle" in r).toBe(false);
    }
  });

  it("resolves the look under the theme (frame tokens follow it)", () => {
    const accent = (p: Placement, a: Parameters<typeof placementContent>[3]) =>
      (placementContent(p, paused, [], a).scope as Record<string, string> | undefined)?.["--accent"];
    const global = { base: { accent: "#ff0000" }, profile: { values: { accent: "#00ff00" } } };
    const media = place({ module: "NowPlaying" });
    expect(accent(media, undefined)).toBeUndefined();
    expect(accent(media, { base: { accent: "#ff0000" } })).toBe("0 100% 50%");
    expect(accent(media, global)).toBe("120 100% 50%");
    const own = place({ module: "NowPlaying", settings: { source: "media", accent: "#0000ff", hideWhenIdle: true }, follow: { colors: false } });
    expect(accent(own, global)).toBe("240 100% 50%");
    expect(accent({ ...own, follow: undefined }, global)).toBe("120 100% 50%");
    expect(accent(own, { ...global, profile: { ...global.profile, locks: { colors: true } } })).toBe("120 100% 50%");
  });
});

describe("template zones with no data", () => {
  it("keeps an explicit allow-list of the templates that render without sensor keys", () => {
    expect([...SENSORLESS].sort()).toEqual(["AudioButton", "AudioFader", "Calendar", "Clock", "CodingAgents", "DayPlanner", "OnAirBeacon", "RadialClockStack", "StreamMixer", "Timer", "WaveLink", "WebPage"]);
  });

  it("hides every other template on an empty map and shows it with data", () => {
    const sensors = fixtureSensors();
    for (const mod of TEMPLATE_MODULES) {
      const p = place({ module: mod.id });
      expect(placementContent(p, {}, []).hasData, `${mod.id} empty`).toBe(SENSORLESS.has(mod.id));
      expect(placementContent(p, sensors, []).hasData, `${mod.id} fixture`).toBe(true);
    }
  });
});

describe("Other sensors zone", () => {
  const unclaimed = [
    ["acme.temp", { value: 41.25, unit: "°C", name: "Acme Board Temp" }],
    ["acme.note", { text: "line one\nline two", unit: "" }],
  ] as never as Parameters<typeof placementContent>[2];
  const html = (extra: Partial<Placement> = {}) => {
    const r = placementContent(place({ module: CARDS_ID, colSpan: 4, ...extra }), {}, unclaimed);
    return renderToString(r.content as never);
  };

  it("renders each unclaimed sensor as a sensor widget, named by its display name or key", () => {
    const out = html();
    expect(out).toContain("Acme Board Temp");
    expect(out).toContain("41");
    expect(out).toContain("acme.note");
    expect(out).toContain("line one");
  });

  it("lays the cards out on the sub-grid column rule", () => {
    const cols = (colSpan: number) => html({ colSpan }).match(/repeat\((\d), minmax/)?.[1];
    expect([cols(2), cols(4), cols(8)]).toEqual(["2", "3", "4"]);
  });

  it("honours the zone's card settings (accent) and defaults to the theme surface", () => {
    expect(html({ settings: { accent: "#ff0000" } })).toContain("--accent:#ff0000");
    expect(html()).not.toContain("--accent:#ff0000");
    expect(html()).toContain("var(--card)");
    expect(html({ settings: { surface: "glass" } })).not.toContain("var(--card)");
  });

  it("keeps image values as images", () => {
    const pics = [["acme.cover_url", { text: "https://example.com/cover.png", unit: "" }]] as never as Parameters<typeof placementContent>[2];
    const out = renderToString(placementContent(place({ module: CARDS_ID }), {}, pics).content as never);
    expect(out).toContain('<img src="https://example.com/cover.png"');
  });

  it("has no data when nothing is unclaimed", () => {
    expect(placementContent(place({ module: CARDS_ID }), {}, []).hasData).toBe(false);
  });
});

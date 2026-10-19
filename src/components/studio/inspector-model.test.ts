import { describe, expect, it } from "vitest";
import { modules } from "@/modules";
import { CARD_SETTINGS, PANEL_SETTINGS, PROFILE_STYLE_SETTINGS } from "@/modules/standard-settings";
import { isMore, settingKeys, type DashboardModule, type ModuleSetting } from "@/modules/types";
import { TITLE_ONLY_HINT } from "./inspector-categories";
import {
  allSections,
  changedCount,
  extraMatches,
  jumpTarget,
  sharedDefs,
  visibleSections,
  globalStyleValues,
  isVisible,
  inspectorNotes,
  inspectorTabs,
  lookEditPatch,
  resetKeysOfSection,
  searchAll,
  sectionsFor,
  sourceState,
  splitMore,
  tabChangedCounts,
  tabStates,
  widgetContext,
  widgetLookValues,
  type InspectorContext,
  type InspectorSection,
} from "./inspector-model";

const mod = (id: string): DashboardModule => modules.find((m) => m.id === id)!;
const ids = (sections: InspectorSection[]) => sections.map((s) => s.id);
const titles = (sections: InspectorSection[]) => sections.map((s) => s.title);
const keysOf = (sections: InspectorSection[]) => sections.flatMap((s) => s.settings.map((d) => d.key));
const find = (sections: InspectorSection[], title: string) => sections.find((s) => s.title === title)!;

const spotify = widgetContext(mod("NowPlaying"));
const system = widgetContext(mod("SystemOverview"));
const webpage = widgetContext(mod("WebPage"));
const panel: InspectorContext = { kind: "panel", defs: PANEL_SETTINGS };

describe("every setting is in exactly one section of exactly one tab", () => {
  // A widget without a header has no Show title row; a title-only one keeps it behind More (a stored "off" stays reachable).
  const shown = (m: DashboardModule) => (m.settings ?? []).filter((d) => !(d.key === "showTitle" && m.header === "none"));
  const contexts: [string, InspectorContext, ModuleSetting[]][] = [
    ...modules.map((m): [string, InspectorContext, ModuleSetting[]] => [m.id, widgetContext(m), shown(m)]),
    ["cards", { kind: "widget", defs: CARD_SETTINGS }, CARD_SETTINGS],
    ["panel", panel, PANEL_SETTINGS],
  ];

  it.each(contexts)("%s", (_name, context, defs) => {
    const sections = allSections(context);
    expect(new Set(ids(sections)).size).toBe(sections.length);
    const tabs = new Set(inspectorTabs(context).map((t) => t.id));
    for (const s of sections) expect(tabs.has(s.tab), s.id).toBe(true);
    const listed = keysOf(sections);
    expect(new Set(listed).size).toBe(listed.length);
    // The tabs partition the same sections.
    const byTab = [...tabs].flatMap((tab) => sectionsFor(context, tab));
    expect(ids(byTab).sort()).toEqual(ids(sections).sort());
    expect([...listed].sort()).toEqual(defs.map((d) => d.key).sort());
  });

  it("holds the multi-select's shared look and the global style, each once", () => {
    for (const context of [
      { kind: "multi", defs: CARD_SETTINGS } as InspectorContext,
      { kind: "dashboard", scope: "all" } as InspectorContext,
    ]) {
      const listed = keysOf(allSections(context));
      expect(new Set(listed).size).toBe(listed.length);
    }
    const global = keysOf(sectionsFor({ kind: "dashboard", scope: "all" }, "gstyle"));
    expect([...global].sort()).toEqual(PROFILE_STYLE_SETTINGS.map((d) => d.key).sort());
  });
});

describe("inspectorTabs", () => {
  it("has Show, Style, Data and Behaviour for widgets and panels", () => {
    for (const context of [spotify, panel]) {
      expect(inspectorTabs(context)).toEqual([
        { id: "show", label: "Show" },
        { id: "style", label: "Style" },
        { id: "data", label: "Data" },
        { id: "behaviour", label: "Behaviour" },
      ]);
    }
  });

  it("has none for a blank zone or several zones", () => {
    expect(inspectorTabs({ kind: "blank" })).toEqual([]);
    expect(inspectorTabs({ kind: "multi", defs: CARD_SETTINGS })).toEqual([]);
  });

  it("has the four dashboard tabs", () => {
    expect(inspectorTabs({ kind: "dashboard", scope: "all" }).map((t) => t.id)).toEqual([
      "profile",
      "appearance",
      "gstyle",
      "general",
    ]);
  });
});

describe("widget sections", () => {
  it("files Header, the widget's own sections and Fit in Show", () => {
    expect(titles(sectionsFor(spotify, "show"))).toEqual(["Header", "Now playing", "Visualizer", "Cover art", "Visualizer shape", "Fit"]);
    expect(find(sectionsFor(spotify, "show"), "Header").extras.map((e) => e.kind)).toEqual(["widgetPicker", "visible"]);
    expect(keysOf([find(sectionsFor(spotify, "show"), "Fit")])).toEqual(["layout", "variant", "compactView"]);
  });

  it("files the look sections in Style, the widget's colors as Widget colors", () => {
    const style = sectionsFor(system, "style");
    expect(titles(style)).toEqual([
      "Skin & graphics",
      "Colors",
      "Widget colors",
      "Surface",
      "Typography",
      "Size & spacing",
      "Border & glow",
      "Custom CSS",
    ]);
    expect(find(style, "Widget colors").settings.map((d) => d.key)).toContain("cpuColor");
    expect(find(style, "Colors").extras.map((e) => e.kind)).toEqual(["styleMode", "styleTools"]);
    expect(find(style, "Border & glow").extras).toEqual([{ kind: "zoneFrame", more: true, count: 3 }]);
  });

  it("files the other color-picker groups in Widget colors too, not behind More", () => {
    for (const [id, keys] of [
      ["SensorGroup", ["tempColor", "fanColor", "powerColor"]],
      ["FpsMonitor", ["ringColor", "sparkColor"]],
      ["Bluetooth", ["batteryMidColor", "batteryLowColor"]],
      ["NetworkThroughput", ["downloadColor", "uploadColor"]],
    ] as const) {
      const context = widgetContext(mod(id));
      expect(keysOf(sectionsFor(context, "show")), id).not.toContain(keys[0]);
      const palette = find(sectionsFor(context, "style"), "Widget colors");
      expect(palette.settings.map((d) => d.key), id).toEqual(expect.arrayContaining([...keys]));
      expect(palette.settings.filter(isMore), id).toEqual([]);
    }
  });

  it("keeps the meter's colors in Show, behind its More one by one", () => {
    const meter = find(sectionsFor(widgetContext(mod("AudioMeter")), "show"), "Meter");
    expect(meter.settings.filter(isMore).map((d) => d.key)).toEqual(["levelColor", "hotColor"]);
  });

  it("files the device and Audio source in Data, after the bound data", () => {
    const data = sectionsFor(spotify, "data");
    expect(titles(data)).toEqual(["Bound data", "Visualizer", "Audio source"]);
    expect(data[0]).toMatchObject({ special: "boundData" });
    expect(keysOf(data)).toEqual(["liveSource", "liveCapture", "liveSources"]);
    expect(titles(sectionsFor(spotify, "show"))).not.toContain("Audio source");
  });

  it("files thresholds, the widget's behaviour, the island and graph updates in Behaviour", () => {
    expect(titles(sectionsFor(system, "behaviour"))).toEqual(["Thresholds", "Trends", "Motion"]);
    expect(keysOf([find(sectionsFor(system, "behaviour"), "Thresholds")])).toEqual(["tempWarn", "tempCrit", "vramWarn", "loadWarn", "loadCrit"]);
    expect(titles(sectionsFor(spotify, "behaviour"))).toEqual(["Visualizer dynamics", "Dynamic Island", "Motion"]);
    expect(keysOf([find(sectionsFor(spotify, "behaviour"), "Motion")])).toEqual(["smoothing"]);
    expect(keysOf(sectionsFor(widgetContext(mod("GpuMonitor")), "behaviour"))).toEqual(["warnTemp", "critTemp", "smoothing"]);
    expect(sectionsFor(webpage, "behaviour")).toEqual([]);
  });

  it("files every island setting in Behaviour › Dynamic Island", () => {
    for (const m of modules) {
      const island = allSections(widgetContext(m)).filter((s) => s.settings.some((d) => d.key === "island"));
      if (island.length === 0) continue;
      expect(island.map((s) => [s.tab, s.title]), m.id).toEqual([["behaviour", "Dynamic Island"]]);
    }
  });

  it("offers no Hide when idle (removed), and Layout only to adaptive ones", () => {
    for (const m of modules) {
      const sections = allSections(widgetContext(m));
      const keys = keysOf(sections);
      expect(keys.includes("hideWhenIdle"), `${m.id} idle`).toBe(false);
      const adaptive = (m.settings ?? []).some((d) => d.key === "layout");
      expect(keys.includes("layout"), `${m.id} layout`).toBe(adaptive);
    }
    const adaptive = modules.filter((m) => (m.settings ?? []).some((d) => d.key === "layout")).map((m) => m.id);
    expect(adaptive).toContain("NowPlaying");
    expect(adaptive).not.toContain("WebPage");
  });

  it("still has a Header when the schema has no setting in it (the picker lives there)", () => {
    const sections = sectionsFor({ kind: "widget", defs: [] }, "show");
    expect(titles(sections)).toEqual(["Header"]);
    expect(sections[0].settings).toEqual([]);
    expect(sections[0].extras.map((e) => e.kind)).toEqual(["widgetPicker", "visible"]);
  });
});

describe("tabs of every widget", () => {
  it.each(modules.map((m) => [m.id, m] as const))("%s: four tabs, an empty one disabled", (id, m) => {
    const context = widgetContext(m);
    const sections = allSections(context);
    const tabs = tabStates(inspectorTabs(context), sections);
    expect(tabs.map((t) => t.id)).toEqual(["show", "style", "data", "behaviour"]);
    for (const t of tabs) expect(t.disabled, `${id} ${t.id}`).toBe(!sections.some((s) => s.tab === t.id));
    // Only the Web Page has nothing to do in Behaviour (no graph updates, island or thresholds).
    expect(tabs.filter((t) => t.disabled).map((t) => t.id)).toEqual(id === "WebPage" ? ["behaviour"] : []);
  });
});

describe("header modes", () => {
  const NO_HEADER = ["Calendar", "GameSpotlight", "KpiTiles", "MenuBar", "OsdStrip", "SteamGame", "Vitals", "WebPage"];
  const TITLE_ONLY = ["Clock", "SystemOverview"];

  it("declares the header and small-zone shape of every widget", () => {
    for (const m of modules) {
      expect(m.header, m.id).toBeDefined();
      expect(m.compact, m.id).toBeDefined();
    }
    expect(modules.filter((m) => m.header === "none").map((m) => m.id).sort()).toEqual(NO_HEADER);
    expect(modules.filter((m) => m.header === "title-only").map((m) => m.id).sort()).toEqual(TITLE_ONLY);
    const noCard = modules.filter((m) => !m.compact?.card).map((m) => m.id).sort();
    expect(noCard).toEqual(["Clock", "CoreHeatmap", "CustomGauge", "GpuRings", "MeterBridge", "SystemOverview", "Timer", "Visualizer", "WebPage"]);
  });

  it("shows Show title, Title and Icon (More) on a widget with a header", () => {
    const header = find(sectionsFor(spotify, "show"), "Header");
    expect(header.settings.map((d) => [d.key, isMore(d)])).toEqual([["showTitle", false], ["label", false], ["icon", true]]);
  });

  it("shows Title (with its hint) and Icon on a title-only widget, Show title behind More", () => {
    for (const id of TITLE_ONLY) {
      const header = find(sectionsFor(widgetContext(mod(id)), "show"), "Header");
      expect(header.settings.map((d) => d.key), id).toEqual(["showTitle", "label", "icon"]);
      expect(header.settings[0].more, id).toBe(true);
      expect(header.settings[1].hint, id).toBe(TITLE_ONLY_HINT);
      expect(isVisible(header.settings[1], { showTitle: false }), id).toBe(true);
    }
  });

  it("has no Header on a widget without one: Title and Icon close Fit, the picker moves to the first Show section", () => {
    for (const id of NO_HEADER) {
      const show = sectionsFor(widgetContext(mod(id)), "show");
      expect(titles(show), id).not.toContain("Header");
      expect(keysOf(show), id).not.toContain("showTitle");
      expect(show[0].extras.map((e) => e.kind), id).toEqual(["widgetPicker", "visible"]);
      if (id === "WebPage") continue;
      expect(keysOf([find(show, "Fit")]).slice(-2), id).toEqual(["label", "icon"]);
    }
  });
});

describe("Web Page", () => {
  it("offers only the few look settings it has, each in its normal section, and no custom CSS", () => {
    expect(titles(sectionsFor(webpage, "style"))).toEqual(["Colors", "Size & spacing", "Border & glow"]);
    expect(keysOf(sectionsFor(webpage, "style"))).toContain("scale");
    expect(keysOf(sectionsFor(webpage, "style"))).not.toContain("customCss");
    expect(titles(sectionsFor(webpage, "show"))).toEqual(["Page"]);
    expect(keysOf(sectionsFor(webpage, "show"))).toEqual(["url"]);
  });

  it("says so in a note on the Style tab", () => {
    expect(inspectorNotes(webpage, "style").map((n) => n.kind)).toEqual(["reduced"]);
    expect(inspectorNotes(webpage, "show")).toEqual([]);
  });
});

describe("panel sections", () => {
  it("lists Panel, Layout and Widgets, then the Header, in Show", () => {
    expect(titles(sectionsFor(panel, "show"))).toEqual(["Panel", "Layout", "Widgets", "Header"]);
    expect(find(sectionsFor(panel, "show"), "Header").extras.map((e) => e.kind)).toEqual(["visible"]);
    expect(keysOf([find(sectionsFor(panel, "show"), "Header")])).toEqual(["label", "icon"]);
  });

  it("adds Background for an overlay and the selected widget's cards after the list", () => {
    const overlay: InspectorContext = { ...panel, layout: "overlay", selectedWidget: true } as InspectorContext;
    expect(titles(sectionsFor(overlay, "show"))).toEqual([
      "Panel",
      "Layout",
      "Background",
      "Widgets",
      "Selected · widget",
      "Display",
      "Size & placement",
      "Typography & colors",
      "Selected · Advanced",
      "Header",
    ]);
    expect(
      titles(sectionsFor({ ...overlay, selectedLabel: "Slider" } as InspectorContext, "show")).filter((t) => t.startsWith("Selected ·"))
    ).toEqual(["Selected · Slider", "Selected · Advanced"]);
  });

  it("swaps the layout and widget cards for the JSON in the code view", () => {
    const code: InspectorContext = { ...panel, codeView: true } as InspectorContext;
    expect(titles(sectionsFor(code, "show"))).toEqual(["Panel", "Panel JSON", "Header"]);
  });

  it("has the same look sections as a widget, lists its sensors in Data and its graph updates in Behaviour", () => {
    expect(titles(sectionsFor(panel, "style"))).toEqual([
      "Skin & graphics",
      "Colors",
      "Surface",
      "Typography",
      "Size & spacing",
      "Border & glow",
      "Custom CSS",
    ]);
    expect(sectionsFor(panel, "data")).toHaveLength(1);
    expect(sectionsFor(panel, "data")[0].special).toBe("panelData");
    expect(titles(sectionsFor(panel, "behaviour"))).toEqual(["Motion"]);
  });
});

describe("blank zone and several zones", () => {
  it("shows the Widget card and the zone frame, without tabs", () => {
    const sections = sectionsFor({ kind: "blank" });
    expect(titles(sections)).toEqual(["Widget", "Zone frame"]);
    expect(sections[0].special).toBe("blankPick");
    expect(inspectorNotes({ kind: "blank" }, undefined)[0].kind).toBe("blank");
  });

  it("shows only the shared look sections for several zones", () => {
    const sections = sectionsFor({ kind: "multi", defs: spotify.kind === "widget" ? spotify.defs : [] });
    expect(titles(sections)).toEqual([
      "Skin & graphics",
      "Colors",
      "Surface",
      "Typography",
      "Size & spacing",
      "Border & glow",
      "Custom CSS",
      "Fit",
      "Motion",
    ]);
    expect(keysOf(sections)).not.toContain("label");
    expect(find(sections, "Colors").extras.map((e) => e.kind)).toEqual(["styleMode"]);
  });
});

describe("dashboard sections", () => {
  const dash: InspectorContext = { kind: "dashboard", scope: "all" };

  it("maps onto the existing cards", () => {
    expect(titles(sectionsFor(dash, "profile"))).toEqual(["Profile", "This profile", "Profile selection", "Auto-rotate", "Dynamic Island"]);
    expect(titles(sectionsFor(dash, "appearance"))).toEqual(["Scope", "Skins", "Theme & surface", "Page background"]);
    expect(titles(sectionsFor(dash, "general"))).toEqual(["Type", "Clock & date", "Display", "Studio", "Connection"]);
    expect(sectionsFor(dash, "appearance").map((s) => s.cardId)).toEqual([
      "doc:appearance",
      "doc:presets",
      "doc:theme",
      "doc:background",
    ]);
    expect(find(sectionsFor(dash, "general"), "Studio").terms).toContain("Quick bar");
  });

  it("has the look sections as the global style, without Follow, Preset or the Header", () => {
    const style = sectionsFor(dash, "gstyle");
    expect(titles(style)).toEqual([
      "Skin & graphics",
      "Colors",
      "Surface",
      "Typography",
      "Size & spacing",
      "Border & glow",
      "Custom CSS",
      "Fit",
      "Motion",
    ]);
    expect(keysOf(style)).not.toContain("preset");
    expect(keysOf(style)).not.toContain("layout");
    expect(style.flatMap((s) => s.extras)).toEqual([]);
    expect(style.every((s) => s.id.startsWith("gs-"))).toBe(true);
  });

  it("states which level the global style edits", () => {
    expect(inspectorNotes(dash, "gstyle")[0].text).toContain("applies to all profiles");
    const note = inspectorNotes({ kind: "dashboard", scope: "profile", profileName: "Wide" }, "gstyle")[0].text;
    expect(note).toContain("'Wide' only");
    expect(inspectorNotes(dash, "general")).toEqual([]);
  });

  it("reads the global style's dots by scope", () => {
    const glow = PROFILE_STYLE_SETTINGS.find((d) => d.key === "glow")!;
    const all = globalStyleValues("all", { glow: "soft" }, { glow: "strong" });
    expect(sourceState(glow, all)).toBe("here");
    const profile = globalStyleValues("profile", { glow: "soft" }, {});
    expect(sourceState(glow, profile)).toBe("dashboard");
    expect(sourceState(glow, globalStyleValues("profile", { glow: "soft" }, { glow: "strong" }))).toBe("overriding");
    expect(sourceState(glow, globalStyleValues("profile", undefined, undefined))).toBe("default");
  });
});

describe("source states and changed counts", () => {
  const accent = CARD_SETTINGS.find((d) => d.key === "accent")!;
  const url = mod("WebPage").settings!.find((d) => d.key === "url")!;
  const own = { accent: "#ff0000", glow: "soft", url: "https://example.com" };

  it("reads here, overriding and the inherited layers", () => {
    const custom = widgetLookValues({ own, dashboard: { glow: "strong", radius: "8" }, profile: { radius: "12" } });
    expect(sourceState(accent, custom)).toBe("here");
    expect(sourceState(CARD_SETTINGS.find((d) => d.key === "glow")!, custom)).toBe("overriding");
    expect(sourceState(CARD_SETTINGS.find((d) => d.key === "radius")!, custom)).toBe("profile");
    expect(sourceState(CARD_SETTINGS.find((d) => d.key === "blur")!, custom)).toBe("default");
  });

  it("marks set look values ignored while the widget follows or the style is forced", () => {
    for (const input of [{ mode: "follow" as const }, { enforce: true }]) {
      const values = widgetLookValues({ own, ...input });
      expect(sourceState(accent, values)).toBe("ignored");
    }
    // Content settings are never ignored.
    expect(sourceState(url, widgetLookValues({ own, mode: "follow" }))).toBe("here");
  });

  it("counts only the fields set here, ignored ones included, per section and tab", () => {
    const context: InspectorContext = { kind: "widget", defs: [...CARD_SETTINGS, url] };
    const sections = allSections(context);
    const custom = widgetLookValues({ own });
    expect(changedCount(find(sections, "Colors"), custom)).toBe(1);
    expect(changedCount(find(sections, "Border & glow"), custom)).toBe(1);
    expect(changedCount(find(sections, "Typography"), custom)).toBe(0);
    expect(tabChangedCounts(sections, custom)).toEqual({ show: 1, style: 2, data: 0, behaviour: 0 });
    expect(tabChangedCounts(sections, widgetLookValues({ own, mode: "follow" }))).toEqual({
      show: 1,
      style: 2,
      data: 0,
      behaviour: 0,
    });
  });

  it("does not count defaults or inherited values", () => {
    const sections = allSections(system);
    const values = widgetLookValues({ own: { accent: "" }, dashboard: { glow: "soft" } });
    expect(tabChangedCounts(sections, values)).toEqual({ show: 0, style: 0, data: 0, behaviour: 0 });
  });

  it("lists the stored keys a section's Reset drops (both axes of an alignment)", () => {
    const sections = allSections(spotify);
    const values = widgetLookValues({ own: { alignX: "start", alignY: "end", scale: 120 } });
    expect(resetKeysOfSection(find(sections, "Size & spacing"), values).sort()).toEqual(["alignX", "alignY", "scale"]);
  });
});

describe("More rows", () => {
  it("splits a section at its More (n) link, the More extras counting too", () => {
    const style = sectionsFor(system, "style");
    const spacing = splitMore(find(style, "Size & spacing"));
    expect(spacing.rows.map((d) => d.key)).toEqual(["scale", "alignX", "padding", "gap", "radius"]);
    expect([spacing.more.map((d) => d.key), spacing.count]).toEqual([["autoScale"], 1]);
    // The zone frame (3 fields) waits behind Border & glow's More.
    expect(splitMore(find(style, "Border & glow"))).toMatchObject({ more: [], count: 3 });
    expect(splitMore(find(style, "Custom CSS"))).toMatchObject({ rows: [], count: 1 });
  });

  it("reads the old advanced flag as More", () => {
    const visualizer = splitMore(find(sectionsFor(spotify, "show"), "Visualizer"));
    expect(visualizer.more.map((d) => d.key)).toEqual(["visualizerMinLevel", "visualizerOrientation"]);
    expect(splitMore(find(sectionsFor(spotify, "behaviour"), "Visualizer dynamics"))).toMatchObject({ rows: [], count: 6 });
  });

  it("keeps every section, a whole-advanced card included", () => {
    const overlay = { ...panel, selectedWidget: true } as InspectorContext;
    expect(titles(sectionsFor(overlay, "show"))).toContain("Selected · Advanced");
    expect(splitMore(find(sectionsFor(overlay, "show"), "Selected · Advanced")).count).toBe(0);
  });

  it("puts an advanced canvas item group's fields behind More", () => {
    const field: ModuleSetting = { key: "f", label: "F", type: "boolean", default: false };
    const context: InspectorContext = {
      kind: "infopanel",
      groups: [{ id: "ip-style", title: "Style", defs: [field], advanced: true }],
      group: true,
      bound: false,
      unknown: false,
    };
    expect(splitMore(find(allSections(context), "Style"))).toMatchObject({ rows: [], count: 1 });
  });

  it("are found by search and listed with the other matches", () => {
    const { groups } = searchAll(spotify, "orientation");
    const visualizer = groups.find((g) => g.section.title === "Visualizer")!;
    expect(visualizer.section.settings.map((d) => [d.key, isMore(d)])).toEqual([["visualizerOrientation", true]]);
  });
});

describe("searchAll", () => {
  it("searches every tab and labels each result with its tab", () => {
    const { groups, total } = searchAll(spotify, "mirror");
    // "Visualizer style" matches by its Mirror option; "peak" by the labels in Content and Style.
    expect(groups.map((g) => [g.tabLabel, g.section.title])).toEqual([["Show", "Visualizer"]]);
    expect(total).toBe(groups.reduce((n, g) => n + g.section.settings.length, 0));
    expect(keysOf(groups.map((g) => g.section))).toEqual(["waveformVariant"]);
    expect(searchAll(spotify, "peak").groups.map((g) => [g.tabLabel, g.section.title])).toEqual([
      ["Show", "Visualizer shape"],
      ["Style", "Widget colors"],
    ]);
  });

  it("finds settings in Style and Data in the same pass", () => {
    const result = searchAll(spotify, "color");
    const tabs = new Set(result.groups.map((g) => g.tabLabel));
    expect(tabs.has("Style")).toBe(true);
    expect(searchAll(spotify, "capture").groups.map((g) => g.tabLabel)).toEqual(["Data"]);
  });

  it("includes More rows", () => {
    expect(keysOf(searchAll(spotify, "fade").groups.map((g) => g.section))).toEqual(["waveformFadeEdges", "waveformFadeWidth"]);
  });

  it("lists matching rows only, not their whole category", () => {
    const { groups, total } = searchAll(system, "glow");
    expect(keysOf(groups.map((g) => g.section)).sort()).toEqual(["glow", "glowColor"]);
    expect(total).toBeGreaterThanOrEqual(2);
  });

  it("falls back to a section title when no row matches", () => {
    const { groups } = searchAll(system, "thresholds");
    expect(titles(groups.map((g) => g.section))).toEqual(["Thresholds"]);
    expect(groups[0].section.settings.length).toBeGreaterThan(1);
  });

  it("finds custom cards by title and terms, and the Follow extra by name", () => {
    const dash = searchAll({ kind: "dashboard", scope: "all" }, "quick bar");
    expect(dash.groups.map((g) => [g.tabLabel, g.section.title])).toEqual([["General", "Studio"]]);
    expect(dash.total).toBe(1);
    const follow = searchAll(spotify, "follow global");
    expect(follow.groups.map((g) => g.section.title)).toEqual(["Colors"]);
    expect(follow.groups[0].section.settings).toEqual([]);
  });

  it("returns everything for a blank query and nothing for a miss", () => {
    expect(searchAll(spotify, " ").groups).toHaveLength(allSections(spotify).length);
    expect(searchAll(spotify, "zzzz-no-match")).toEqual({ groups: [], total: 0 });
  });

  it("has no tab label in a context without tabs", () => {
    expect(searchAll({ kind: "blank" }, "frame").groups[0].tabLabel).toBe("");
  });
});

describe("isVisible", () => {
  const glowColor = CARD_SETTINGS.find((d) => d.key === "glowColor")!;
  const accent = CARD_SETTINGS.find((d) => d.key === "accent")!;

  it("shows the glow color only with a glow", () => {
    expect(isVisible(glowColor, {})).toBe(false);
    expect(isVisible(glowColor, { glow: "none" })).toBe(false);
    expect(isVisible(glowColor, { glow: "soft" })).toBe(true);
    expect(isVisible(accent, {})).toBe(true);
  });
});

describe("lookEditPatch", () => {
  it("switches a following widget to Custom when a look key is edited", () => {
    expect(lookEditPatch("accent", "follow", false)).toEqual({ styleMode: "custom" });
    expect(lookEditPatch(["alignX", "alignY"], "follow", undefined)).toEqual({ styleMode: "custom" });
  });

  it("leaves content keys, Custom widgets and a forced style alone", () => {
    expect(lookEditPatch("url", "follow", false)).toEqual({});
    expect(lookEditPatch("accent", "custom", false)).toEqual({});
    expect(lookEditPatch("accent", undefined, false)).toEqual({});
    expect(lookEditPatch("accent", "follow", true)).toEqual({});
  });
});

describe("inspectorNotes", () => {
  it("warns on the Style tab while following, and when the style is forced", () => {
    expect(inspectorNotes(spotify, "style", { mode: "follow" }).map((n) => n.kind)).toEqual(["follow"]);
    expect(inspectorNotes(spotify, "style", { mode: "follow", enforce: true }).map((n) => n.kind)).toEqual(["forced"]);
    expect(inspectorNotes(spotify, "style", { mode: "custom" })).toEqual([]);
    expect(inspectorNotes(spotify, "show", { mode: "follow" })).toEqual([]);
  });
});

describe("settingKeys coverage", () => {
  it("never lists an align picker's second key as a separate setting", () => {
    const keys = allSections(spotify).flatMap((s) => s.settings.flatMap(settingKeys));
    expect(keys).toContain("alignY");
    expect(keysOf(allSections(spotify))).not.toContain("alignY");
  });
});

describe("view helpers", () => {
  const a: ModuleSetting = { key: "a", label: "A", type: "boolean", default: false };
  const b: ModuleSetting = { key: "b", label: "B", type: "boolean", default: false };
  const c: ModuleSetting = { key: "c", label: "C", type: "boolean", default: false };

  it("sharedDefs keeps the settings every zone has, in the first zone's order", () => {
    expect(sharedDefs([[b, a, c], [a, b], [c, b, a]]).map((d) => d.key)).toEqual(["b", "a"]);
    expect(sharedDefs([])).toEqual([]);
  });

  it("visibleSections drops hidden settings and sections left empty", () => {
    const sections = allSections(spotify);
    const visible = visibleSections(sections, (d) => d.key !== "glowColor");
    expect(keysOf(visible)).not.toContain("glowColor");
    const none = visibleSections(sections, () => false);
    expect(none.every((s) => s.extras.length > 0 || s.special !== undefined)).toBe(true);
  });

  it("jumpTarget finds a section by id, document card or split id", () => {
    expect(jumpTarget(allSections(spotify), "colors")?.title).toBe("Colors");
    expect(jumpTarget(allSections(spotify), "module:visualizer")?.tab).toBe("show");
    const dashboard = allSections({ kind: "dashboard", scope: "all" });
    expect(jumpTarget(dashboard, "doc:type")?.tab).toBe("general");
    expect(jumpTarget(dashboard, "doc:background")?.id).toBe("ap-bg");
    expect(jumpTarget(dashboard, "nope")).toBeUndefined();
  });

  it("extraMatches searches custom UI by its terms", () => {
    expect(extraMatches({ kind: "zoneFrame", more: true, count: 3 }, "frame")).toBe(true);
    expect(extraMatches({ kind: "zoneFrame", more: true, count: 3 }, "glow")).toBe(false);
    expect(extraMatches({ kind: "visible", more: false, count: 1 }, "")).toBe(true);
  });
});

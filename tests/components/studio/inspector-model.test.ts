import { describe, expect, it } from "vitest";
import { modules } from "@/modules";
import { CARD_SETTINGS, PANEL_SETTINGS } from "@/modules/standard-settings";
import { isMore, type DashboardModule, type ModuleSetting } from "@/modules/types";
import { TITLE_ONLY_HINT } from "@/components/studio/inspector-categories";
import { THEME_EDITOR_SETTINGS } from "@/components/studio/theme-editor-settings";
import {
  allSections,
  changedCount,
  extraMatches,
  followInfo,
  chipSections,
  jumpTarget,
  needsAdvanced,
  rowSection,
  sharedDefs,
  visibleSections,
  isVisible,
  inspectorNotes,
  inspectorTabs,
  resetKeysOfSection,
  searchAll,
  sectionsFor,
  sourceState,
  splitMore,
  tabChangedCounts,
  tabStates,
  visibleSection,
  widgetContext,
  widgetLookValues,
  type InspectorContext,
  type InspectorSection,
} from "@/components/studio/inspector-model";

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
  // A widget without a header, or with a title-only one, has no Show title row (config v7 dropped a stored one).
  // A hidden row (CustomGauge `gauge`) is in the schema but never listed.
  const shown = (m: DashboardModule) => (m.settings ?? []).filter((d) => !d.hidden).filter((d) => !(d.key === "showTitle" && (m.header === "none" || m.header === "title-only")));
  const contexts: [string, InspectorContext, ModuleSetting[]][] = [
    ...modules.map((m): [string, InspectorContext, ModuleSetting[]] => [m.id, widgetContext(m), shown(m)]),
    ["cards", { kind: "widget", defs: CARD_SETTINGS }, CARD_SETTINGS],
    ["panel", panel, PANEL_SETTINGS],
  ];

  it("for every widget, the card settings and the panel", () => {
    for (const [name, context, defs] of contexts) {
      const sections = allSections(context);
      expect(new Set(ids(sections)).size, name).toBe(sections.length);
      const tabs = new Set(inspectorTabs(context).map((t) => t.id));
      for (const s of sections) expect(tabs.has(s.tab), `${name} ${s.id}`).toBe(true);
      const listed = keysOf(sections);
      expect(new Set(listed).size, name).toBe(listed.length);
      // The tabs partition the same sections.
      const byTab = [...tabs].flatMap((tab) => sectionsFor(context, tab));
      expect(ids(byTab).sort(), name).toEqual(ids(sections).sort());
      expect([...listed].sort(), name).toEqual(defs.map((d) => d.key).sort());
    }
  });

  it("holds the multi-select's shared look and the theme editor's rows, each once", () => {
    for (const context of [
      { kind: "multi", defs: CARD_SETTINGS } as InspectorContext,
      { kind: "theme", scope: "profile" } as InspectorContext,
    ]) {
      const listed = keysOf(allSections(context));
      expect(new Set(listed).size).toBe(listed.length);
    }
    const theme = keysOf(allSections({ kind: "theme", scope: "page" }));
    expect([...theme].sort()).toEqual(THEME_EDITOR_SETTINGS.map((d) => d.key).sort());
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

  it("has no Show tab in the theme editor, at every scope", () => {
    for (const scope of ["base", "profile", "page"] as const) {
      expect(inspectorTabs({ kind: "theme", scope }).map((t) => t.id)).toEqual(["style", "data", "behaviour"]);
    }
  });
});

describe("widget sections", () => {
  it("files Header, the widget's own sections and Fit in Show", () => {
    expect(titles(sectionsFor(spotify, "show"))).toEqual(["Header", "Player", "Visualizer", "Fit"]);
    expect(find(sectionsFor(spotify, "show"), "Header").extras.map((e) => e.kind)).toEqual(["widgetPicker"]);
    expect(keysOf([find(sectionsFor(spotify, "show"), "Fit")])).toEqual(["compact", "sizeTier"]);
  });

  it("files the look sections in Style, the widget's colors merged into Colors", () => {
    const style = sectionsFor(system, "style");
    expect(titles(style)).toEqual([
      "Skin",
      "Colors",
      "Typography",
      "Shape & spacing",
      "Surface & effects",
      "Border & glow",
      "Advanced · CSS & locks",
    ]);
    expect(find(style, "Colors").settings.map((d) => d.key)).toContain("cpuColor");
    expect(find(style, "Colors").extras).toEqual([]);
    expect(find(style, "Border & glow").extras).toEqual([{ kind: "zoneFrame", more: true, count: 3 }]);
  });

  it("files the other color-picker groups in Colors too, not behind More", () => {
    for (const [id, keys] of [
      ["SensorGroup", ["tempColor", "fanColor", "powerColor"]],
      ["FpsMonitor", ["ringColor", "sparkColor"]],
      ["Bluetooth", ["batteryMidColor", "batteryLowColor"]],
      ["NetworkThroughput", ["downloadColor", "uploadColor"]],
    ] as const) {
      const context = widgetContext(mod(id));
      expect(keysOf(sectionsFor(context, "show")), id).not.toContain(keys[0]);
      const palette = find(sectionsFor(context, "style"), "Colors");
      expect(palette.settings.map((d) => d.key), id).toEqual(expect.arrayContaining([...keys]));
      expect(palette.settings.filter(isMore), id).toEqual([]);
    }
  });

  it("files the meter's colors in Colors and its response in Motion", () => {
    const audio = widgetContext(mod("AudioMeter"));
    expect(titles(sectionsFor(audio, "show"))).toEqual(["Header", "Meter", "Details", "Fit"]);
    expect(keysOf([find(sectionsFor(audio, "style"), "Colors")])).toEqual(expect.arrayContaining(["levelColor", "hotColor"]));
    expect(keysOf([find(sectionsFor(audio, "behaviour"), "Motion")])).toEqual(["smoothing", "meterBallistics"]);
  });

  it("files the player source and the visualiser's audio in Data, after the bound data", () => {
    const data = sectionsFor(spotify, "data");
    expect(titles(data)).toEqual(["Bound data", "Player source", "Visualizer audio"]);
    expect(data[0]).toMatchObject({ special: "boundData" });
    expect(keysOf(data)).toEqual(["source", "vizDevices", "flow", "liveCapture", "devices"]);
    expect(titles(sectionsFor(spotify, "show"))).not.toContain("Visualizer audio");
  });

  it("files thresholds, the widget's behaviour, the island and graph updates in Behaviour", () => {
    expect(titles(sectionsFor(system, "behaviour"))).toEqual(["Thresholds", "Trends", "Motion"]);
    expect(keysOf([find(sectionsFor(system, "behaviour"), "Thresholds")])).toEqual(["warn.load", "warn.temp", "warn.full"]);
    expect(titles(sectionsFor(spotify, "behaviour"))).toEqual(["Visualizer dynamics", "Motion", "Send to island"]);
    expect(keysOf([find(sectionsFor(spotify, "behaviour"), "Motion")])).toEqual(["smoothing"]);
    expect(keysOf(sectionsFor(widgetContext(mod("GpuMonitor")), "behaviour"))).toEqual(["warn.temp", "smoothing"]);
    expect(sectionsFor(webpage, "behaviour")).toEqual([]);
  });

  it("files every island setting in Behaviour › Send to island", () => {
    for (const m of modules) {
      const island = allSections(widgetContext(m)).filter((s) => s.settings.some((d) => d.key === "island"));
      if (island.length === 0) continue;
      expect(island.map((s) => [s.tab, s.title]), m.id).toEqual([["behaviour", "Send to island"]]);
    }
  });

});

describe("tabs of every widget", () => {
  it("every widget has four tabs, an empty one disabled", () => {
    for (const m of modules) {
      const id = m.id;
      const context = widgetContext(m);
      const sections = allSections(context);
      const tabs = tabStates(inspectorTabs(context), sections);
      expect(tabs.map((t) => t.id), id).toEqual(["show", "style", "data", "behaviour"]);
      for (const t of tabs) expect(t.disabled, `${id} ${t.id}`).toBe(!sections.some((s) => s.tab === t.id));
      // Only the Web Page has nothing to do in Behaviour (no graph updates, island or thresholds); it and Uptime bind nothing (Data).
      expect(tabs.filter((t) => t.disabled).map((t) => t.id), id).toEqual(id === "WebPage" ? ["data", "behaviour"] : id === "Uptime" ? ["data"] : []);
    }
  });
});

describe("header modes", () => {
  const NO_HEADER = ["Calendar", "GameSpotlight", "KpiTiles", "MenuBar", "OsdStrip", "StatusBar", "SteamGame", "Vitals", "WebPage"];
  const TITLE_ONLY = ["Clock", "SystemOverview"];

  it("declares the header and small-zone shape of every widget", () => {
    for (const m of modules) {
      expect(m.header, m.id).toBeDefined();
      expect(m.compact, m.id).toBeDefined();
    }
    expect(modules.filter((m) => m.header === "none").map((m) => m.id).sort()).toEqual(NO_HEADER);
    expect(modules.filter((m) => m.header === "title-only").map((m) => m.id).sort()).toEqual(TITLE_ONLY);
    const noCard = modules.filter((m) => !m.compact?.card).map((m) => m.id).sort();
    expect(noCard).toEqual(["Clock", "CoreHeatmap", "CustomGauge", "GpuRings", "MeterBridge", "OnAirBeacon", "StatusBar", "SystemOverview", "Timer", "Visualizer", "WebPage"]);
  });

  it("shows Show title, Title and Icon (More) on a widget with a header", () => {
    const header = find(sectionsFor(spotify, "show"), "Header");
    expect(header.settings.map((d) => [d.key, isMore(d)])).toEqual([["showTitle", false], ["label", false], ["icon", true]]);
  });

  it("shows Title (with its hint) and Icon on a title-only widget, no Show title", () => {
    for (const id of TITLE_ONLY) {
      const header = find(sectionsFor(widgetContext(mod(id)), "show"), "Header");
      expect(header.settings.map((d) => d.key), id).toEqual(["label", "icon"]);
      expect(header.settings[0].hint, id).toBe(TITLE_ONLY_HINT);
      expect(isVisible(header.settings[0], { showTitle: false }), id).toBe(true);
    }
  });

  it("has no Header on a widget without one: Title and Icon close Fit, the picker moves to the first Show section", () => {
    for (const id of NO_HEADER) {
      const show = sectionsFor(widgetContext(mod(id)), "show");
      expect(titles(show), id).not.toContain("Header");
      expect(keysOf(show), id).not.toContain("showTitle");
      expect(show[0].extras.map((e) => e.kind), id).toEqual(["widgetPicker"]);
      if (id === "WebPage") continue;
      expect(keysOf([find(show, "Fit")]).slice(-2), id).toEqual(["label", "icon"]);
    }
  });
});

describe("Web Page", () => {
  it("offers only the few look settings it has, each in its normal section, and no custom CSS", () => {
    expect(titles(sectionsFor(webpage, "style"))).toEqual(["Colors", "Shape & spacing", "Border & glow"]);
    expect(keysOf(sectionsFor(webpage, "style"))).toContain("scale");
    expect(keysOf(sectionsFor(webpage, "style"))).not.toContain("customCss");
    expect(titles(sectionsFor(webpage, "show"))).toEqual(["Page"]);
    expect(keysOf(sectionsFor(webpage, "show"))).toEqual(["url"]);
  });

});

describe("panel sections", () => {
  it("lists Panel, Layout and Widgets, then the Header, in Show", () => {
    expect(titles(sectionsFor(panel, "show"))).toEqual(["Panel", "Layout", "Widgets", "Header"]);
    expect(find(sectionsFor(panel, "show"), "Header").extras).toEqual([]);
    expect(keysOf([find(sectionsFor(panel, "show"), "Header")])).toEqual(["label", "icon"]);
  });

  it("adds Background for an overlay (a selected widget has an inspector of its own)", () => {
    const overlay: InspectorContext = { ...panel, layout: "overlay" } as InspectorContext;
    expect(titles(sectionsFor(overlay, "show"))).toEqual(["Panel", "Layout", "Background", "Widgets", "Header"]);
  });

  it("swaps the layout and widget cards for the JSON in the code view", () => {
    const code: InspectorContext = { ...panel, codeView: true } as InspectorContext;
    expect(titles(sectionsFor(code, "show"))).toEqual(["Panel", "Panel JSON", "Header"]);
  });

  it("has the same look sections as a widget, lists its sensors in Data and its graph updates in Behaviour", () => {
    expect(titles(sectionsFor(panel, "style"))).toEqual([
      "Skin",
      "Colors",
      "Typography",
      "Shape & spacing",
      "Surface & effects",
      "Border & glow",
      "Advanced · CSS & locks",
    ]);
    expect(sectionsFor(panel, "data")).toHaveLength(1);
    expect(sectionsFor(panel, "data")[0].special).toBe("panelData");
    expect(titles(sectionsFor(panel, "behaviour"))).toEqual(["Motion"]);
  });
});

describe("blank zone and several zones", () => {
  it("shows the Widget card and the zone frame, without tabs", () => {
    const sections = sectionsFor({ kind: "blank" });
    expect(titles(sections)).toEqual(["Widget", "Widget frame"]);
    expect(sections[0].special).toBe("blankPick");
    expect(inspectorNotes({ kind: "blank" }, undefined)[0].kind).toBe("blank");
  });

  it("shows only the shared look sections for several zones", () => {
    const sections = sectionsFor({ kind: "multi", defs: spotify.kind === "widget" ? spotify.defs : [] });
    expect(titles(sections)).toEqual([
      "Skin",
      "Colors",
      "Typography",
      "Shape & spacing",
      "Surface & effects",
      "Border & glow",
      "Advanced · CSS & locks",
      "Fit",
      "Motion",
    ]);
    expect(keysOf(sections)).not.toContain("label");
    expect(find(sections, "Colors").extras).toEqual([]);
  });
});

describe("theme editor sections", () => {
  const theme: InspectorContext = { kind: "theme", scope: "profile" };

  it("files Style with Status & series colors after Colors, Data = Units & format, Behaviour = Thresholds + Motion", () => {
    expect(sectionsFor(theme, "show")).toEqual([]);
    expect(titles(sectionsFor(theme, "style"))).toEqual([
      "Skin",
      "Colors",
      "Status & series colors",
      "Typography",
      "Shape & spacing",
      "Surface & effects",
      "Border & glow",
      "Advanced · CSS & locks",
    ]);
    expect(titles(sectionsFor(theme, "data"))).toEqual(["Units & format"]);
    expect(keysOf(sectionsFor(theme, "data"))).toEqual(["tempUnit", "rateUnit", "decimals", "clock"]);
    expect(titles(sectionsFor(theme, "behaviour"))).toEqual(["Thresholds", "Motion"]);
    expect(keysOf([find(sectionsFor(theme, "behaviour"), "Thresholds")])).toEqual(["warn.load", "warn.temp", "warn.full", "warn.db", "warn.value"]);
    expect(keysOf([find(sectionsFor(theme, "behaviour"), "Motion")])).toEqual(["smoothing", "meterBallistics"]);
    expect(keysOf([find(sectionsFor(theme, "style"), "Status & series colors")])).toEqual(["s1", "s2", "s3", "s4", "s5", "s6", "ok", "warn", "crit"]);
  });

  it("is every themed section, followable, with no zone extras and nothing behind More in Advanced", () => {
    const sections = allSections(theme);
    expect(sections.map((s) => chipSections(s)[0])).toEqual(["skin", "colors", "palette", "type", "spacing", "surface", "border", "css", "format", "thresholds", "motion"]);
    expect(sections.flatMap((s) => s.extras)).toEqual([]);
    expect(keysOf(sections)).not.toContain("preset");
    expect(find(sections, "Advanced · CSS & locks").settings.every((d) => !isMore(d))).toBe(true);
  });

});

describe("source states and changed counts", () => {
  const accent = CARD_SETTINGS.find((d) => d.key === "accent")!;
  const url = mod("WebPage").settings!.find((d) => d.key === "url")!;
  const own = { accent: "#ff0000", glow: "soft", url: "https://example.com" };

  const CUSTOM = { colors: false, border: false, spacing: false } as const;
  const theme = { base: { glow: "strong", radius: "8" }, profile: { values: { radius: "12" } } };

  it("reads one dot for themed keys: an own value that applies, else none", () => {
    const custom = widgetLookValues({ own, levels: theme, follow: CUSTOM });
    expect(sourceState(accent, custom)).toBe("here");
    expect(sourceState(CARD_SETTINGS.find((d) => d.key === "glow")!, custom)).toBe("here");
    expect(sourceState(CARD_SETTINGS.find((d) => d.key === "radius")!, custom)).toBe("default");
    expect(sourceState(CARD_SETTINGS.find((d) => d.key === "blur")!, custom)).toBe("default");
  });

  it("shows no dot for own values a following or locked section ignores", () => {
    expect(sourceState(accent, widgetLookValues({ own, levels: theme }))).toBe("default");
    const locked = { ...theme, profile: { ...theme.profile, locks: { colors: true } } };
    expect(sourceState(accent, widgetLookValues({ own, levels: locked, follow: CUSTOM }))).toBe("default");
    // Content settings always apply.
    expect(sourceState(url, widgetLookValues({ own, levels: theme }))).toBe("here");
  });

  it("counts only own values that apply, per section and tab (SPEC §9: Changed)", () => {
    const context: InspectorContext = { kind: "widget", defs: [...CARD_SETTINGS, url] };
    const sections = allSections(context);
    const custom = widgetLookValues({ own, levels: {}, follow: CUSTOM });
    expect(changedCount(find(sections, "Colors"), custom)).toBe(1);
    expect(changedCount(find(sections, "Border & glow"), custom)).toBe(1);
    expect(changedCount(find(sections, "Typography"), custom)).toBe(0);
    expect(tabChangedCounts(sections, custom)).toEqual({ show: 1, style: 2, data: 0, behaviour: 0 });
    // Following: the stored look values don't apply, so they don't count.
    expect(tabChangedCounts(sections, widgetLookValues({ own, levels: {} }))).toEqual({ show: 1, style: 0, data: 0, behaviour: 0 });
    expect(tabChangedCounts(sections, widgetLookValues({ own, levels: {}, follow: { colors: false } }))).toEqual({
      show: 1,
      style: 1,
      data: 0,
      behaviour: 0,
    });
  });

  it("does not count defaults or theme values", () => {
    const sections = allSections(system);
    const values = widgetLookValues({ own: { accent: "" }, levels: { base: { glow: "soft" } }, follow: CUSTOM });
    expect(tabChangedCounts(sections, values)).toEqual({ show: 0, style: 0, data: 0, behaviour: 0 });
  });

  it("lists the stored keys a custom section's Reset drops (an alignment's cell and spread), none while it follows", () => {
    const sections = allSections(spotify);
    const own = { align: "bl", alignSpread: true, scale: 120 };
    const values = widgetLookValues({ own, levels: {}, follow: { spacing: false } });
    expect(resetKeysOfSection(find(sections, "Shape & spacing"), values).sort()).toEqual(["align", "alignSpread", "scale"]);
    expect(resetKeysOfSection(find(sections, "Shape & spacing"), widgetLookValues({ own, levels: {} }))).toEqual([]);
  });
});

describe("which rows follow the theme", () => {
  it("rowSection: the theme section a row reads (none for a per-widget or unthemed row)", () => {
    const def = (key: string, extra: Partial<ModuleSetting> = {}): ModuleSetting => ({ key, label: key, type: "text", default: "", ...extra });
    expect(rowSection(def("accent"))).toBe("colors");
    expect(rowSection(def("alignX", { keyY: "alignY" }))).toBe("spacing");
    expect(rowSection(def("accent", { perWidget: true }))).toBeUndefined();
    expect(rowSection(def("tint"))).toBeUndefined();
  });

  it("chipSections: a card's own theme section, Colors also covering Widget colors; none for Header, Fit or the widget's own", () => {
    const sys = allSections(system);
    expect(chipSections(find(sys, "Colors"))).toEqual(["colors", "palette"]);
    expect(chipSections(find(sys, "Shape & spacing"))).toEqual(["spacing"]);
    expect(chipSections(find(sys, "Header"))).toEqual([]);
    expect(chipSections(find(sys, "Fit"))).toEqual([]);
    expect(sys.filter((s) => !s.general).every((s) => chipSections(s).length === 0)).toBe(true);
    // A widget with no colors of its own: the Colors card covers Colors only.
    expect(chipSections(find(allSections(webpage), "Colors"))).toEqual(["colors"]);
  });

  it("followInfo: Theme, Custom or Locked", () => {
    const appearance = {};
    expect(followInfo(appearance, undefined, "colors")).toEqual({ mode: "theme" });
    expect(followInfo(appearance, { colors: false }, "colors")).toEqual({ mode: "custom" });
    const locked = { profile: { locks: { colors: true } } };
    expect(followInfo(locked, { colors: false }, "colors")).toEqual({ mode: "locked" });
  });
});

describe("More rows", () => {
  it("splits a section at its More (n) link, the More extras counting too", () => {
    const style = sectionsFor(system, "style");
    const spacing = splitMore(find(style, "Shape & spacing"));
    expect(spacing.rows.map((d) => d.key)).toEqual(["scale", "align", "padding", "gap", "radius"]);
    expect([spacing.more.map((d) => d.key), spacing.count]).toEqual([[], 0]);
    // The zone frame (3 fields) waits behind Border & glow's More.
    expect(splitMore(find(style, "Border & glow"))).toMatchObject({ more: [], count: 3 });
    expect(splitMore(find(style, "Advanced · CSS & locks"))).toMatchObject({ rows: [], count: 1 });
  });

  it("lists a section's More rows after its link", () => {
    const visualizer = splitMore(find(sectionsFor(spotify, "show"), "Visualizer"));
    expect(visualizer.more.map((d) => d.key)).toEqual(["vizShape", "vizGap", "vizOrientation", "vizMinLevel", "vizLine", "vizFade", "vizFadeWidth"]);
    const dynamics = splitMore(find(sectionsFor(spotify, "behaviour"), "Visualizer dynamics"));
    expect(dynamics.rows.map((d) => d.key)).toEqual(["vizGain", "vizAutoGain"]);
    expect(dynamics.count).toBe(5);
  });

  it("reads the old advanced flag as More", () => {
    const old: ModuleSetting = { key: "f", label: "F", type: "boolean", default: false, advanced: true };
    expect(isMore(old)).toBe(true);
    expect(isMore({ ...old, more: false })).toBe(false);
  });

  it("keeps a section whose rows are all More (a panel widget's Custom CSS)", () => {
    const item: InspectorContext = { kind: "item", widget: { id: "w", kind: "stat", visible: true }, layout: "stack" };
    expect(titles(sectionsFor(item, "style"))).toContain("Custom CSS");
    const css = splitMore(find(sectionsFor(item, "style"), "Custom CSS"));
    expect(css.rows).toEqual([]);
    expect(css.count).toBe(2);
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
    expect(visualizer.section.settings.map((d) => [d.key, isMore(d)])).toEqual([["vizOrientation", true]]);
  });
});

describe("Advanced switch (visibleSection)", () => {
  const style = sectionsFor(system, "style");
  const spacing = find(style, "Shape & spacing");
  const border = find(style, "Border & glow");
  const css = find(style, "Advanced · CSS & locks");
  const dynamics = find(sectionsFor(spotify, "behaviour"), "Visualizer dynamics");

  it("collapses a section that follows the theme to its line when off", () => {
    expect(visibleSection(spacing, { advanced: false, mode: "theme" })).toMatchObject({ hidden: false, collapsed: "theme", rows: [] });
  });

  it("shows a custom section's rows, without its More rows, when off", () => {
    expect(visibleSection(spacing, { advanced: false, mode: "custom" }).rows).toEqual(spacing.settings);
    expect(visibleSection(dynamics, { advanced: false, mode: "custom" }).rows.map((d) => d.key)).toEqual(["vizGain", "vizAutoGain"]);
  });

  it("shows a locked section as its line only, and a section that never follows as usual", () => {
    expect(visibleSection(spacing, { advanced: false, mode: "locked" })).toMatchObject({ collapsed: "locked", rows: [] });
    expect(visibleSection(dynamics, { advanced: false })).toMatchObject({ collapsed: undefined });
  });

  it("hides the CSS & locks card when off", () => {
    expect(visibleSection(css, { advanced: false }).hidden).toBe(true);
    expect(visibleSection(border, { advanced: false }).hidden).toBe(false);
  });

  it("lists every row inline when on, followed sections included", () => {
    for (const mode of ["theme", "custom", "locked"] as const)
      expect(visibleSection(dynamics, { advanced: true, mode })).toEqual({ hidden: false, collapsed: undefined, rows: dynamics.settings });
    expect(visibleSection(css, { advanced: true }).hidden).toBe(false);
  });

  it("needs Advanced to reach a More row, a collapsed row or the CSS card, and nothing else", () => {
    expect(needsAdvanced(dynamics, "vizGain")).toBe(false);
    expect(needsAdvanced(dynamics, dynamics.settings.find(isMore)!.key)).toBe(true);
    expect(needsAdvanced(spacing, "padding", "theme")).toBe(true);
    expect(needsAdvanced(spacing, "padding", "custom")).toBe(false);
    expect(needsAdvanced(css, undefined)).toBe(true);
  });

  it("leaves search results alone: every matching More row is listed", () => {
    const { groups } = searchAll(spotify, "orientation");
    expect(groups.flatMap((g) => g.section.settings.map((d) => d.key))).toContain("vizOrientation");
  });
});

describe("searchAll", () => {
  it("searches every tab and labels each result with its tab", () => {
    const { groups, total } = searchAll(spotify, "mirror");
    // The visualiser's Style matches by its Mirror option; "peak" by the labels in Show and Style.
    expect(groups.map((g) => [g.tabLabel, g.section.title])).toEqual([["Show", "Visualizer"]]);
    expect(total).toBe(groups.reduce((n, g) => n + g.section.settings.length, 0));
    expect(keysOf(groups.map((g) => g.section))).toEqual(["vizStyle"]);
    expect(searchAll(spotify, "peak").groups.map((g) => [g.tabLabel, g.section.title])).toEqual([
      ["Show", "Visualizer"],
      ["Style", "Colors"],
    ]);
  });

  it("finds settings in Style and Data in the same pass", () => {
    const result = searchAll(spotify, "color");
    const tabs = new Set(result.groups.map((g) => g.tabLabel));
    expect(tabs.has("Style")).toBe(true);
    expect(searchAll(spotify, "capture").groups.map((g) => g.tabLabel)).toEqual(["Data"]);
  });

  it("includes More rows", () => {
    expect(keysOf(searchAll(spotify, "fade").groups.map((g) => g.section))).toEqual(["vizFade", "vizFadeWidth"]);
  });

  it("lists matching rows only, not their whole category", () => {
    const { groups, total } = searchAll(system, "glow");
    expect(keysOf(groups.map((g) => g.section)).sort()).toEqual(["glow", "glowColor", "numGlow", "numGlowColor"]);
    expect(total).toBeGreaterThanOrEqual(2);
  });

  it("falls back to a section title when no row matches", () => {
    const { groups } = searchAll(system, "thresholds");
    expect(titles(groups.map((g) => g.section))).toEqual(["Thresholds"]);
    expect(groups[0].section.settings.length).toBeGreaterThan(1);
  });

  it("finds nothing for the style tools, which left the cards for the toolbar and the zone menu", () => {
    const follow = searchAll(spotify, "copy style");
    expect(follow.groups).toEqual([]);
  });

  it("returns everything for a blank query and nothing for a miss", () => {
    expect(searchAll(spotify, " ").groups).toHaveLength(allSections(spotify).length);
    expect(searchAll(spotify, "zzzz-no-match")).toEqual({ groups: [], total: 0 });
  });

  it("has no tab label in a context without tabs", () => {
    expect(searchAll({ kind: "blank" }, "frame").groups[0].tabLabel).toBe("");
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

  it("jumpTarget finds a section by id or split id", () => {
    expect(jumpTarget(allSections(spotify), "colors")?.title).toBe("Colors");
    expect(jumpTarget(allSections(spotify), "module:visualizer")?.tab).toBe("show");
    expect(jumpTarget(allSections(spotify), "nope")).toBeUndefined();
  });

  it("extraMatches searches custom UI by its terms", () => {
    expect(extraMatches({ kind: "zoneFrame", more: true, count: 3 }, "frame")).toBe(true);
    expect(extraMatches({ kind: "zoneFrame", more: true, count: 3 }, "glow")).toBe(false);
    expect(extraMatches({ kind: "widgetPicker", more: false, count: 1 }, "")).toBe(true);
  });
});

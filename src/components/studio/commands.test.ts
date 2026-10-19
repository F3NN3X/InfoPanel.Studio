import { describe, expect, it } from "vitest";
import { PANEL_ID, type Placement, type Widget } from "@/lib/layout";
import { modules } from "@/modules";
import type { ModuleSetting } from "@/modules/types";
import { widgetContext } from "./inspector-model";
import { buildCommands, matchScore, rankCommands, type CommandState } from "./commands";
import { insertables } from "./insert-panel";

const zone = (id: string, colStart: number, rowStart: number, visible = true): Placement => ({
  id,
  module: "blank",
  colStart,
  rowStart,
  colSpan: 1,
  rowSpan: 1,
  visible,
});

const setting = (key: string, label: string, group?: string): ModuleSetting => ({
  key,
  label,
  type: "number",
  default: 0,
  group,
});

const base: CommandState = {
  insertables: [
    { kind: "module", id: "SystemOverview", title: "System Overview" },
    { kind: "panel", id: "cpu", title: "CPU" },
  ],
  profiles: [{ id: "p1", name: "Desk", width: 1920, height: 1080 }],
  pages: [{ id: "main", name: "Main" }],
  currentPage: "main",
  placements: [zone("b", 3, 2), zone("a", 1, 1)],
  selected: null,
  context: null,
  widget: null,
  canPasteWidget: false,
  canUndo: false,
  canRedo: false,
  showGrid: true,
  showSources: false,
  enforced: false,
  appearancePresets: [],
};

const ids = (state: CommandState) => buildCommands(state).map((c) => c.id);

describe("buildCommands", () => {
  it("offers adding every widget and panel, profiles with Auto, and zones in reading order", () => {
    const list = ids(base);
    expect(list).toContain("add:module:SystemOverview");
    expect(list).toContain("add:panel:cpu");
    expect(list).toContain("profile:auto");
    expect(list).toContain("profile:p1");
    expect(list.filter((id) => id.startsWith("select:"))).toEqual(["select:a", "select:b"]);
    for (const id of ["save", "export", "import", "copy-profile", "shortcuts", "grid", "zoom-fit"]) {
      expect(list).toContain(id);
    }
    expect(list).toContain("drawer:add");
    expect(list).toContain("sources");
  });

  it("offers opening the Background tab, with or without a selection", () => {
    const command = buildCommands(base).find((c) => c.id === "background");
    expect(command?.label).toBe("Background…");
    expect(command?.action).toEqual({ type: "document-tab", tab: "background" });
    expect(ids({ ...base, selected: zone("a", 1, 1) })).toContain("background");
  });

  it("offers the inspector toggle and no layout choice (the studio's width picks it)", () => {
    const list = buildCommands(base);
    expect(list.find((c) => c.id === "toggle-dock")).toMatchObject({ label: "Toggle inspector", hint: "Ctrl+\\", action: { type: "toggle-dock" } });
    expect(list.some((c) => c.id.startsWith("layout:"))).toBe(false);
  });

  it("offers the General and Connection tabs", () => {
    const find = (id: string) => buildCommands(base).find((c) => c.id === id);
    expect(find("general")).toMatchObject({ label: "General settings…", action: { type: "document-tab", tab: "general" } });
    expect(find("connection")?.action).toEqual({ type: "document-tab", tab: "connection" });
    expect(ids({ ...base, selected: zone("a", 1, 1) })).toContain("general");
  });

  it("offers applying each appearance preset", () => {
    const state = { ...base, appearancePresets: [{ id: "builtin:light", name: "Light" }, { id: "u1", name: "Mine" }] };
    const list = buildCommands(state).filter((c) => c.group === "Appearance");
    expect(list.map((c) => c.label)).toEqual(["Apply appearance: Light", "Apply appearance: Mine"]);
    expect(list[1].action).toEqual({ type: "apply-appearance", id: "u1" });
    expect(ids(base).some((id) => id.startsWith("appearance:"))).toBe(false);
  });

  it("offers the theme: the editor, the Appearance tab, follow all and the lock-all toggle", () => {
    const find = (state: CommandState, id: string) => buildCommands(state).find((c) => c.id === id);
    expect(find(base, "theme")).toMatchObject({ label: "Theme editor…", action: { type: "edit-theme" } });
    expect(find(base, "appearance")?.action).toEqual({ type: "document-tab", tab: "appearance" });
    expect(find(base, "follow-all")).toMatchObject({
      label: "Make all widgets follow the theme",
      action: { type: "follow-all" },
    });
    expect(find(base, "toggle-enforce")?.label).toBe("Lock every theme section");
    expect(find({ ...base, enforced: true }, "toggle-enforce")?.label).toBe("Unlock every theme section");
  });

  it("offers Go to setting for the theme editor's rows, which the Dashboard no longer has", () => {
    const list = buildCommands(base).filter((c) => c.group === "Theme");
    const accent = list.find((c) => c.id === "theme-setting:colors:accent");
    expect(accent).toMatchObject({ label: "Go to setting: Accent color", hint: "Theme › Colors", action: { type: "goto-theme-setting", section: "colors", key: "accent" } });
    expect(list.find((c) => c.id === "theme-setting:border:glow")?.action).toEqual({ type: "goto-theme-setting", section: "border", key: "glow" });
    expect(list.find((c) => c.id === "theme-setting:thresholds:warn.load")?.hint).toBe("Theme › Thresholds");
  });

  it("lists undo / redo only when there is something to undo / redo", () => {
    expect(ids(base)).not.toContain("undo");
    expect(ids(base)).not.toContain("redo");
    const list = ids({ ...base, canUndo: true, canRedo: true });
    expect(list).toContain("undo");
    expect(list).toContain("redo");
  });

  it("adds the selected zone's actions and its settings and the card jumps", () => {
    const glow: ModuleSetting = { ...setting("glow", "Glow", "Border, glow & CSS"), section: "border" };
    const threshold = setting("warnAt", "Warn at", "Thresholds");
    const commands = buildCommands({
      ...base,
      selected: zone("a", 1, 1, false),
      context: { kind: "widget", defs: [glow, threshold] },
    });
    const byId = new Map(commands.map((c) => [c.id, c]));
    expect(byId.get("zone:visible")?.label).toBe("Show zone");
    expect(byId.has("zone:duplicate")).toBe(true);
    expect(byId.has("zone:remove")).toBe(true);
    expect(byId.has("zone:pick")).toBe(true);
    const glowId = [...byId.keys()].find((id) => id.endsWith(":glow"))!;
    expect(byId.get(glowId)?.action).toMatchObject({ type: "goto-setting", key: "glow" });
    expect(byId.get(glowId)?.hint).toBe("Border & glow");
    expect(byId.get("zone:card:colors")?.action).toEqual({ type: "goto-card", id: "colors" });
    const warnId = [...byId.keys()].find((id) => id.endsWith(":warnAt"))!;
    expect(byId.get(warnId)?.action).toMatchObject({ type: "goto-setting", key: "warnAt" });
    expect(byId.get(warnId)?.hint).toBe("Thresholds");
  });

  it("lists Go to Header settings only for a widget that has a Header section", () => {
    const of = (id: string) => widgetContext(modules.find((m) => m.id === id)!);
    const withHeader = ids({ ...base, selected: zone("a", 1, 1), context: of("CpuMonitor") });
    const without = ids({ ...base, selected: zone("a", 1, 1), context: of("KpiTiles") });
    expect(withHeader).toContain("zone:card:header");
    expect(without).not.toContain("zone:card:header");
    expect(without).toContain("zone:card:colors");
  });

  it("offers Go to setting for a panel and for the Dashboard, each jumping to its section", () => {
    const panel = buildCommands({ ...base, selected: zone("a", 1, 1), context: { kind: "panel", defs: [setting("gap", "Gap")] } });
    const gap = panel.find((c) => c.id.endsWith(":gap"))!;
    expect(gap).toMatchObject({ label: "Go to setting: Gap", group: "Selected zone" });
    expect(gap.action).toMatchObject({ type: "goto-setting", key: "gap" });

    const dash = buildCommands({ ...base, context: { kind: "dashboard", scope: "all" } });
    // Its style rows moved to the theme editor (Studio › Theme): the Dashboard has cards only.
    expect(dash.filter((c) => c.id.startsWith("setting:"))).toEqual([]);
    expect(dash.filter((c) => c.id.startsWith("section:")).every((c) => c.group === "Dashboard")).toBe(true);
    // A custom-UI-only card gets a section jump instead.
    expect(dash.find((c) => c.id === "section:profile")?.action).toEqual({ type: "goto-setting", section: "profile" });
  });

  it("offers Use as global style for the selected zone", () => {
    const list = buildCommands({ ...base, selected: zone("a", 1, 1) });
    expect(list.find((c) => c.id === "style:global-all")?.action).toEqual({ type: "use-global", target: "all" });
    expect(list.find((c) => c.id === "style:global-profile")?.action).toEqual({ type: "use-global", target: "profile" });
  });

  it("has no zone commands without a selection", () => {
    expect(ids(base).some((id) => id.startsWith("zone:") || id.startsWith("setting:"))).toBe(false);
  });
});

describe("buildCommands with a panel", () => {
  const w = (id: string, label?: string, visible = true): Widget => ({ id, kind: "stat", label, visible });
  const widgets = [w("a", "CPU"), w("b", "GPU", false), w("c")];
  const panelZone: Placement = {
    ...zone("p", 1, 1),
    module: PANEL_ID,
    panel: { id: "pd", title: "Stats", titleVisible: true, visible: true, background: "panel", widgets },
  };

  it("offers selecting each widget of the selected panel by name", () => {
    const commands = buildCommands({ ...base, placements: [panelZone], selected: panelZone });
    const select = commands.filter((c) => c.id.startsWith("select-widget:"));
    expect(select.map((c) => c.label)).toEqual(["Select widget: CPU", "Select widget: GPU", "Select widget: Stat"]);
    expect(select[1]).toMatchObject({ hint: "#2 · hidden", action: { type: "select-widget", id: "b" } });
    expect(ids(base).some((id) => id.startsWith("widget:") || id.startsWith("select-widget:"))).toBe(false);
  });

  it("adds the selected widget's actions, moves only where possible, paste only with a copy", () => {
    const first = ids({ ...base, selected: panelZone, widget: widgets[0] });
    expect(first).toEqual(expect.arrayContaining(["widget:duplicate", "widget:copy", "widget:down", "widget:remove"]));
    expect(first).not.toContain("widget:up");
    expect(first).not.toContain("widget:paste");
    const last = ids({ ...base, selected: panelZone, widget: widgets[2], canPasteWidget: true });
    expect(last).toContain("widget:up");
    expect(last).not.toContain("widget:down");
    expect(last).toContain("widget:paste");
  });

  it("gives Ctrl+D / Del to the widget, not the zone, while one is selected", () => {
    const byId = new Map(buildCommands({ ...base, selected: panelZone, widget: widgets[0] }).map((c) => [c.id, c]));
    expect(byId.get("widget:duplicate")?.hint).toBe("Ctrl+D");
    expect(byId.get("zone:duplicate")?.hint).toBeUndefined();
    expect(byId.get("zone:remove")?.hint).toBeUndefined();
    expect(byId.get("widget:remove")?.action).toEqual({ type: "widget-remove" });
  });
});

describe("buildCommands with saved panels", () => {
  const saved = {
    id: "mine-1",
    name: "My stats",
    panel: { id: "pd", title: "Stats", titleVisible: true, visible: true, background: "panel" as const, widgets: [] },
  };

  it("offers adding the user's saved panels and the layout starters like built-in presets", () => {
    const byId = new Map(buildCommands({ ...base, insertables: insertables([saved]) }).map((c) => [c.id, c]));
    expect(byId.get("add:panel:mine-1")).toMatchObject({
      label: "Add panel: My stats",
      action: { type: "add-preset", id: "mine-1" },
    });
    expect(byId.get("add:panel:layout-stat-row")?.label).toBe("Add panel: Row of stats");
  });

  it("offers saving the selected zone as a preset only for panels", () => {
    const panelZone: Placement = { ...zone("p", 1, 1), module: PANEL_ID, panel: saved.panel };
    expect(ids({ ...base, selected: panelZone })).toContain("zone:save-preset");
    expect(ids({ ...base, selected: zone("a", 1, 1) })).not.toContain("zone:save-preset");
  });

  it("names unlabeled widgets by their sensor, not the full key", () => {
    const widget: Widget = { id: "g", kind: "gauge", sensor: "plugins.InfoPanel.RTSS.rtss.avg-fps", visible: true };
    const panelZone: Placement = { ...zone("p", 1, 1), module: PANEL_ID, panel: { ...saved.panel, widgets: [widget] } };
    const labels = buildCommands({ ...base, selected: panelZone }).map((c) => c.label);
    expect(labels).toContain("Select widget: avg fps");
  });
});

describe("matchScore / rankCommands", () => {
  it("ranks prefix over word start over substring", () => {
    expect(matchScore("System", "sys")).toBe(3);
    expect(matchScore("Add widget: System", "sys")).toBe(2);
    expect(matchScore("Filesystem", "sys")).toBe(1);
    expect(matchScore("Add widget: System", "add sys")).toBe(0.5);
    expect(matchScore("Zoom in", "sys")).toBe(0);
  });

  it("filters and orders commands, keeping the original order for ties", () => {
    const commands = buildCommands(base);
    const ranked = rankCommands(commands, "sys");
    expect(ranked[0].id).toBe("add:module:SystemOverview");
    expect(ranked.every((c) => matchScore(c.label, "sys") > 0)).toBe(true);
    expect(rankCommands(commands, "  ")).toEqual(commands);
    expect(rankCommands(commands, "zoom").map((c) => c.id)).toEqual(["zoom-fit", "zoom-in", "zoom-out"]);
  });

  it("ignores case and diacritics", () => {
    expect(matchScore("Écran", "ecr")).toBe(3);
  });
});

describe("buildCommands with several zones selected", () => {
  const a = zone("a", 1, 1);
  const b = zone("b", 3, 2, false);

  it("offers hide, duplicate and remove for the whole selection only", () => {
    const list = buildCommands({ ...base, selected: b, selection: [a, b] });
    const group = list.filter((c) => c.group === "Selected zones");
    expect(group.map((c) => c.label)).toEqual(["Duplicate 2 zones", "Hide 2 zones", "Remove 2 zones"]);
    expect(list.some((c) => c.id === "zone:pick")).toBe(false);
  });

  it("offers Show when every selected zone is hidden", () => {
    const hidden = zone("c", 5, 1, false);
    const list = buildCommands({ ...base, selected: hidden, selection: [b, hidden] });
    expect(list.find((c) => c.id === "zone:visible")?.label).toBe("Show 2 zones");
  });

  it("keeps the single-zone commands for one selected zone", () => {
    expect(ids({ ...base, selected: a, selection: [a] })).toContain("zone:pick");
  });
});

describe("select all", () => {
  it("is offered with Ctrl+A while the profile has zones", () => {
    expect(buildCommands(base).find((c) => c.id === "select-all")).toMatchObject({
      action: { type: "select-all" },
      hint: "Ctrl+A",
    });
    expect(ids({ ...base, placements: [] })).not.toContain("select-all");
  });
});

describe("buildCommands style commands", () => {
  it("offers copy, paste, follow and use-as-global only with a selection", () => {
    const ids = (selected: Placement | null) =>
      buildCommands({ ...base, selected, selection: selected ? [selected] : [] })
        .filter((c) => c.group === "Zone style")
        .map((c) => c.action.type);
    expect(ids(null)).toEqual([]);
    expect(ids(zone("a", 1, 1))).toEqual(["copy-style", "paste-style", "follow-global", "use-global", "use-global"]);
  });
});

describe("buildCommands page commands", () => {
  const two = { ...base, pages: [{ id: "main", name: "Main" }, { id: "g", name: "Games" }] };
  const pageIds = (state: CommandState) => ids(state).filter((id) => id.startsWith("page:"));

  it("offers going to each page, adding, duplicating and renaming; no stepping or deleting with one page", () => {
    expect(pageIds(base)).toEqual(["page:go:main", "page:add", "page:duplicate", "page:rename"]);
  });

  it("adds next, previous and delete with several pages", () => {
    expect(pageIds(two)).toEqual([
      "page:go:main",
      "page:go:g",
      "page:add",
      "page:next",
      "page:prev",
      "page:duplicate",
      "page:rename",
      "page:delete",
    ]);
  });

  it("labels the go commands, marks the current page, and carries the actions and shortcuts", () => {
    const by = (id: string) => buildCommands(two).find((c) => c.id === id);
    expect(by("page:go:g")).toMatchObject({ label: "Go to page: Games", action: { type: "page-go", id: "g" } });
    expect(by("page:go:main")?.hint).toBe("current");
    expect(by("page:next")).toMatchObject({ hint: "Ctrl+PageDown", action: { type: "page-next" } });
    expect(by("page:prev")).toMatchObject({ hint: "Ctrl+PageUp", action: { type: "page-prev" } });
    expect(by("page:delete")?.action).toEqual({ type: "page-delete" });
  });
});

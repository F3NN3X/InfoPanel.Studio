import type { MonitorProfile, Placement, Widget } from "@/lib/layout";
import type { AppearanceTarget } from "./appearance-panel";
import type { DocumentTab } from "./document-inspector";
import type { Drawer } from "./left-rail";
import { allSections, type InspectorContext } from "./inspector-model";
import { placementTitle } from "./studio-modules";
import { KEYS } from "./use-studio-shortcuts";
import { widgetName } from "./widget-kinds";
import { sortZones } from "./zone-geometry";

/** What a command palette entry does (the studio carries it out). */
export type CommandAction =
  | { type: "add-module"; id: string }
  | { type: "add-preset"; id: string }
  | { type: "profile"; id: string }
  | { type: "drawer"; drawer: Drawer }
  | { type: "alerts-open" }
  | { type: "alert-new" }
  | { type: "sources" }
  | { type: "toggle-grid" }
  | { type: "toggle-dock" }
  | { type: "zoom-fit" }
  | { type: "zoom-in" }
  | { type: "zoom-out" }
  | { type: "save" }
  | { type: "export" }
  | { type: "import" }
  | { type: "copy-profile" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "shortcuts" }
  | { type: "select"; id: string }
  | { type: "select-all" }
  | { type: "duplicate" }
  | { type: "toggle-visible" }
  | { type: "remove" }
  | { type: "pick-widget" }
  | { type: "save-panel-preset" }
  | { type: "select-widget"; id: string }
  | { type: "widget-remove" }
  | { type: "widget-duplicate" }
  | { type: "widget-copy" }
  | { type: "widget-paste" }
  | { type: "widget-move"; delta: -1 | 1 }
  | { type: "goto-card"; id: string }
  | { type: "document-tab"; tab: DocumentTab }
  | { type: "follow-all" }
  | { type: "toggle-enforce" }
  | { type: "apply-appearance"; id: string }
  | { type: "goto-setting"; section: string; key?: string }
  /** A theme editor row: Studio › Theme at its current scope, that section and row. */
  | { type: "goto-theme-setting"; section: string; key: string }
  | { type: "use-global"; target: AppearanceTarget }
  | { type: "edit-style" }
  | { type: "bind-data" }
  | { type: "edit-theme" }
  | { type: "copy-style" }
  | { type: "paste-style" }
  | { type: "follow-global" }
  | { type: "deselect" }
  | { type: "resize-step"; cols: number; rows: number }
  | { type: "sample-layout" }
  | { type: "page-go"; id: string }
  | { type: "page-next" }
  | { type: "page-prev" }
  | { type: "page-add" }
  | { type: "page-duplicate" }
  | { type: "page-delete" }
  | { type: "page-rename" }
  | { type: "move-to-page"; id: string };

export interface Command {
  id: string;
  label: string;
  group: string;
  /** Shortcut or location shown on the right. */
  hint?: string;
  action: CommandAction;
}

export interface CommandState {
  /** Widgets, layout starters, panel presets and saved panels the Add drawer offers. */
  insertables: { kind: "module" | "panel"; id: string; title: string }[];
  profiles: Pick<MonitorProfile, "id" | "name" | "width" | "height">[];
  /** The pages of the profile being edited, and the one on the canvas. */
  pages: { id: string; name: string }[];
  currentPage: string;
  placements: Placement[];
  /** The primary selected zone. */
  selected: Placement | null;
  /** Every selected zone, the primary last (default: just `selected`). */
  selection?: Placement[];
  /**
   * What the inspector shows now (a widget, a panel, the Dashboard), for the
   * "Go to setting" entries; null when it has no sections (several zones, a blank zone).
   */
  context: InspectorContext | null;
  /** The selected panel widget (in `selected.panel`). */
  widget: Widget | null;
  /** A widget has been copied (Paste after is offered). */
  canPasteWidget: boolean;
  canUndo: boolean;
  canRedo: boolean;
  showGrid: boolean;
  showSources: boolean;
  /** Every section of the profile theme is locked (the palette's lock-all). */
  enforced: boolean;
  /** Built-in and saved appearance presets (applied to all profiles). */
  appearancePresets: { id: string; name: string }[];
}

const DRAWERS: { drawer: Drawer; label: string }[] = [
  { drawer: "add", label: "Add" },
  { drawer: "layers", label: "Layers" },
  { drawer: "profiles", label: "Profiles" },
  { drawer: "island", label: "Dynamic Island" },
  { drawer: "alerts", label: "Alerts" },
];

function generalCommands(s: CommandState): Command[] {
  const general = (id: string, label: string, action: CommandAction, hint?: string): Command => ({
    id,
    label,
    group: "General",
    hint,
    action,
  });
  return [
    general("save", "Save", { type: "save" }, KEYS.save),
    ...(s.canUndo ? [general("undo", "Undo", { type: "undo" }, KEYS.undo)] : []),
    ...(s.canRedo ? [general("redo", "Redo", { type: "redo" }, KEYS.redo)] : []),
    general("export", "Export config", { type: "export" }),
    general("import", "Import config…", { type: "import" }),
    general("copy-profile", "Copy profile JSON", { type: "copy-profile" }),
    general("shortcuts", "Keyboard shortcuts", { type: "shortcuts" }, KEYS.cheatsheet),
    ...DRAWERS.map(({ drawer, label }) =>
      general(`drawer:${drawer}`, `Open drawer: ${label}`, { type: "drawer", drawer })
    ),
    general("alerts-open", "Open alerts", { type: "alerts-open" }),
    general("alert-new", "New alert rule", { type: "alert-new" }),
    general("background", "Background…", { type: "document-tab", tab: "background" }),
    general("appearance", "Appearance…", { type: "document-tab", tab: "appearance" }),
    general("general", "General settings…", { type: "document-tab", tab: "general" }, "font, clock, motion"),
    general("connection", "Connection…", { type: "document-tab", tab: "connection" }, "Data API URL"),
    general("theme", "Theme editor…", { type: "edit-theme" }, "profile and page themes, locks"),
    general("follow-all", "Make all widgets follow the theme", { type: "follow-all" }, "this profile"),
    general(
      "toggle-enforce",
      s.enforced ? "Unlock every theme section" : "Lock every theme section",
      { type: "toggle-enforce" }
    ),
    general("sources", s.showSources ? "Back to Design" : "Open Sources", { type: "sources" }),
    general("grid", s.showGrid ? "Hide grid" : "Show grid", { type: "toggle-grid" }),
    general("toggle-dock", "Toggle inspector", { type: "toggle-dock" }, KEYS.dock),
    general("zoom-fit", "Zoom to fit", { type: "zoom-fit" }, KEYS.fit),
    general("zoom-in", "Zoom in", { type: "zoom-in" }, KEYS.zoomIn),
    general("zoom-out", "Zoom out", { type: "zoom-out" }, KEYS.zoomOut),
    ...(s.placements.length > 0
      ? [general("select-all", "Select all zones", { type: "select-all" }, KEYS.selectAll)]
      : []),
  ];
}

/** Go to a page, and add / rename / duplicate / delete the current one. */
function pageCommands(s: CommandState): Command[] {
  const page = (id: string, label: string, action: CommandAction, hint?: string): Command => ({
    id: `page:${id}`,
    label,
    group: "Pages",
    hint,
    action,
  });
  return [
    ...s.pages.map((p) =>
      page(`go:${p.id}`, `Go to page: ${p.name}`, { type: "page-go", id: p.id }, p.id === s.currentPage ? "current" : undefined)
    ),
    page("add", "Add page", { type: "page-add" }),
    ...(s.pages.length > 1
      ? [
          page("next", "Next page", { type: "page-next" }, KEYS.nextPage),
          page("prev", "Previous page", { type: "page-prev" }, KEYS.prevPage),
        ]
      : []),
    page("duplicate", "Duplicate page", { type: "page-duplicate" }),
    page("rename", "Rename page", { type: "page-rename" }),
    ...(s.pages.length > 1 ? [page("delete", "Delete page", { type: "page-delete" })] : []),
  ];
}

/** Hide, duplicate and remove for several selected zones at once. */
function selectionCommands(selection: Placement[]): Command[] {
  const n = selection.length;
  const zone = (id: string, label: string, action: CommandAction, hint: string): Command => ({
    id: `zone:${id}`,
    label,
    group: "Selected zones",
    hint,
    action,
  });
  return [
    zone("duplicate", `Duplicate ${n} zones`, { type: "duplicate" }, KEYS.duplicate),
    zone(
      "visible",
      `${selection.some((p) => p.visible) ? "Hide" : "Show"} ${n} zones`,
      { type: "toggle-visible" },
      KEYS.hide
    ),
    zone("remove", `Remove ${n} zones`, { type: "remove" }, KEYS.remove),
  ];
}

/** Copy / paste the look and follow the global style, for the selected zone(s). */
function styleCommands(): Command[] {
  const style = (id: string, label: string, action: CommandAction, hint?: string): Command => ({
    id: `style:${id}`,
    label,
    group: "Zone style",
    hint,
    action,
  });
  return [
    style("copy", "Copy style", { type: "copy-style" }, KEYS.copyStyle),
    style("paste", "Paste style", { type: "paste-style" }, KEYS.pasteStyle),
    style("follow", "Follow global style", { type: "follow-global" }),
    style("global-all", "Use as global style: all profiles", { type: "use-global", target: "all" }),
    style("global-profile", "Use as global style: this profile", { type: "use-global", target: "profile" }),
  ];
}

/**
 * `widgetKeys`: Ctrl+D / Del act on the selected widget, so the zone's show no key. The "Go to" commands are listed
 * only when the inspector has that section (a widget with no header has no Header section).
 */
function selectedCommands(selected: Placement, widgetKeys: boolean, context: InspectorContext | null): Command[] {
  const has = new Set(context ? allSections(context).map((s) => s.id) : ["header", "colors"]);
  const zone = (id: string, label: string, action: CommandAction, hint?: string): Command => ({
    id: `zone:${id}`,
    label,
    group: "Selected zone",
    hint,
    action,
  });
  return [
    zone("pick", "Pick widget…", { type: "pick-widget" }),
    ...(selected.panel ? [zone("save-preset", "Save panel as preset…", { type: "save-panel-preset" })] : []),
    zone("duplicate", "Duplicate zone", { type: "duplicate" }, widgetKeys ? undefined : KEYS.duplicate),
    zone(
      "visible",
      selected.visible ? "Hide zone" : "Show zone",
      { type: "toggle-visible" },
      KEYS.hide
    ),
    zone("remove", "Remove zone", { type: "remove" }, widgetKeys ? undefined : KEYS.remove),
    ...(has.has("header") ? [zone("card:header", "Go to Header settings", { type: "goto-card", id: "header" })] : []),
    ...(has.has("colors") ? [zone("card:colors", "Go to Colors (style)", { type: "goto-card", id: "colors" })] : []),
  ];
}

/**
 * "Go to setting: …" for every setting of the inspector's current context,
 * and "Go to section: …" for a section that is custom UI only (the Dashboard's
 * cards, a panel's layout): each jumps to its tab and section.
 */
function settingCommands(context: InspectorContext, group: string): Command[] {
  return allSections(context).flatMap((s): Command[] => [
    ...s.settings.map(
      (def): Command => ({
        id: `setting:${s.id}:${def.key}`,
        label: `Go to setting: ${def.label}`,
        group,
        hint: s.title,
        action: { type: "goto-setting", section: s.id, key: def.key },
      })
    ),
    ...(s.settings.length === 0 && s.special
      ? [
          {
            id: `section:${s.id}`,
            label: `Go to section: ${s.title}`,
            group,
            hint: "Inspector",
            action: { type: "goto-setting", section: s.id } as const,
          },
        ]
      : []),
  ]);
}

/** "Go to setting: …" for every theme editor row (the theme's look, units, thresholds and motion). */
function themeSettingCommands(): Command[] {
  return allSections({ kind: "theme", scope: "profile" }).flatMap((s) =>
    s.settings.map(
      (def): Command => ({
        id: `theme-setting:${s.id}:${def.key}`,
        label: `Go to setting: ${def.label}`,
        group: "Theme",
        hint: `Theme › ${s.title}`,
        action: { type: "goto-theme-setting", section: s.id, key: def.key },
      })
    )
  );
}

/** The selected panel widget's actions (Move only where it can go). */
function widgetCommands(widgets: Widget[], widget: Widget, canPaste: boolean): Command[] {
  const cmd = (id: string, label: string, action: CommandAction, hint?: string): Command => ({
    id: `widget:${id}`,
    label,
    group: "Selected widget",
    hint,
    action,
  });
  const i = widgets.findIndex((w) => w.id === widget.id);
  return [
    cmd("duplicate", "Duplicate widget", { type: "widget-duplicate" }, KEYS.duplicate),
    cmd("copy", "Copy widget", { type: "widget-copy" }, KEYS.copy),
    ...(canPaste ? [cmd("paste", "Paste widget after", { type: "widget-paste" }, KEYS.paste)] : []),
    ...(i > 0 ? [cmd("up", "Move widget earlier", { type: "widget-move", delta: -1 }, "Alt+↑")] : []),
    ...(i >= 0 && i < widgets.length - 1
      ? [cmd("down", "Move widget later", { type: "widget-move", delta: 1 }, "Alt+↓")]
      : []),
    cmd("remove", "Remove widget", { type: "widget-remove" }, KEYS.remove),
  ];
}

/** "Select widget: …" for each widget of the selected panel. */
function selectWidgetCommands(widgets: Widget[]): Command[] {
  return widgets.map(
    (w, i): Command => ({
      id: `select-widget:${w.id}`,
      label: `Select widget: ${widgetName(w)}`,
      group: "Widgets",
      hint: `#${i + 1}${w.visible ? "" : " · hidden"}`,
      action: { type: "select-widget", id: w.id },
    })
  );
}

/**
 * Every command available in the studio's current state. Each one maps
 * to a control that is also reachable with the mouse.
 */
export function buildCommands(s: CommandState): Command[] {
  const widgets = s.selected?.panel?.widgets ?? [];
  return [
    ...(s.widget ? widgetCommands(widgets, s.widget, s.canPasteWidget) : []),
    ...((s.selection?.length ?? 0) > 1
      ? selectionCommands(s.selection!)
      : s.selected
        ? selectedCommands(s.selected, s.widget !== null, s.context)
        : []),
    ...(s.context ? settingCommands(s.context, s.selected ? "Selected zone" : "Dashboard") : []),
    ...themeSettingCommands(),
    ...(s.selected ? styleCommands() : []),
    ...selectWidgetCommands(widgets),
    ...generalCommands(s),
    ...pageCommands(s),
    ...s.appearancePresets.map(
      (p): Command => ({
        id: `appearance:${p.id}`,
        label: `Apply appearance: ${p.name}`,
        group: "Appearance",
        hint: "all profiles",
        action: { type: "apply-appearance", id: p.id },
      })
    ),
    ...s.insertables.map(
      (item): Command => ({
        id: `add:${item.kind}:${item.id}`,
        label: `${item.kind === "panel" ? "Add panel" : "Add widget"}: ${item.title}`,
        group: "Add",
        action:
          item.kind === "panel"
            ? { type: "add-preset", id: item.id }
            : { type: "add-module", id: item.id },
      })
    ),
    {
      id: "profile:auto",
      label: "Switch profile: Auto (match window)",
      group: "Profiles",
      action: { type: "profile", id: "auto" },
    },
    ...s.profiles.map(
      (p): Command => ({
        id: `profile:${p.id}`,
        label: `Switch profile: ${p.name}`,
        group: "Profiles",
        hint: `${p.width}×${p.height}`,
        action: { type: "profile", id: p.id },
      })
    ),
    ...sortZones(s.placements).map(
      (p): Command => ({
        id: `select:${p.id}`,
        label: `Select zone: ${placementTitle(p)}`,
        group: "Zones",
        hint: `C${p.colStart} · R${p.rowStart}`,
        action: { type: "select", id: p.id },
      })
    ),
  ];
}

/** Lower-case and strip diacritics. */
function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/**
 * How well a label matches a (folded, non-empty) query: 3 = prefix,
 * 2 = a word starts with it, 1 = substring, 0.5 = every query word is a
 * substring, 0 = no match.
 */
export function matchScore(label: string, query: string): number {
  const text = fold(label);
  if (text.startsWith(query)) return 3;
  if (text.split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith(query))) return 2;
  if (text.includes(query)) return 1;
  const words = query.split(/\s+/).filter(Boolean);
  return words.length > 1 && words.every((w) => text.includes(w)) ? 0.5 : 0;
}

/** Commands matching the query, best first (stable within a score). */
export function rankCommands(commands: Command[], query: string): Command[] {
  const q = fold(query.trim());
  if (q === "") return commands;
  return commands
    .map((command, index) => ({ command, index, score: matchScore(command.label, q) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((x) => x.command);
}

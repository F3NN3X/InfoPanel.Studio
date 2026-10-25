import type { CommandAction } from "./commands";

/** The shortcut modifier as the platform names it. */
const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";
const ALT = MOD === "⌘" ? "⌥" : "Alt+";

/** The rows of the zone and canvas context menus. */
export type MenuItemId =
  | "pick"
  | "edit-style"
  | "bind-data"
  | "save-panel"
  | "convert-zone"
  | "duplicate"
  | "visible"
  | "move-to-page"
  | "narrower"
  | "wider"
  | "shorter"
  | "taller"
  | "copy-style"
  | "paste-style"
  | "follow-global"
  | "global-all"
  | "global-profile"
  | "deselect"
  | "remove"
  | "add-widget"
  | "select-all"
  | "zoom-fit"
  | "edit-theme"
  | "shortcuts";

export interface MenuItemSpec {
  id: MenuItemId;
  label: string;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  /** A flyout of pages to pick from (Move to page). */
  pages?: { id: string; name: string }[];
}

export type MenuSpec = (MenuItemSpec | "separator")[];

export interface ZoneMenuState {
  /** How many zones are selected. */
  count: number;
  /** The primary zone is a dashboard widget or panel (not a canvas or blank zone): it can be converted to InfoPanel. */
  convertible?: boolean;
  /** The primary zone is a panel. */
  panel: boolean;
  /** Any selected zone shows (the row hides them), else it shows them all. */
  anyVisible: boolean;
  /** A style has been copied. */
  canPasteStyle: boolean;
  /** Whether the primary zone can take this size step (cells). */
  canStep: (cols: number, rows: number) => boolean;
  /** The profile's other pages; "Move to page" is offered when there are any. */
  otherPages?: { id: string; name: string }[];
}

const STEPS: { id: MenuItemId; label: string; hint: string; cols: number; rows: number }[] = [
  { id: "narrower", label: "Narrower", hint: "Shift+←", cols: -1, rows: 0 },
  { id: "wider", label: "Wider", hint: "Shift+→", cols: 1, rows: 0 },
  { id: "shorter", label: "Shorter", hint: "Shift+↑", cols: 0, rows: -1 },
  { id: "taller", label: "Taller", hint: "Shift+↓", cols: 0, rows: 1 },
];

/** Drops separators that lead, trail or double up (groups left empty). */
function tidy(spec: MenuSpec): MenuSpec {
  return spec.filter((e, i) => e !== "separator" || (i > 0 && i < spec.length - 1 && spec[i - 1] !== "separator"));
}

/**
 * The right-click / More menu of the selected zone(s): the spec's rows,
 * plus what the old selection toolbar had (change widget, the four size
 * steps, deselect). Size steps and the widget-only rows are for a single
 * zone.
 */
export function zoneMenu(s: ZoneMenuState): MenuSpec {
  const single = s.count === 1;
  return tidy([
    ...(single ? [{ id: "pick" as const, label: "Change widget…" }] : []),
    { id: "edit-style", label: "Edit style" },
    ...(single ? [{ id: "bind-data" as const, label: "Bind data…" }] : []),
    ...(single && s.panel ? [{ id: "save-panel" as const, label: "Save as Panel" }] : []),
    ...(single && s.convertible ? [{ id: "convert-zone" as const, label: "Convert zone to InfoPanel (experimental)…" }] : []),
    { id: "duplicate", label: "Duplicate", hint: `${MOD}D` },
    { id: "visible", label: s.anyVisible ? "Hide" : "Show", hint: "H" },
    ...(s.otherPages && s.otherPages.length > 0
      ? [{ id: "move-to-page" as const, label: "Move to page", pages: s.otherPages }]
      : []),
    "separator",
    { id: "copy-style", label: "Copy style", hint: `${MOD}${ALT}C`, disabled: !single },
    { id: "paste-style", label: "Paste style", hint: `${MOD}${ALT}V`, disabled: !s.canPasteStyle },
    { id: "follow-global", label: "Follow the theme" },
    ...(single
      ? [
          { id: "global-all" as const, label: "Make this the theme for all screens" },
          { id: "global-profile" as const, label: "Make this the theme for this screen" },
          "separator" as const,
          ...STEPS.map(({ id, label, hint, cols, rows }) => ({ id, label, hint, disabled: !s.canStep(cols, rows) })),
        ]
      : []),
    "separator",
    { id: "deselect", label: "Deselect", hint: "Esc" },
    { id: "remove", label: single ? "Delete" : `Delete ${s.count} widgets`, hint: "⌫", danger: true },
  ]);
}

/** The menu of empty canvas. */
export function canvasMenu(): MenuSpec {
  return [
    { id: "add-widget", label: "Add widget…" },
    { id: "select-all", label: "Select all", hint: `${MOD}A` },
    { id: "zoom-fit", label: "Zoom to fit", hint: `${MOD}0` },
    { id: "edit-theme", label: "Edit theme" },
    "separator",
    { id: "shortcuts", label: "Keyboard shortcuts", hint: "?" },
  ];
}

/** The command a menu row runs. */
export function menuAction(id: Exclude<MenuItemId, "move-to-page">): CommandAction {
  switch (id) {
    case "pick":
      return { type: "pick-widget" };
    case "edit-style":
      return { type: "edit-style" };
    case "bind-data":
      return { type: "bind-data" };
    case "convert-zone":
      return { type: "convert", scope: "zone" };
    case "save-panel":
      return { type: "save-panel-preset" };
    case "duplicate":
      return { type: "duplicate" };
    case "visible":
      return { type: "toggle-visible" };
    case "narrower":
      return { type: "resize-step", cols: -1, rows: 0 };
    case "wider":
      return { type: "resize-step", cols: 1, rows: 0 };
    case "shorter":
      return { type: "resize-step", cols: 0, rows: -1 };
    case "taller":
      return { type: "resize-step", cols: 0, rows: 1 };
    case "copy-style":
      return { type: "copy-style" };
    case "paste-style":
      return { type: "paste-style" };
    case "follow-global":
      return { type: "follow-global" };
    case "global-all":
      return { type: "use-global", target: "all" };
    case "global-profile":
      return { type: "use-global", target: "profile" };
    case "deselect":
      return { type: "deselect" };
    case "remove":
      return { type: "remove" };
    case "add-widget":
      return { type: "drawer", drawer: "add" };
    case "select-all":
      return { type: "select-all" };
    case "zoom-fit":
      return { type: "zoom-fit" };
    case "edit-theme":
      return { type: "open-theme" };
    case "shortcuts":
      return { type: "shortcuts" };
  }
}

import { FIXTURE_NAMES, type FixtureName } from "@/dev/fixtures/types";

/** One line of a reference state's "the build must show" list, and the phase of IMPLEMENTATION_PLAN.md that builds it. */
export interface Check {
  text: string;
  phase: 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

const c = (phase: Check["phase"], text: string): Check => ({ phase, text });

/** The reference's `CHECKS` (Unified Editor v3.dc.html), verbatim, each with the phase that enables it. */
export const CHECKS: Record<FixtureName, Check[]> = {
  screen: [
    c(6, 'No Grid / Free control anywhere: no Layout switch in page settings, no layout icons on page tabs, no "free area" kind'),
    c(3, 'Faint cell lines on the canvas; widgets always on cells, never overlapping; zoom bar reads "Snap: cells · Alt frees items"'),
    c(4, 'Left panel is one Layers | Add tab control; Layers header reads "Layers · top first"'),
    c(4, "Every Layers row: chevron slot, 20 px icon tile (widget icon in accent), name, kind word, lock, eye"),
    c(6, 'Weather selected: "Studio widget", PLACE ON GRID with an "On grid" chip and COL / ROW / W / H'),
    c(6, "Nothing selected → page settings show GRID: Snap items to grid (on) and the Alt hint"),
  ],
  profile: [
    c(1, 'Titlebar tag "Imported from InfoPanel"; same page tabs, canvas and panels as a screen'),
    c(3, "Canvas shows the profile’s 8 × 5 cell lines; items keep their imported pixel positions"),
    c(4, 'Layers: group Temps expanded; items show their icon, "item", the placed-freely mark and a status icon'),
    c(1, 'Pill "Export check · 7 as is · 1 approximated"; a badge on every canvas part'),
    c(6, 'CPU temp selected: "InfoPanel item", "Placed freely" chip, X / Y / W / H in px, a "Snap to grid" action, On InfoPanel line'),
    c(6, "No link or copy that points to a separate InfoPanel editor"),
  ],
  addw: [
    c(5, "Add tab open as a tile grid; on an InfoPanel screen InfoPanel items come first; every tile has a status icon"),
    c(3, "Weather dropped without Alt snaps to cells (COL 7 · ROW 5 · W 2 · H 1), selected, with the picture badge"),
    c(5, 'Toast "Weather added. On InfoPanel export it becomes a picture…" with Undo and Change'),
    c(6, 'Inspector: "Studio widget", PLACE ON GRID, On InfoPanel segmented Recreate · Snapshot · Leave out'),
    c(4, "Switching to Layers shows Weather as the top row in the same tree as the items"),
  ],
  alt: [
    c(3, 'Alt held while dragging an item or element: no snapping, cell lines fade to 35 %, hint "Alt · Placing freely" at the top of the canvas'),
    c(3, "Live readout under the part: X · Y · W · H in px; a dashed outline marks where the drag started"),
    c(3, "The item may sit on top of widgets; on drop it is stored in px and Layers shows the placed-freely mark"),
    c(3, "Alt does nothing for widgets: they always snap to cells and can never overlap another widget"),
    c(6, 'Inspector: "Placed freely" chip, X / Y / W / H, and "Snap to grid" to put the item back on cells'),
    c(3, "Arrows move one cell; Alt+Arrows nudge items 1 px; Alt+Shift+Arrows 10 px"),
  ],
  export: [
    c(1, "Made for InfoPanel too; pill lists all four statuses with dots"),
    c(1, "Inspector is the Export check: Live label, 6 px stacked bar, groups Left out → Becomes a picture → Approximated → Exports as is"),
    c(1, 'Note "This page will be converted when you export. Review conversion…"'),
    c(1, "Clicking a row selects that part; Esc or selecting anything closes the panel"),
    c(1, 'Primary "Export .infopanel" with "Export writes a copy. Your screen isn’t changed."'),
  ],
  layersF: [
    c(4, "Weather (widget) nested in group \"Right column\" with Fan gauge (item): widgets and items share groups"),
    c(4, '"Panel card" element is the bottom row and renders behind the Temps items'),
    c(4, "Right-click menu: Bring to front, Bring forward, Send backward, Send to back · Group, Ungroup, Move to group ▸ · Lock, Hide · Rename, Duplicate, Delete"),
    c(4, "Dragging a row shows a 2 px accent line between rows (reorder) or an accent outline on a group (move into)"),
    c(4, "Selecting a group draws its box on the canvas with a label chip; its children tint in Layers"),
    c(4, "Hidden rows dim to 45 %; locked rows show the lock and can’t be moved on the canvas"),
  ],
  layersG: [
    c(4, 'Group "Gauges" holds CPU and GPU gauge; dragging the group moves both by cells'),
    c(4, 'Group "Overlay" (Title text item, Accent glow element) is above Gauges in Layers and renders over the gauges'),
    c(3, "Accent glow is on cells (columns 1–2, row 1); Title text is placed freely and shows the mark"),
    c(4, 'Selecting a group: accent box with "{name} · group" chip, children tinted in Layers, inspector "Group · 1 item, 1 element"'),
    c(3, "Widgets never overlap each other; items and elements may sit over widgets"),
  ],
  hover: [
    c(5, "Add shows 3 tiles per row (64 px tall): icon, name, size top-left for widgets, status icon top-right when made for InfoPanel"),
    c(5, "Section headers and category sub-headers stay; no descriptions on tiles"),
    c(5, "Hovering a tile (or arrow-key focus) opens the details card beside the panel after 250 ms, aligned to the tile row"),
    c(5, 'Card: live render, name + category, description, size chip or "any size · InfoPanel item", "On InfoPanel: {status}"'),
    c(5, 'Card footer "Click to add · drag to place"; the card never blocks the pointer'),
  ],
};

if (FIXTURE_NAMES.some((name) => !(name in CHECKS))) throw new Error("CHECKS misses a fixture");

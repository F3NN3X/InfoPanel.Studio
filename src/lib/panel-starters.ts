import { newPanel, newWidget, type PanelDef, type Widget, type WidgetKind } from "./layout";
import type { PanelPreset } from "./panelPresets";

/* ------------------------------------------------------------------ *
 * Layout starters — sensor-free panels that show off the arrangements
 * (stack, grid, overlay; gaps, alignment, fill / hug boxes). Drop one,
 * then bind each widget to a sensor in the inspector (unbound widgets
 * say "pick a sensor" in the studio).
 * ------------------------------------------------------------------ */

/** A fresh widget of a kind with some fields set. */
function sw(kind: WidgetKind, fields: Partial<Omit<Widget, "id" | "kind">> = {}): Widget {
  return { ...newWidget(kind), ...fields };
}

/** A fresh panel with its arrangement and widgets. */
function starter(title: string, fields: Partial<Omit<PanelDef, "id" | "title">>): PanelDef {
  return { ...newPanel(title), ...fields };
}

const stat = () => sw("stat", { align: "center", box: { w: "fill" } });

export const layoutStarters: PanelPreset[] = [
  {
    id: "layout-stat-row",
    title: "Row of stats",
    description: "Three stats sharing one row — stack, no wrap, spread",
    blurb: "Three stats spread in a row",
    colSpan: 4,
    rowSpan: 1,
    make: () =>
      starter("Stats", {
        layout: "stack",
        direction: "row",
        wrap: false,
        justify: "between",
        align: "center",
        gap: 16,
        widgets: [stat(), stat(), stat()],
      }),
  },
  {
    id: "layout-stat-grid",
    title: "2×2 stats",
    description: "Four stats in a 2-column grid, centered in their cells",
    blurb: "Two-column grid of four stats",
    colSpan: 3,
    rowSpan: 2,
    make: () =>
      starter("Stats", {
        layout: "grid",
        columns: 2,
        justify: "center",
        align: "center",
        gap: 12,
        widgets: [stat(), stat(), stat(), stat()],
      }),
  },
  {
    id: "layout-hero",
    title: "Hero overlay",
    description: "Background image with a title and a big stat on top",
    blurb: "Background image, title and a big stat",
    colSpan: 4,
    rowSpan: 2,
    make: () =>
      starter("Hero", {
        titleVisible: false,
        layout: "overlay",
        overlayAlign: { top: "start", middle: "center", bottom: "between" },
        widgets: [
          sw("image", { asBackground: true }),
          sw("text", { text: "Title", fontSize: 18, overlayZone: "top" }),
          sw("stat", { fontSize: 40, align: "center", overlayZone: "middle" }),
          sw("value", { overlayZone: "bottom" }),
          sw("value", { overlayZone: "bottom" }),
        ],
      }),
  },
  {
    id: "layout-gauge-row",
    title: "Gauge row",
    description: "Three ring gauges spread across a row",
    blurb: "Three gauges in a row",
    colSpan: 4,
    rowSpan: 1,
    make: () =>
      starter("Gauges", {
        titleVisible: false,
        layout: "stack",
        direction: "row",
        wrap: false,
        justify: "between",
        align: "center",
        gap: 12,
        widgets: [0, 1, 2].map(() => sw("gauge", { max: 100, size: 64 })),
      }),
  },
  {
    id: "layout-clock",
    title: "Clock + date",
    description: "Time over date, centered in its space",
    blurb: "Time over date",
    colSpan: 2,
    rowSpan: 1,
    make: () =>
      starter("Clock", {
        titleVisible: false,
        background: "none",
        layout: "stack",
        direction: "column",
        wrap: false,
        justify: "center",
        align: "center",
        gap: 0,
        widgets: [
          sw("clock", { clock: "time", fontSize: 48, align: "center" }),
          sw("clock", { clock: "date", fontSize: 64, align: "center" }),
        ],
      }),
  },
  {
    id: "layout-list",
    title: "Label / value list",
    description: "Rows of a label and a right-aligned value — 2-column grid",
    blurb: "Labels with right-aligned values",
    colSpan: 2,
    rowSpan: 2,
    make: () =>
      starter("Details", {
        layout: "grid",
        columns: 2,
        gridCols: "minmax(0, 1fr) auto",
        align: "center",
        gap: 6,
        widgets: [1, 2, 3, 4].flatMap((n) => [
          sw("text", { text: `Label ${n}`, fontSize: 12 }),
          sw("value", { align: "right", box: { self: "center" } }),
        ]),
      }),
  },
];

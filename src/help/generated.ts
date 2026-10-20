import { ALL_MODULES } from "@/components/studio/studio-modules";
import { KIND_INFO } from "@/components/studio/widget-kinds";
import { SHORTCUT_GROUPS } from "@/components/studio/use-studio-shortcuts";
import { DEFAULT_API_BASE } from "@/lib/data-api";
import { DEFAULT_KIOSK_URL, DEFAULT_SERVER_PORT } from "@/lib/dashboard-server";
import { defaultConfig } from "@/lib/layout";
import { WIDGET_KINDS } from "@/lib/panel-model";
import { layoutStarters } from "@/lib/panel-starters";
import { panelPresets } from "@/lib/panelPresets";
import { SKIN_PACKS } from "@/widgets/core/theme";
import type { Block } from "./types";

type Table = Extract<Block, { type: "table" }>;

const table = (head: string[], rows: string[][]): Table => ({ type: "table", head, rows });

const size = (cols: number, rows: number) => `${cols}×${rows}`;

/**
 * The `:::generated <key>` blocks: tables and key lists built from the registries the app itself
 * reads, so they cannot go stale. Each is a pure function of those registries.
 */
export const GENERATORS: Record<string, () => Block[]> = {
  /** Every placeable widget: name, minimum zone size, what it shows (the studio's module list). */
  "widgets.table": () => [
    table(["Widget", "Minimum size", "Shows"], ALL_MODULES.map((m) => [`**${m.title}**`, size(m.minCols, m.minRows), m.description ?? "—"])),
  ],
  /** The panel widget kinds, in menu order. */
  "panel-widgets.table": () => [table(["Kind", "Shows"], WIDGET_KINDS.map((k) => [`**${KIND_INFO[k].label}**`, KIND_INFO[k].hint]))],
  /** The layout starters of Add > Layouts. */
  "presets.layouts": () => [
    table(["Starter", "Size", "Builds"], layoutStarters.map((s) => [`**${s.title}**`, size(s.colSpan, s.rowSpan), s.description ?? ""])),
  ],
  /** The built-in panel presets. */
  "presets.panels": () => [
    table(["Preset", "Size", "Builds"], panelPresets.map((p) => [`**${p.title}**`, size(p.colSpan, p.rowSpan), p.description ?? ""])),
  ],
  /** The appearance presets the studio ships: the skins of Appearance > Skins. */
  "presets.appearance": () => [table(["Skin", "Look"], SKIN_PACKS.map((p) => [`**${p.name}**`, p.description]))],
  /** The profiles a fresh install starts with. */
  "profiles.table": () => [
    table(
      ["Profile", "Size", "Grid", "Fit"],
      defaultConfig().profiles.map((p) => [`**${p.name}**`, size(p.width, p.height), size(p.cols, p.rows), p.fit === "fill" ? "Fill" : "Scroll"])
    ),
  ],
  /** Every studio shortcut, by group (the cheat sheet's own list). */
  "shortcuts.keys": () =>
    SHORTCUT_GROUPS.flatMap((g): Block[] => [
      { type: "p", text: `**${g.title}**` },
      { type: "keys", rows: g.items.map((i): [string, string] => [i.keys, i.label]) },
    ]),
  /** The ports and addresses a fresh install uses. */
  "defaults.table": () => [
    table(
      ["Setting", "Default"],
      [
        ["Server port", `\`${DEFAULT_SERVER_PORT}\``],
        ["Kiosk URL", `\`${DEFAULT_KIOSK_URL}\``],
        ["Data API port", `\`${new URL(DEFAULT_API_BASE).port}\``],
      ]
    ),
  ],
};

export const GENERATED_KEYS = Object.keys(GENERATORS);

/** The blocks for a generated key; an unknown key gives none (the content test fails on it). */
export function generate(key: string): Block[] {
  return GENERATORS[key]?.() ?? [];
}

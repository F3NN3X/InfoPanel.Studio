// The colours a worn pack gives the page's chrome, the island's pill and the alerts' cards (L25): the pack's own surface, text and edge,
// so a light pack does not carry a black pill. No blur: the page's 8 backdrop layers reserve one each for the island and an alert layer.
import type { CSSProperties } from "react";
import type { PanelDef } from "@/lib/panel-model";
import { hexToHsl } from "@/lib/theme";
import { contrastOf } from "@/looks/status";
import { cssColour, flatOver, parseColour } from "./colour";
import { resolveT1, type Look } from "./look";

/** A stack or grid panel on a pack Look (L67): the card's theme tokens and the check on an item's own colour. Built here so the entry carries none of it. */
export interface PackPanel {
  /** The theme tokens the card and its widgets read, re-scoped to the pack's surface, text, muted text and edge. */
  vars: CSSProperties;
  /** The overlay layout's title badge (the black tint without a pack). */
  badge: CSSProperties;
  /** A light pack's overlay layout: its dark text cannot sit on the black scrim, so the panel takes the card's tokens as a stack does and `overlayCss` plates it. Unset, a dark pack keeps the theme's tokens and the black scrim. */
  overlay?: Pick<PackPanel, "vars" | "legible">;
  /** The panel without the item colours that vanish on the pack's card (a white item on Paper). */
  legible: (panel: PanelDef) => PanelDef;
}

export interface PackChrome {
  fill: string;
  ink: string;
  edge: string;
  /** The Look's muted text (the panels' secondary text, L67). */
  muted: string;
  /** The Look's accent: the colour of the stage's glow (L81). */
  accent: string;
  panel: PackPanel;
  /** The page header (title, muted text) in the pack's text; unset when that text does not hold on the pack's page (a light card on a dark page), and the theme's stays. */
  page?: CSSProperties;
}

const HEX6 = /^#[0-9a-f]{6}$/i;
const HEX8 = /^(#[0-9a-f]{6})[0-9a-f]{2}$/i;
/** The smallest contrast an item's own colour keeps against the pack's card before the pack's text replaces it. */
const OWN_COLOR_MIN = 3;
/** Text the page header draws holds this on the pack's page. */
const TEXT_MIN = 4.5;

/** The panel's tokens are HSL triplets, so only the colours that are `#rrggbb` are taken; on a dark pack the overlay layout keeps the theme's (its text sits on a black scrim). */
function panelOf(fill: string, ink: string, edge: string, muted: string): PackPanel {
  const tokens: [string, string][] = [["--card", fill], ["--foreground", ink], ["--card-foreground", ink], ["--muted-foreground", muted], ["--border", edge]];
  // An item's own colour with an alpha is read as opaque, the case that vanishes; rgb(), hsl() and names are not read, and keep their colour.
  const lost = (color: string | undefined) => !!color && (contrastOf(color.replace(HEX8, "$1"), fill) ?? OWN_COLOR_MIN) < OWN_COLOR_MIN;
  const vars = Object.fromEntries(tokens.filter(([, hex]) => HEX6.test(hex)).map(([name, hex]) => [name, hexToHsl(hex)])) as CSSProperties;
  const legible: PackPanel["legible"] = (panel) => (panel.widgets.some((w) => lost(w.color)) ? { ...panel, widgets: panel.widgets.map((w) => (lost(w.color) ? { ...w, color: undefined } : w)) } : panel);
  const light = HEX6.test(fill) && (contrastOf(fill, "#000000") ?? 0) > (contrastOf(ink, "#000000") ?? 0);
  return { badge: { backgroundColor: fill, color: ink }, vars, legible, overlay: light ? { vars, legible } : undefined };
}

/**
 * The rules of a light pack's overlay panel (`PackPanel.overlay`), mounted with the pack's CSS so the entry carries none of them: the
 * scrim takes the card's colour, as decoration, and each band of widgets sits on a plate of the card, on which the validator holds the
 * pack's text at 4.5:1, so the art shows between the plates and the text never sits on it. Ours, unlayered to beat the scrim's utilities.
 */
export const overlayCss = (id: string): string => {
  const panel = `.wp-panel[data-look="${id}"][data-panel-layout="overlay"]`;
  return `${panel} .wp-panel-scrim{background:hsl(var(--card)/.5)}${panel} .wp-band{background:hsl(var(--card));border-radius:calc(var(--radius)/2);padding:2px 6px}`;
};

/** A pack's chrome from its Look's first supported mode. The loader sets it (`Pack.chrome`), so the kiosk entry never loads `resolveT1` for it; without a pack (Classic, a skin or a sample) the app keeps its own. */
export function chromeOf(look: Look): PackChrome {
  const t1 = resolveT1(look, look.modes.supported[0]);
  // The text and edge as drawn (L-8): an rgb() or hsl() is a hex, an alpha is laid over the card, so the panels and the contrast read the colour on screen.
  const [ink, muted, edge] = [t1.fg, t1.muted, t1.border].map((c) => flatOver(c, t1.surface));
  const panel = panelOf(t1.surface, ink, edge, muted);
  // the page header sits on the page, so its text is laid over the page's colour
  const bg = parseColour(t1.bg)?.hex ?? t1.bg;
  const [pageInk, pageMuted] = [t1.fg, t1.muted].map((c) => flatOver(c, bg));
  const holds = (color: string) => (contrastOf(color, bg) ?? 0) >= TEXT_MIN;
  return { fill: t1.surface, ink, edge, muted, accent: cssColour(t1.accent), panel, page: holds(pageInk) && holds(pageMuted) ? { ...panel.vars, color: pageInk } : undefined };
}

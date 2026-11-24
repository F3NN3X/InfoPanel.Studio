// pack.json as a file (spec 03, Pack format): the one shape the validator, the user-pack reader and the loader read, and the
// names Phase 3 adds (L108): `frame` in place of `edge`, `ornaments` in place of `ornament`, FX levels and the animated kinds
// that flash. `packDecor` maps the old fields to the new so one renderer draws both. Types and constants only, plus that mapper.
import type { BurnIn, PackConnectors, PackStatusBar, StageLayer } from "./pack";
import type { PackEffect, SizeClass } from "./effects";
import type { PackMotion } from "./motion";

/** A card ornament stays in a band at most this many px (G2); the slot component's `ornament.size` is held to it unless it bleeds. */
export const ORNAMENT_MAX = 10;
/** A cut, notch or bracket is at most this many px (the old chamfer cap; the kit's largest cut is 18). */
export const FRAME_SIZE_MAX = 20;
/** A frame's stroke, px. */
export const FRAME_STROKE_MAX = 2;
/** A frame's spine (an accent bar along one edge) is at most this many px thick (the kit's is 5). */
export const FRAME_SPINE_MAX = 6;
/** A frame's tab (a solid accent tab on an edge) is at most this wide and this high, px (the kit's is 56 by 5). */
export const FRAME_TAB_WIDTH_MAX = 64;
export const FRAME_TAB_HEIGHT_MAX = 8;
/** The gap between the two lines of a `double` frame, px. */
export const FRAME_DOUBLE_GAP = 2;
/** The faintest a frame's lines may be (its `alpha`): under it a line no longer reads as an edge. */
export const FRAME_ALPHA_MIN = 0.2;
/** A frame's band (a tinted strip along one edge, a 1 px line on its inner side) is at most this many px wide (the kit's panel spine is 28); it draws at most the card's padding wide. */
export const FRAME_BAND_MAX = 28;
/** A frame's outer glow reaches at most this many px past the card, at most this strong. */
export const FRAME_GLOW_MAX = 16;
export const FRAME_GLOW_ALPHA_MAX = 0.6;
/** A frame's tint (the card fill washed with its tone) is at most this strong. */
export const FRAME_TINT_MAX = 0.25;
/** A dot grid's pitch, px, and its strength. */
export const GRID_SIZE_MIN = 12;
export const GRID_SIZE_MAX = 48;
export const GRID_ALPHA_MIN = 0.05;
export const GRID_ALPHA_MAX = 0.5;
/** Text the app draws for a pack outside a card (a frame's caption, the screen chrome's tab) is at least this many px: the type floor. */
export const CAPTION_PX = 11;
/** A caption, characters. */
export const CAPTION_TEXT_MAX = 64;
/** The screen chrome: its corner cut, its notched tab and the tab's text. */
export const CHROME_CUT_MAX = 64;
export const CHROME_TAB_WIDTH_MIN = 40;
export const CHROME_TAB_WIDTH_MAX = 320;
export const CHROME_TAB_HEIGHT_MIN = 14;
export const CHROME_TAB_HEIGHT_MAX = 40;
export const CHROME_TEXT_MAX = 32;
/** At most this many ornaments on a card. */
export const ORNAMENTS_MAX = 4;
/** An ornament's text, characters. */
export const ORNAMENT_TEXT_MAX = 64;
/** An animated effect flashes at most this many times a second (WCAG 2.3.1). */
export const FLASH_MAX = 3;

export const FRAME_CORNERS = ["square", "cut", "bracket", "notch"] as const;
export type FrameCorners = (typeof FRAME_CORNERS)[number];
export const CORNERS = ["tl", "tr", "br", "bl"] as const;
export type Corner = (typeof CORNERS)[number];
export const FRAME_EDGES = ["left", "right", "top", "bottom"] as const;
export type FrameEdge = (typeof FRAME_EDGES)[number];
export const ORNAMENT_KINDS = ["micro-print", "ticks", "reticle", "label"] as const;
export type OrnamentKind = (typeof ORNAMENT_KINDS)[number];
/** The ornament kinds that carry `text` (the others refuse it). */
export const TEXT_ORNAMENTS: readonly OrnamentKind[] = ["micro-print", "label"];
export const ORNAMENT_AT = ["tl", "tr", "br", "bl", "top", "bottom"] as const;
export type OrnamentAt = (typeof ORNAMENT_AT)[number];

/** What the screen's FX setting asks for: everything, the calm variants, or no effects. */
export const FX_LEVELS = ["full", "calm", "off"] as const;
export type FxLevel = (typeof FX_LEVELS)[number];
/** The kinds Phase 3 adds: app-drawn overlays, each `cost: "animated"`, at most `FLASH_MAX` flashes a second. */
export const FX_KINDS = ["glitch", "flicker", "rgb-split", "interference"] as const;
export type FxKind = (typeof FX_KINDS)[number];

/** The card frame the app draws in the card chrome. */
export interface PackFrame {
  corners: FrameCorners;
  /** px, 0 to `FRAME_SIZE_MAX`. */
  size: number;
  /** Which corners; unset = all four. */
  which?: Corner[];
  /** px, 0 to `FRAME_STROKE_MAX`, in the Look's accent; unset = 1. */
  stroke?: number;
  /** A corner's own kind, over `corners` and `which` (`square` leaves it plain). */
  byCorner?: Partial<Record<Corner, FrameCorners>>;
  /** A solid accent bar along one edge, `width` px thick, 1 to `FRAME_SPINE_MAX`. */
  spine?: { edge: FrameEdge; width: number };
  /** A solid accent tab on the edge at a corner: `width` 1 to `FRAME_TAB_WIDTH_MAX`, `height` 1 to `FRAME_TAB_HEIGHT_MAX`, px; `out` draws it outside the card, protruding from that edge. */
  tab?: { at: Corner; width: number; height: number; out?: boolean };
  /** A second line `FRAME_DOUBLE_GAP` px inside the first. */
  double?: boolean;
  /** How strong the lines and the spine are over the card, `FRAME_ALPHA_MIN` to 1 (the tab stays solid); unset = 1. */
  alpha?: number;
  /** A tinted band along the left or right edge with a line on its inner side, 1 to `FRAME_BAND_MAX` px (drawn at most the padding wide). */
  band?: { edge: "left" | "right"; width: number };
  /** The card fill washed with the frame's tone, 0.02 to `FRAME_TINT_MAX`. */
  tint?: number;
  /** `state`: the lines, spine, band, tint and glow take the warn or critical colour while the card shows a reading in that state. */
  tone?: "state";
  /** A dot grid in the card surface, under the content: `size` px between dots, `alpha` its strength. */
  grid?: { size: number; alpha?: number };
  /** A line under the header, in the frame's line colour. */
  rule?: boolean;
  /** A glow around the card, outside it: `radius` 1 to `FRAME_GLOW_MAX` px, `alpha` up to `FRAME_GLOW_ALPHA_MAX` (unset 0.35). */
  glow?: { radius: number; alpha?: number };
  /** A micro-print line above the card, outside it, in the Look's mono face at `CAPTION_PX`: 1 to `CAPTION_TEXT_MAX` characters. */
  caption?: { text: string; at?: "tl" | "tr" };
}

/** A dot grid over the page, under the cards (pack.json `stage.grid`). */
export interface StageGrid {
  size: number;
  alpha?: number;
  minSizeClass?: SizeClass;
}

/** The screen's own frame (pack.json `stage.chrome`): a line around the screen with cut corners, a notched tab at the top centre with an optional text, and corner reticles. */
export interface StageChrome {
  /** px the corners are cut, 0 to `CHROME_CUT_MAX`. */
  cut?: number;
  /** How strong the line is, `FRAME_ALPHA_MIN` to 1. */
  alpha?: number;
  tab?: { width: number; height: number; text?: string };
  reticles?: boolean;
  minSizeClass?: SizeClass;
}

/** Whether a frame draws anything outside the card (its glow, caption or an outside tab): such a card is wrapped in a host the frame layer sits in. */
export const framesOutside = (frame: PackFrame | undefined): boolean => !!frame && (!!frame.glow || !!frame.caption || !!frame.tab?.out);

/** One ornament the app draws on the card. */
export interface PackOrnament {
  kind: OrnamentKind;
  at: OrnamentAt;
  /** For `micro-print` and `label` only, 1 to `ORNAMENT_TEXT_MAX` characters, drawn as text. */
  text?: string;
  minSizeClass?: SizeClass;
}

export interface PackJson {
  id: string;
  name: string;
  version: string;
  tags: string[];
  description: string;
  modes: ("dark" | "light")[];
  fonts: { family: string; file: string; weight: string; style?: "normal" | "italic"; source?: string; licence: string; copyright: string }[];
  stage: { layers: StageLayer[]; effects?: PackEffect[]; overlayMinSizeClass?: SizeClass; grid?: StageGrid; chrome?: StageChrome };
  burnIn: BurnIn;
  statusBar?: PackStatusBar;
  connectors?: PackConnectors;
  assets?: { file: string; bytes: number }[];
  frame?: PackFrame;
  ornaments?: PackOrnament[];
  /** Text and card effects the app draws (L117, motion.ts). */
  motion?: PackMotion;
  /** One effect script, a file of the pack's assets (`assets/<file>`), run only in the pack-script sandbox (src/looks/pack-script/). */
  script?: { file: string };
  /** Old: the size of the built-in slot component (`PackSlots.ornament`). Kept as that; refused next to `ornaments`. */
  ornament?: { size: number; bleed?: boolean };
  /** Old: read as a `frame` by `packDecor`; refused next to `frame`. */
  edge?: { kind: "none" | "chamfer" | "distressed"; cut?: number };
}

/** What the app draws on the card from a pack.json: its frame and ornaments, the old `edge` read as a frame, and the slot's declared size. Assumes a validated pack. */
export function packDecor(json: Pick<PackJson, "frame" | "ornaments" | "ornament" | "edge">): { frame?: PackFrame; ornaments: PackOrnament[]; slot?: PackJson["ornament"] } {
  const frame = json.frame ?? (json.edge?.kind === "chamfer" && json.edge.cut !== undefined ? { corners: "cut" as const, size: json.edge.cut, which: [...CORNERS], stroke: 0 } : undefined);
  return { frame, ornaments: json.ornaments ?? [], slot: json.ornament };
}

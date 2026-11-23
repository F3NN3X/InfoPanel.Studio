// pack.json as a file (spec 03, Pack format): the one shape the validator, the user-pack reader and the loader read, and the
// names Phase 3 adds (L108): `frame` in place of `edge`, `ornaments` in place of `ornament`, FX levels and the animated kinds
// that flash. `packDecor` maps the old fields to the new so one renderer draws both. Types and constants only, plus that mapper.
import type { BurnIn, PackConnectors, PackStatusBar, StageLayer } from "./pack";
import type { PackEffect, SizeClass } from "./effects";
import type { PackMotion } from "./motion";

/** A card ornament stays in a band at most this many px (G2); the slot component's `ornament.size` is held to it unless it bleeds. */
export const ORNAMENT_MAX = 10;
/** A cut, notch or bracket is at most this many px (the old chamfer cap). */
export const FRAME_SIZE_MAX = 20;
/** A frame's stroke, px. */
export const FRAME_STROKE_MAX = 2;
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
}

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
  stage: { layers: StageLayer[]; effects?: PackEffect[]; overlayMinSizeClass?: SizeClass };
  burnIn: BurnIn;
  statusBar?: PackStatusBar;
  connectors?: PackConnectors;
  assets?: { file: string; bytes: number }[];
  frame?: PackFrame;
  ornaments?: PackOrnament[];
  /** Text and card effects the app draws (L117, motion.ts). */
  motion?: PackMotion;
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

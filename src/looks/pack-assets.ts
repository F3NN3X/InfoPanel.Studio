// What a built-in pack needs from the bundler (P10): where its files are served from, and its fonts. The pack's files sit in
// `src/looks/packs/<id>/assets/`; Vite hashes each name but keeps them in one folder, so the pack names them relative to
// that folder (`base` + file name), which the loader checks like any pack path (G4). Fonts load here, with app code, from
// the pack's own subset woff2 files: no stylesheet to lint and no request to a font host (D23).

import type { ScreenTemplate } from "@/lib/screen-templates/kit";
import type { PackEffect, SizeClass } from "./effects";
import type { Look } from "./look";
import type { BurnIn, Pack, PackConnectors, PackSlots, PackStatusBar, StageLayer } from "./pack";
import type { PackMotion } from "./motion";
import type { PackFrame, PackOrnament, StageChrome, StageGrid } from "./pack-json";

/** A pack's served folder (a root path of this origin, ending in `/`) and its files by source name. */
export interface PackFiles {
  base: string;
  /** Source file name -> the name it is served under. */
  names: Record<string, string>;
}

/** `import.meta.glob("./<id>/assets/*", { query: "?url&no-inline", import: "default", eager: true })`, read as one folder. */
export function packFiles(urls: Record<string, string>): PackFiles {
  const names: Record<string, string> = {};
  let base = "/";
  for (const [source, url] of Object.entries(urls)) {
    // a built file is a full URL (Vite resolves it against the chunk); the dev server and tests give a root path
    const path = /^[a-z][a-z\d+.-]*:/i.test(url) ? new URL(url).pathname : url;
    base = path.slice(0, path.lastIndexOf("/") + 1);
    names[source.slice(source.lastIndexOf("/") + 1)] = path.slice(base.length);
  }
  return { base, names };
}

export interface PackFont {
  family: string;
  /** The source file name in the pack's assets. */
  file: string;
  weight: string;
}

/** Adds the pack's fonts to the document (a no-op where there is no `FontFace`); the browser fetches a file when text first uses it. Returns the faces added, for a pack that goes away. */
export function addPackFonts(files: PackFiles, fonts: readonly PackFont[]): FontFace[] {
  if (typeof FontFace === "undefined" || typeof document === "undefined") return [];
  const added: FontFace[] = [];
  for (const f of fonts) {
    const name = files.names[f.file];
    if (!name) continue;
    const face = new FontFace(f.family, `url("${files.base}${name}")`, { weight: f.weight, display: "swap" });
    document.fonts.add(face);
    added.push(face);
  }
  return added;
}

/** The `pack.json` of a built-in pack: what the gallery, the loader and the budget check read (spec 03, Pack format). */
export interface PackMeta {
  id: string;
  name: string;
  version: string;
  tags: string[];
  description: string;
  modes: string[];
  fonts: (PackFont & { source: string; licence: string; copyright: string })[];
  stage: { layers: StageLayer[]; effects?: PackEffect[]; overlayMinSizeClass?: SizeClass; grid?: StageGrid; chrome?: StageChrome };
  burnIn: BurnIn;
  statusBar?: PackStatusBar;
  connectors?: PackConnectors;
  /** The frame and ornaments the app draws on each card (spec 03, L108), as a user pack's pack.json gives them. */
  frame?: PackFrame;
  ornaments?: PackOrnament[];
  /** The text and card effects the app draws (L117). */
  motion?: PackMotion;
  /** The effect script, a `.js` file of the pack's assets: it ships in the app bundle (pack-script/builtin.ts), never as a served file. */
  script?: { file: string };
}

/** A stage's grid and screen chrome, only where the pack declares them (a pack without either keeps the stage it had). */
export const stageChrome = (stage: { grid?: StageGrid; chrome?: StageChrome }): { grid?: StageGrid; chrome?: StageChrome } => ({ ...(stage.grid ? { grid: stage.grid } : null), ...(stage.chrome ? { chrome: stage.chrome } : null) });

/** A built-in pack from its files: `look.json` and `pack.json` as data, the bundler's urls for its assets, and the parts that are code. */
export function builtPack(meta: PackMeta, look: Look, files: PackFiles, parts: { css: string; slots: PackSlots; templates?: ScreenTemplate[] }): Pack {
  addPackFonts(files, meta.fonts);
  const served = (name: string) => files.names[name] ?? name;
  return {
    id: meta.id,
    look,
    base: files.base,
    css: parts.css,
    assets: Object.values(files.names),
    slots: parts.slots,
    stage: { layers: meta.stage.layers.map((l) => (l.image ? { ...l, image: served(l.image) } : l)), effects: meta.stage.effects, overlayMinSizeClass: meta.stage.overlayMinSizeClass, ...stageChrome(meta.stage) },
    burnIn: meta.burnIn,
    statusBar: meta.statusBar,
    connectors: meta.connectors,
    templates: parts.templates,
    ...(meta.frame ? { frame: meta.frame } : null),
    ...(meta.ornaments?.length ? { ornaments: meta.ornaments } : null),
    ...(meta.motion ? { motion: meta.motion } : null),
    ...(meta.script ? { script: meta.script } : null),
  };
}

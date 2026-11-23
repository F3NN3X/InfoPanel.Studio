// The theme pack entry (P9): what the kiosk and studio entries carry of the pack system. A pack is code and assets in a chunk
// of its own, loaded with import() the first time a screen wears its Look (pack-load.ts, where G4 is enforced); Classic, the
// skins and the sample Looks are not packs and load nothing. This file holds the types, the id list and the two thin readers.
import { useEffect, useState, useSyncExternalStore, type ComponentType } from "react";
import type { IconGlyph } from "@/widgets/core/types";
import type { ScreenTemplate } from "@/lib/screen-templates/kit";
import type { PackEffect, SizeClass } from "./effects";
import type { PackChrome } from "./chrome";
import type { Look } from "./look";
import type { PackDecorSpec } from "./pack-frame";
import type { PackMotion } from "./motion";
import type { MotionSlot } from "./motion-render";
import type { PackFrame, PackOrnament } from "./pack-json";

/** One page layer under the grid: a fill (a colour or gradient) and/or an image from the pack's own folder (`base` + `image`). */
export interface StageLayer {
  fill?: string;
  image?: string;
  opacity?: number;
  /** Hidden on a screen under this size class (`sizeClassOf`). */
  minSizeClass?: SizeClass;
}

/** What a pack draws behind (up to 3 layers) and over (one overlay and its effects) the page. */
export interface PackStageSpec {
  layers: StageLayer[];
  overlay?: ComponentType;
  overlayMinSizeClass?: SizeClass;
  /** Grain, scanlines, vignette, glow and blur, each with a cost class (effects.ts). */
  effects?: PackEffect[];
  /** Set by the loader: the Look's accent, the colour of the glow on the layers that carry art (`--w-accent`, L81). */
  accent?: string;
}

/** How much a pack's static art risks an always-on panel: `needs-shift` gets the pixel-shift drift, `needs-dim` the idle dim (Settings, per screen). Unset = `static-safe`. */
export type BurnIn = "static-safe" | "needs-shift" | "needs-dim";

/** Where a pack puts the island by default (the screen's own `IslandConfig.edge` wins) and what it looks like. */
export interface PackStatusBar {
  edge?: "top" | "bottom";
}

/** The connector between widgets the app draws, styled by the pack (`ConnectorLayer`). Unless the page gives pairs, the page's largest zone is the hub and every other zone connects to it. */
export interface PackConnectors {
  style: "line" | "elbow";
  dot?: boolean;
}

/** The parts of a Look a pack carries beyond look.json values: component slots on the widget card and an icon set. */
export interface PackSlots {
  ornament?: ComponentType;
  tabBand?: ComponentType;
  /** The frame and ornaments the app draws on the card (a user pack's `frame` and `ornaments`; Decoration off drops them). */
  decor?: PackDecorSpec;
  icons?: Record<string, IconGlyph>;
  /** The pack's motion block and the knobs the zone's level sets (`MotionText`, `MotionLayer`; Decoration off drops it). */
  motion?: MotionSlot;
}

/** The component that draws a stage (`PackStageLayers`, pack-stage.tsx); the loader puts it on the pack, so the entry holds no lazy boundary for it. */
export interface StageViewProps {
  stage: PackStageSpec;
  packId?: string;
  base?: string;
  className?: string;
  overlayClassName?: string;
  burnIn?: BurnIn;
  /** The screen's size (the profile's), for `minSizeClass`; unset = everything shows. */
  page?: { width: number; height: number };
  connectors?: PackConnectors;
  /** Pairs of zone ids the page connects (`ConnectorLayer`). */
  links?: readonly (readonly [string, string])[];
  /** The page's zones: with connectors and no `links`, the hub rule makes the pairs (`hubLinks`). */
  zones?: readonly ZoneSize[];
  /** The screen's accent (a variant's, the user's): what the effects and a layer's glow are drawn in; unset, the pack's own. */
  accent?: string;
}
/** What the hub rule reads of a zone: its id and how many cells it spans. */
export interface ZoneSize {
  id: string;
  colSpan: number;
  rowSpan: number;
}
export type StageView = ComponentType<StageViewProps>;

/** A loaded pack. Its Look's T3 values reach the widgets (`<Widget t3>`), its slots the card, its stage the page. */
export interface Pack {
  id: string;
  look: Look;
  /** Where the pack's files are served from (a URL ending in `/`); `image` paths are relative to it. */
  base?: string;
  /** Pack CSS (paint only); refused unless `packCssIssues` finds nothing. */
  css?: string;
  /** Every file the pack names, relative to `base`; refused unless each is pack-relative. */
  assets?: string[];
  slots?: PackSlots;
  stage?: PackStageSpec;
  burnIn?: BurnIn;
  /** The fonts the pack brings, by the family they come from and their licence (Theme's Font row and detail). */
  fonts?: { source?: string; licence?: string }[];
  statusBar?: PackStatusBar;
  connectors?: PackConnectors;
  /** The frame the app draws on each card (pack.json `frame`, or the old `edge` read as one). */
  frame?: PackFrame;
  /** The ornaments the app draws on each card (pack.json `ornaments`). */
  ornaments?: PackOrnament[];
  /** The text and card effects the app draws for the pack (pack.json `motion`, L117). */
  motion?: PackMotion;
  /** Page templates the New screen flow offers (opt-in; applying a pack never moves a widget). Each wears this pack's Look (`look.style.lookId`). */
  templates?: ScreenTemplate[];
  /** Set by the loader. */
  Stage?: StageView;
  /** Set by the loader: the pack's surface, text and edge for the island's pill and the alert cards (`chromeOf`, L25). */
  chrome?: PackChrome;
}

const ids = new Set<string>(["field-kit", "tape-86", "term", "neon-stripe", "overdrive", "swiss-mono", "holo", "night-glow", "paper", "classy-black", "liquid-glass", "black-and-gold", "cyberspec"]);
/** The Looks that are packs. Keep in step with `BUILTIN` in pack-load.ts (a test pins it). */
export const PACK_IDS: ReadonlySet<string> = ids;
/** Adds or removes a pack id (`registerPack` and `unregisterPack`, pack-load.ts). */
export function setPackId(id: string, on: boolean): void {
  if (on === ids.has(id)) return;
  if (on) ids.add(id);
  else ids.delete(id);
  for (const fn of watchers) fn();
}
const watchers = new Set<() => void>();
const watchIds = (fn: () => void) => {
  watchers.add(fn);
  return () => void watchers.delete(fn);
};

/** The pack a Look is (undefined for Classic, a skin, a sample Look, or while it loads or when the loader refused it). */
export function usePack(lookId: string | undefined): Pack | undefined {
  const [loaded, setLoaded] = useState<{ id: string; pack?: Pack }>();
  // a user pack can be registered after a screen first draws its Look (a cached config, then the server's): load it then
  const isKnown = () => !!lookId && ids.has(lookId);
  const known = useSyncExternalStore(watchIds, isKnown, isKnown);
  useEffect(() => {
    if (!lookId || !known) return;
    let live = true;
    let off = () => {};
    // A result lands only while this is still the Look asked for, and with its CSS in the page (one shared load per pack).
    import("./pack-load")
      .then(async (m) => {
        const pack = await m.sharedPack(lookId);
        if (!live) return;
        if (pack) off = m.mountPackCss(pack);
        setLoaded({ id: lookId, pack });
      })
      .catch(() => live && setLoaded({ id: lookId }));
    return () => {
      live = false;
      off();
      // its CSS is out: a later switch back to this Look must not return the old result before the CSS is mounted again
      setLoaded((now) => (now?.id === lookId ? undefined : now));
    };
  }, [lookId, known]);
  return loaded?.id === lookId ? loaded?.pack : undefined;
}

/** A pack with a stage draws a page background of its own (the page keeps no `bg-background` under it). */
export const packBackground = (pack: Pack | undefined): boolean => !!pack?.stage?.layers.length;

/** The pack's page layers (`className` places them, as `PageBackground`'s; `overlayClassName` the overlay); nothing without a pack stage. */
export function PackStage({ pack, className, overlayClassName, page, links, zones, accent }: { pack: Pack | undefined; className?: string; overlayClassName?: string; page?: { width: number; height: number }; links?: StageViewProps["links"]; zones?: StageViewProps["zones"]; accent?: string }) {
  const View = pack?.Stage;
  return pack?.stage && View ? <View stage={pack.stage} packId={pack.id} base={pack.base} className={className} overlayClassName={overlayClassName} burnIn={pack.burnIn} page={page} connectors={pack.connectors} links={links} zones={zones} accent={accent} /> : null;
}

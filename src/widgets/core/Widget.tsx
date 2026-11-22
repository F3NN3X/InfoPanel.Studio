// The Widget shell every template renders into: measures itself, applies skin + surface + the standard
// look, picks the view.
import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { chromeVars, numGlowAttr, scopedCss, zoomFor, type DesignSizeSpec } from "@/components/widget-style";
import type { PackSlots } from "@/looks/pack";
import { PackDecor, frameClip } from "@/looks/pack-frame";
import { materialVars, resolveMaterial } from "@/looks/materials";
import { chromeOf } from "@/modules/standard-settings";
import type { ModuleSettings } from "@/modules/types";
import { DESIGN_SIZE, ROOMY_SCALE, RoomyCtx, heroPx, roomy, summaryShape, useBox, type Box } from "./layout";
import { accentVars } from "./tokens";
import { SkinCtx, resolveSurface, textVars } from "./theme";
import { bodyFlags, forcedTier, resolveAccent, shellPad, skinContext, untitled, withUserLook } from "./look";
import { ensureSkinFonts } from "./fonts";
import { CardFrame, CardLayer } from "./card-frame";
import { usePageLight } from "./page-mode";
import { CompactView, StudioView, SkinHeader } from "./views";
import type { Compact, ShellProps, Studio, Tier } from "./types";

/** What a template's layout callback receives: the inner content size plus the outer box. */
export interface LayoutBox extends Box {
  outerW: number;
  outerH: number;
  /** The content's zoom (the shell's and Size %): a size meant in screen px is this much smaller in the content's px. */
  zoom: number;
  /** The card wears a pack: a layout that sets a row in a face wider than Classic's lets it wrap (Classic's markup stays as it was). */
  packed: boolean;
}

export interface WidgetProps {
  title?: string;
  icon?: string;
  /** A stored icon (Material or `lib/widget-icons.ts` name) replacing the header icon. */
  iconOverride?: string;
  accent?: string;
  surface?: string;
  radius?: number;
  size?: Tier | "auto";
  showHeader?: boolean;
  right?: ReactNode;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode | ((box: LayoutBox) => ReactNode);
  bleed?: boolean;
  compact?: Compact | ((box: Box) => Compact | undefined);
  compactView?: "auto" | "off" | "on";
  skin?: string;
  graph?: string;
  meter?: string;
  variant?: "default" | "studio";
  studio?: Studio | ((box: Box) => Studio | undefined);
  /** The Look's T3 values (`src/looks/t3.ts`): the data-viz names it sets that differ from Classic's draw through `t3Tokens`. */
  t3?: Record<string, string | number>;
  /** A pack Look's ornament, tab band and icon set. */
  slots?: PackSlots;
  /** The pack Look the card wears (`data-look`: where the pack CSS is scoped). */
  packId?: string;
  /** The zone's resolved settings (`src/modules/standard-settings.ts`); absent = template behaviour. */
  look?: ModuleSettings;
  /** A full-bleed layer under the content (e.g. blurred cover art). */
  backdrop?: ReactNode;
  /**
   * The size the content is drawn for: a larger zone zooms it (up to 2.5×) on top of Size %. Default `DESIGN_SIZE`;
   * null for a widget that sizes itself to its zone (a bar, a web page).
   */
  design?: DesignSizeSpec | null;
  /** For a widget whose text sits in fixed-size controls (buttons, tiles, meters): a roomy box does not grow its type. */
  fixedType?: boolean;
}

type ShellInput = Partial<ShellProps> & { look?: ModuleSettings; iconOverride?: string };

/** The widget surface (its classes and box style), for a view that draws it on parts of its own instead of the whole zone. */
export const PaneCtx = createContext<{ className: string; style: CSSProperties }>({ className: "", style: {} });
export const usePane = () => useContext(PaneCtx);

export const shell = (p: ShellInput): Partial<WidgetProps> => ({
  accent: p.accent,
  surface: p.surface,
  radius: p.radius,
  size: p.size,
  showHeader: p.showHeader,
  className: p.className,
  style: p.style && typeof p.style === "object" ? p.style : undefined,
  title: p.title,
  compactView: p.compactView,
  skin: p.skin,
  graph: p.graph,
  meter: p.meter,
  t3: p.t3,
  slots: p.slots,
  packId: p.packId,
  variant: p.variant,
  look: p.look,
  iconOverride: p.iconOverride,
});

/** The theme's four type tokens at `scale` times their size. */
const typeVars = (scale: number): CSSProperties =>
  ({ "--text-micro": `calc(0.6875rem * ${scale})`, "--text-caption": `calc(0.75rem * ${scale})`, "--text-body": `calc(0.8125rem * ${scale})`, "--text-title": `calc(0.9375rem * ${scale})` }) as CSSProperties;

export function Widget({ title, icon, iconOverride, accent, surface, radius, size, showHeader = true, right, className = "", style, children, bleed, compact, compactView, skin = "default", graph, meter, variant, studio, look, t3, slots, packId, backdrop, design = DESIGN_SIZE, fixedType }: WidgetProps) {
  const chrome = useMemo(() => (look ? chromeOf(look) : undefined), [look]);
  // A zone past the design size zooms the content with it, and Size % on top; the tier and shape are taken from the zoomed size.
  const [ref, box, zoom] = useBox(forcedTier(look, size), (w, h) => zoomFor({ w, h }, design ?? undefined, chrome));
  // tier/shape come from the outer box; layouts get the inner content size (after padding + header)
  const cref = useRef<HTMLDivElement | null>(null);
  const [inner, setInner] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = cref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setInner({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => ensureSkinFonts(skin), [skin]);
  const scope = useId();
  const ctx = useMemo(() => skinContext(skin, { graph, meter, chrome, t3, slots, packed: !!packId }), [skin, graph, meter, chrome, t3, slots, packId]);
  const sk = ctx;
  const isStudio = variant === "studio";
  const surf = resolveSurface(look?.surface ? String(look.surface) : surface, skin, isStudio);
  // The theme's card on a light page draws the light status colours too (L56); a light card always does.
  const onLightPage = usePageLight(ref, surf.tone === "theme");
  // A pack Look that sets its own `ok` has the ok tone draw it (L58); Classic and the sample Looks keep the accent.
  const packOk = !!packId && !!chrome?.ok;
  const skinCtx = useMemo(() => {
    const shellStatus = surf.tone === "light" || onLightPage;
    return shellStatus || packOk ? { ...ctx, ...(shellStatus ? { shellStatus } : null), ...(packOk ? { packOk } : null) } : ctx;
  }, [ctx, surf.tone, onLightPage, packOk]);
  const heading = chrome?.label || title;
  const headIcon = iconOverride || chrome?.icon || icon;
  // Show title off hides the header and the title line of the summary views (`untitled`).
  const titled = chrome?.showTitle !== false;
  const user = { icon: iconOverride || chrome?.icon, label: chrome?.label };
  const sRaw = isStudio ? ((typeof studio === "function" ? studio(box) : studio) ?? (typeof compact === "function" ? compact({ ...box, shape: "tile" }) : compact) ?? { label: heading, value: "" }) : null;
  const sObj = sRaw && untitled(withUserLook(sRaw, user), titled);
  const form = isStudio ? null : summaryShape(compactView, box.shape, box.w, box.h);
  const cRaw = form ? (typeof compact === "function" ? compact({ ...box, shape: form }) : compact) : undefined;
  // tui frames the title on the border even over a summary view, so the summary's own copy of it would repeat it; the other skins draw no header over a summary.
  const framed = !!sk.boxed && showHeader && titled && !!heading;
  const cTitled = cRaw && untitled(withUserLook(cRaw, user), titled);
  const cObj = cTitled && framed && cTitled.label === heading ? { ...cTitled, label: "" } : cTitled;
  const useCompact = !!cObj;
  const tui = !!sk.boxed;
  // A Look's ornament or tab band keeps inside the padding, so the shell hands it the padding as `--wp-pad`.
  const decor = !!(ctx.ornament || ctx.tabBand || ctx.decor || sk.header === "box-legend");
  const pad = shellPad({ box, studio: isStudio, compact: useCompact, bleed, tui, decor, padding: chrome?.padding !== undefined ? Math.round((chrome.padding / zoom) * 100) / 100 : undefined });
  const header = !isStudio && showHeader && titled && heading && (tui || (!useCompact && box.size !== "xs"));
  const css = chrome?.customCss ? scopedCss(scope, chrome.customCss) : "";
  const background = chrome?.backgroundOn && chrome.background ? chrome.background : "";
  const mat = resolveMaterial(surf, chrome);
  const surfBox = mat.box;
  const clip = frameClip(ctx.decor?.frame);
  const big = roomy(box.w, box.h);
  const rootStyle = {
    // The look's Corner radius, else the theme's (Theme › Shape & spacing, `--radius`), like panels.
    borderRadius: chrome?.radius ?? radius ?? "var(--radius, 1rem)",
    fontFamily: ctx.font,
    ...materialVars(mat),
    // a pack frame that cuts or notches its corners clips the card's paint, over the material's own
    ...(clip ? { clipPath: clip } : null),
    ...(pad.pad !== undefined ? { "--wp-pad": `${pad.pad * zoom}px`, ...(zoom !== 1 ? { "--wp-zoom": zoom } : null) } : null),
    ...textVars(surf.tone, chrome),
    ...chromeVars(chrome),
    // Only the default accent darkens on a light card: an accent the user or the Look set is theirs (G1).
    ...accentVars(resolveAccent(chrome?.accent || accent, sk, surf.tone), chrome?.accent || accent ? undefined : surf.tone),
    color: "var(--w-fg)",
    ...(ctx.focusOutline ? { "--w-focus-outline": ctx.focusOutline } : null),
    ...(ctx.labelGlow ? { textShadow: "0 0 6px color-mix(in oklab, var(--w-accent) 55%, transparent)" } : null),
    // A roomy box (4x4) grows the body type: the theme's type tokens, so every text-micro / caption / body / title follows; and sets the hero size `Metric` reads.
    ...(big ? { ...(fixedType ? null : typeVars(ROOMY_SCALE)), "--w-hero": `${heroPx(box.w, box.h)}px` } : null),
    ...style,
  } as CSSProperties;
  return (
    <SkinCtx.Provider value={skinCtx}>
      <RoomyCtx.Provider value={big}>
      <PaneCtx.Provider value={{ className: mat.className, style: surfBox }}>
      <div ref={ref} style={rootStyle} data-part="card" data-look={packId} data-mat={mat.id} data-tone={mat.tone} data-mode={mat.tone === "light" ? "light" : undefined} data-mat-blur={mat.fallback ? "" : undefined} data-focus-outline={ctx.focusOutline ? "" : undefined} data-wp-scope={css ? scope : undefined} {...numGlowAttr(chrome)} data-wp-tier={box.size} data-wp-roomy={big ? "" : undefined} data-wp-shape={box.shape} data-wp-view={isStudio ? "studio" : useCompact ? "compact" : "body"} className={`relative flex h-full w-full min-w-0 flex-col overflow-hidden antialiased ${mat.className} ${className}`}>
        {css && <style>{css}</style>}
        {background && (
          <>
            <img src={background} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0" style={{ background: mat.scrim }} />
          </>
        )}
        {backdrop}
        {ctx.frame && <CardFrame kind={ctx.frame} fill={ctx.borderFill} />}
        {decor && (
          <>
            {ctx.ornament && <CardLayer part="ornament" Slot={ctx.ornament} />}
            {ctx.tabBand && <CardLayer part="tab-band" Slot={ctx.tabBand} />}
            {/* inside this fragment, so a card without pack decor keeps its children's places (and their useId values) */}
            {ctx.decor && <PackDecor decor={ctx.decor} pad={pad.pad === undefined ? undefined : pad.pad * zoom} />}
          </>
        )}
        <div className={`relative flex min-h-0 min-w-0 flex-1 flex-col ${pad.className}`} style={{ ...pad.style, ...(zoom !== 1 ? { zoom } : null) }}>
          {header && <SkinHeader kind={sk.header} title={heading} icon={headIcon} right={useCompact ? undefined : right} bleed={bleed} bg={mat.patch} w={box.w} />}
          <div ref={cref} data-wp-body="" {...bodyFlags(chrome)} className="relative min-h-0 flex-1">
            {isStudio ? (
              <StudioView c={sObj!} w={box.w} h={box.h} icon={headIcon} />
            ) : useCompact ? (
              <CompactView c={cObj!} shape={form ?? box.shape} w={box.w} h={box.h} icon={headIcon} />
            ) : typeof children === "function" ? (
              children({ ...box, w: inner.w || box.w, h: inner.h || box.h, outerW: box.w, outerH: box.h, zoom, packed: !!packId })
            ) : (
              children
            )}
          </div>
        </div>
      </div>
      </PaneCtx.Provider>
      </RoomyCtx.Provider>
    </SkinCtx.Provider>
  );
}

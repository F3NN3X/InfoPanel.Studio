// The Widget shell every template renders into: measures itself, applies skin + surface + the standard
// look, picks the view.
import { createContext, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { chromeVars, numGlowAttr, scopedCss, zoomFor, type DesignSizeSpec } from "@/components/widget-style";
import { chromeOf } from "@/modules/standard-settings";
import type { ModuleSettings } from "@/modules/types";
import { DESIGN_SIZE, summaryShape, useBox, type Box } from "./layout";
import { mix } from "./tokens";
import { SKINS, SkinCtx, resolveSurface, textVars } from "./theme";
import { bodyFlags, forcedTier, lookBox, patchBackground, resolveAccent, scrimFor, shellPad, skinContext, untitled, withUserLook } from "./look";
import { ensureSkinFonts } from "./fonts";
import { CompactView, StudioView, SkinHeader } from "./views";
import type { Compact, ShellProps, Studio, Tier } from "./types";

/** What a template's layout callback receives: the inner content size plus the outer box. */
export interface LayoutBox extends Box {
  outerW: number;
  outerH: number;
  /** The content's zoom (the shell's and Size %): a size meant in screen px is this much smaller in the content's px. */
  zoom: number;
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
  /** The zone's resolved settings (`src/modules/standard-settings.ts`); absent = template behaviour. */
  look?: ModuleSettings;
  /** A full-bleed layer under the content (e.g. blurred cover art). */
  backdrop?: ReactNode;
  /**
   * The size the content is drawn for: a larger zone zooms it (up to 2.5×) on top of Size %. Default `DESIGN_SIZE`;
   * null for a widget that sizes itself to its zone (a bar, a web page).
   */
  design?: DesignSizeSpec | null;
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
  variant: p.variant,
  look: p.look,
  iconOverride: p.iconOverride,
});

const HUD_CORNERS = ["left-1.5 top-1.5 border-l border-t", "right-1.5 top-1.5 border-r border-t", "left-1.5 bottom-1.5 border-l border-b", "right-1.5 bottom-1.5 border-r border-b"];

export function Widget({ title, icon, iconOverride, accent, surface, radius, size, showHeader = true, right, className = "", style, children, bleed, compact, compactView, skin = "default", graph, meter, variant, studio, look, backdrop, design = DESIGN_SIZE }: WidgetProps) {
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
  const sk = SKINS[skin] ?? SKINS.default;
  const ctx = useMemo(() => skinContext(skin, { graph, meter, chrome }), [skin, graph, meter, chrome]);
  const isStudio = variant === "studio";
  const surf = resolveSurface(look?.surface ? String(look.surface) : surface, skin, isStudio);
  const heading = chrome?.label || title;
  const headIcon = iconOverride || chrome?.icon || icon;
  // Show title off hides the header and the title line of the summary views (`untitled`).
  const titled = chrome?.showTitle !== false;
  const user = { icon: iconOverride || chrome?.icon, label: chrome?.label };
  const sRaw = isStudio ? ((typeof studio === "function" ? studio(box) : studio) ?? (typeof compact === "function" ? compact({ ...box, shape: "tile" }) : compact) ?? { label: heading, value: "" }) : null;
  const sObj = sRaw && untitled(withUserLook(sRaw, user), titled);
  const form = isStudio ? null : summaryShape(compactView, box.shape, box.w, box.h);
  const cRaw = form ? (typeof compact === "function" ? compact({ ...box, shape: form }) : compact) : undefined;
  const cObj = cRaw && untitled(withUserLook(cRaw, user), titled);
  const useCompact = !!cObj;
  const tui = skin === "tui";
  const pad = shellPad({ box, studio: isStudio, compact: useCompact, bleed, tui, padding: chrome?.padding !== undefined ? Math.round((chrome.padding / zoom) * 100) / 100 : undefined });
  const header = !isStudio && showHeader && titled && heading && (tui || (!useCompact && box.size !== "xs"));
  const css = chrome?.customCss ? scopedCss(scope, chrome.customCss) : "";
  const background = chrome?.backgroundOn && chrome.background ? chrome.background : "";
  const surfBox = lookBox(surf, chrome);
  const rootStyle = {
    // The look's Corner radius, else the theme's (Theme › Shape & spacing, `--radius`), like panels.
    borderRadius: chrome?.radius ?? radius ?? "var(--radius, 1rem)",
    fontFamily: ctx.font,
    ...surfBox,
    ...textVars(surf.tone, chrome),
    ...chromeVars(chrome),
    "--accent": resolveAccent(chrome?.accent || accent, sk, surf.tone),
    color: "var(--w-fg)",
    ...style,
  } as CSSProperties;
  return (
    <SkinCtx.Provider value={ctx}>
      <PaneCtx.Provider value={{ className: surf.c, style: surfBox }}>
      <div ref={ref} style={rootStyle} data-wp-scope={css ? scope : undefined} {...numGlowAttr(chrome)} data-wp-tier={box.size} data-wp-shape={box.shape} data-wp-view={isStudio ? "studio" : useCompact ? "compact" : "body"} className={`relative flex h-full w-full min-w-0 flex-col overflow-hidden antialiased ${surf.c} ${className}`}>
        {css && <style>{css}</style>}
        {background && (
          <>
            <img src={background} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0" style={{ background: scrimFor(surf.tone) }} />
          </>
        )}
        {backdrop}
        {tui && <div className="pointer-events-none absolute inset-[5px] rounded-[4px] border" style={{ borderColor: mix(45, "#3f3f46") }} />}
        {skin === "hud" && HUD_CORNERS.map((c) => <span key={c} className={`pointer-events-none absolute h-2.5 w-2.5 ${c}`} style={{ borderColor: "var(--accent)" }} />)}
        <div className={`relative flex min-h-0 min-w-0 flex-1 flex-col ${pad.className}`} style={{ ...pad.style, ...(zoom !== 1 ? { zoom } : null) }}>
          {header && <SkinHeader kind={sk.header} title={heading} icon={headIcon} right={useCompact ? undefined : right} bleed={bleed} bg={patchBackground(surfBox.background, surf.tone)} />}
          <div ref={cref} data-wp-body="" {...bodyFlags(chrome)} className="relative min-h-0 flex-1">
            {isStudio ? (
              <StudioView c={sObj!} w={box.w} h={box.h} icon={headIcon} />
            ) : useCompact ? (
              <CompactView c={cObj!} shape={form ?? box.shape} w={box.w} h={box.h} icon={headIcon} />
            ) : typeof children === "function" ? (
              children({ ...box, w: inner.w || box.w, h: inner.h || box.h, outerW: box.w, outerH: box.h, zoom })
            ) : (
              children
            )}
          </div>
        </div>
      </div>
      </PaneCtx.Provider>
    </SkinCtx.Provider>
  );
}

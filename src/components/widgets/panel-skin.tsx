import { createContext, useContext, useEffect, useMemo, type CSSProperties, type ReactNode } from "react";
import type { ModernChrome } from "@/components/modern-chrome";
import { ws } from "@/components/widget-style";
import type { ModuleSettings } from "@/modules/types";
import { ensureSkinFonts } from "@/widgets/core/fonts";
import { resolveAccent, skinContext } from "@/widgets/core/look";
import { SKINS, SkinCtx, numFont } from "@/widgets/core/theme";
import type { SkinContext } from "@/widgets/core/types";

/** The panel's resolved skin (null = `auto`: the widgets render as they always did). */
const PanelSkinCtx = createContext<SkinContext | null>(null);
export const usePanelSkin = (): SkinContext | null => useContext(PanelSkinCtx);

/** The panel look's skin name; unset and `auto` both mean none. */
export const panelSkinOf = (cfg: ModuleSettings): string | undefined => {
  const skin = String(cfg.skin ?? "auto");
  return skin === "auto" ? undefined : skin;
};

/**
 * The colour a panel's widgets draw in when they have none of their own: `--wp-accent`, which the panel sets to its
 * resolved accent (`panelAccent`); outside a panel (an InfoPanel element) the theme's primary. Never the theme's
 * `--accent`: that token is a dark hover surface, not a colour to draw with.
 */
export const PANEL_ACCENT = "var(--wp-accent, hsl(var(--primary)))";

/** A panel's accent, resolved as a core widget's is: the look's accent, else the skin's, else the default. */
export const panelAccent = (accent: string | undefined, skin: string | undefined): string => resolveAccent(accent || undefined, (skin && SKINS[skin]) || {});

/**
 * The core text and track variables the skin primitives read, mapped onto the
 * panel's theme tokens (the panel is not a core `Widget` shell).
 */
export const PANEL_SKIN_VARS = {
  "--w-fg": "hsl(var(--foreground))",
  "--w-muted": "hsl(var(--muted-foreground))",
  "--w-faint": "hsl(var(--muted-foreground))",
  "--w-track": "hsl(var(--foreground) / .1)",
} as CSSProperties;

/** Numerals in the skin's font, weight, stretch and glow (the weight falls back to the look's). */
export const panelNum = (sk: SkinContext | null, weight: number): CSSProperties =>
  sk ? { ...numFont(sk), fontWeight: sk.numWeight ?? ws.weight(weight) } : { fontWeight: ws.weight(weight) };

interface PanelSkinProps {
  skin?: string;
  graph?: string;
  meter?: string;
  chrome: ModernChrome;
  children: ReactNode;
}

/** Provides the core skin context to a panel's widgets; with no skin it renders its children untouched. */
export function PanelSkin({ skin, graph, meter, chrome, children }: PanelSkinProps) {
  const ctx = useMemo(() => (skin ? skinContext(skin, { graph, meter, chrome }) : null), [skin, graph, meter, chrome]);
  useEffect(() => {
    if (skin) ensureSkinFonts(skin);
  }, [skin]);
  if (!ctx) return <>{children}</>;
  return (
    <SkinCtx.Provider value={ctx}>
      <PanelSkinCtx.Provider value={ctx}>{children}</PanelSkinCtx.Provider>
    </SkinCtx.Provider>
  );
}

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { pageSkinOf } from "@/components/island/island-look";
import { GeneralProvider } from "@/hooks/use-general";
import { PerformanceProvider } from "@/hooks/use-performance";
import { resolveGeneral } from "@/lib/general";
import type { Appearance } from "@/lib/style-resolve";
import { LOOK_IDS, loadLook } from "@/looks";
import { resolveVariants, type Look, type ResolvedVariant } from "@/looks/look";
import { PACK_IDS, PackStage, packBackground, usePack, type Pack } from "@/looks/pack";
import { PackScript } from "@/looks/pack-script/mount";
import type { QaFx } from "./params";

/**
 * The Look the QA page wears as a screen wears it, through the kiosk's own parts: the Look and its variant on the screen's theme
 * level (`Appearance`, resolved per widget by `placementContent` as a kiosk zone's is), the pack's stage and effect script on the
 * page (`PackStage`, `PackScript`, as App.tsx mounts them) and the screen's effects level through the General and Performance
 * providers. So a widget here draws what it draws on a kiosk wearing that Look: tokens, pack CSS, frames, layouts, treatments,
 * card style, fonts and motion.
 */

export interface QaTheme {
  /** The screen level the widgets resolve under; unset: no Look worn (the page's own settings only). */
  appearance?: Appearance;
  pack?: Pack;
  variants: readonly ResolvedVariant[];
  /** The worn Look's name, once it has loaded (the top bar's Look button). */
  name?: string;
}

/** The screen theme level a Look and one of its variants set, as the Theme page writes them: the Look's id, then the variant's values. */
export function lookLevel(look: string, variant?: ResolvedVariant): Appearance | undefined {
  if (!look) return undefined;
  return { profile: { values: { lookId: look, ...variant?.values } } };
}

/** The Looks the picker offers: every built-in one, then the packs registered since (an imported pack). */
export const qaLookIds = (): string[] => [...new Set([...LOOK_IDS, ...PACK_IDS])];

/** The worn Look's pack (none for Classic, a skin or a sample Look) and its variants, and the level the widgets resolve under. */
export function useQaTheme(look: string, variantId: string): QaTheme {
  const pack = usePack(look || undefined);
  const [loaded, setLoaded] = useState<Look>();
  useEffect(() => {
    let live = true;
    setLoaded(undefined);
    if (look) void loadLook(look).then((l) => live && setLoaded(l));
    return () => {
      live = false;
    };
  }, [look]);
  // a pack's own look.json carries its variants; a sample Look's are on its data
  const source = pack?.look ?? loaded;
  const variants = useMemo(() => (source ? resolveVariants(source) : []), [source]);
  const variant = variants.find((v) => v.id === variantId);
  const appearance = useMemo(() => lookLevel(look, variant), [look, variant]);
  return { appearance, pack, variants, name: source?.name };
}

/** The page under a worn Look: its effects level, the pack's page layers and overlay, and its script (unless `script` is off). */
export function QaScreen({ theme, fx, script, children }: { theme: QaTheme; fx: QaFx; script: boolean; children: ReactNode }) {
  const general = useMemo(() => resolveGeneral({}, fx ? { performance: { fx } } : undefined), [fx]);
  const skin = useMemo(() => pageSkinOf(theme.appearance), [theme.appearance]);
  const page = { width: window.innerWidth, height: window.innerHeight };
  // no Look and no level: the page as it always was, outside the providers
  if (!theme.appearance && !fx) return children;
  return (
    <GeneralProvider value={general}>
      <PerformanceProvider value={undefined}>
        <PackStage pack={theme.pack} page={page} className="fixed inset-0 -z-10" overlayClassName="pointer-events-none fixed inset-0 z-10" accent={skin.accent} motionEffects={skin.motionEffects} />
        {script && <PackScript pack={theme.pack} className="pointer-events-none fixed inset-0 z-10" accent={skin.accent} />}
        {children}
      </PerformanceProvider>
    </GeneralProvider>
  );
}

/** Whether the worn pack draws the page's background (the page then keeps none of its own, as the kiosk's). */
export const wornBackground = (theme: QaTheme): boolean => packBackground(theme.pack);

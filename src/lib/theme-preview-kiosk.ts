import { useEffect, useMemo, useState } from "react";
import type { ControlState } from "./control";
import type { DashboardConfig } from "./layout";
import type { ThemePreview } from "./theme-preview";

type PreviewModule = typeof import("./theme-preview");

/** The longest a kiosk keeps drawing an applied preview that went while the saved config had not reached it. */
export const APPLIED_HOLD_MS = 15_000;

/**
 * Kiosk only: the config to draw while a studio previews a theme on the kiosks (the control channel's `themePreview`),
 * else `config` itself. The apply rule loads in its own chunk on the first preview; one that fails to parse or apply is
 * not drawn. The saved config is never changed.
 *
 * A preview the studio applied stays on the channel through the save that carries its theme; should it go before this
 * kiosk has pulled that save, it is held (decided while rendering, so no frame shows the old theme) until the config here
 * wears it, or APPLIED_HOLD_MS. A cancelled one goes at once.
 */
export function useKioskThemePreview(config: DashboardConfig, preview: ControlState["themePreview"]): DashboardConfig {
  const [mod, setMod] = useState<PreviewModule>();
  useEffect(() => {
    if (preview && !mod) void import("./theme-preview").then(setMod, () => {});
  }, [preview, mod]);
  const parsed = useMemo(() => (mod && preview ? mod.parsePreview(preview) : undefined), [mod, preview]);

  // The preview last drawn, and the applied one held after it went (adjusted while rendering).
  const [last, setLast] = useState<ThemePreview>();
  const [held, setHeld] = useState<ThemePreview>();
  if (parsed !== last) {
    setLast(parsed);
    setHeld(!parsed && last?.applied && mod && !mod.wears(config, last) ? last : undefined);
  }
  const holding = held !== undefined && mod !== undefined && !mod.wears(config, held);
  // Once the config here wears it the hold is over for good, whatever the config does next; else it ends with the time.
  useEffect(() => {
    if (!held) return;
    if (!holding) return setHeld(undefined);
    const t = setTimeout(() => setHeld(undefined), APPLIED_HOLD_MS);
    return () => clearTimeout(t);
  }, [held, holding]);

  const shown = parsed ?? (holding ? held : undefined);
  return useMemo(() => {
    if (!mod || !shown) return config;
    try {
      return mod.applyPreview(config, shown);
    } catch {
      return config;
    }
  }, [mod, shown, config]);
}

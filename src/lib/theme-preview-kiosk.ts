import { useEffect, useState } from "react";
import type { ControlState } from "./control";
import type { DashboardConfig } from "./layout";

/**
 * Kiosk only: the config to draw while a studio previews a theme on the kiosks (the control channel's `themePreview`),
 * else `config` itself. The apply rule loads in its own chunk on the first preview; one that fails to parse or apply is
 * not drawn. The saved config is never changed.
 */
export function useKioskThemePreview(config: DashboardConfig, preview: ControlState["themePreview"]): DashboardConfig {
  const [shown, setShown] = useState<{ from: DashboardConfig; config: DashboardConfig }>();
  useEffect(() => {
    if (!preview) return setShown(undefined);
    let live = true;
    void import("./theme-preview").then(
      (m) => {
        if (!live) return;
        const p = m.parsePreview(preview);
        try {
          setShown(p ? { from: config, config: m.applyPreview(config, p) } : undefined);
        } catch {
          setShown(undefined);
        }
      },
      () => live && setShown(undefined)
    );
    return () => {
      live = false;
    };
  }, [config, preview]);
  // A preview worked out for an older config is not drawn over a newer one.
  return shown && shown.from === config ? shown.config : config;
}

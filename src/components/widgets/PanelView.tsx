import type { CSSProperties } from "react";
import { withHwinfoAliases } from "@/lib/hwinfo-aliases";
import type { PanelDef } from "@/lib/layout";
import type { SectionFlags } from "@/lib/theme-model";
import type { ModuleSettings, SensorMap } from "@/modules/types";
import { chromeOf } from "@/modules/standard-settings";
import { cn } from "@/lib/utils";
import { ModernChrome } from "@/components/modern-chrome";
import { flow, surfaceBox, ws } from "@/components/widget-style";
import {
  enforcedPanel,
  panelCardStyle,
  panelSurfaceColors,
  panelSurfaceOf,
  panelVars,
} from "./panel-layout";
import { resolvedPanel, tonedPanel } from "./panel-items";
import { PanelOverlay } from "./panel-overlay";
import { PANEL_SKIN_VARS, PanelSkin, panelAccent, panelSkinOf } from "./panel-skin";
import type { PanelSelection } from "./panel-parts";
import { PanelStack } from "./panel-stack";

interface PanelViewProps {
  panel: PanelDef;
  /**
   * The placement's resolved settings (legacy look, the theme, own — see
   * `resolveStyle`): the panel's look.
   */
  settings?: ModuleSettings;
  /**
   * The profile locks the Colors section: the widgets' own colors give way
   * to the resolved accent and text colors (`enforcedPanel`).
   */
  enforced?: boolean;
  /** The profile theme's locks: a locked section's widgets follow the panel (SPEC §8). */
  locks?: SectionFlags;
  sensors: SensorMap;
  /** Show a hint for empty panels (studio only). */
  studio?: boolean;
  /**
   * The studio's widget selection while this panel's zone is selected:
   * outlines the selected widget (and others on hover). Never in the kiosk.
   */
  selection?: PanelSelection;
}

/** Two CSS sources as one ("" when both are empty). */
const joinCss = (...parts: (string | undefined)[]) => parts.filter((p) => p?.trim()).join("\n");

/**
 * Renders a custom panel (group): an ordered list of widgets in a shared
 * background/accent scope. This is the "layer and group" unit — a panel is
 * placed on the canvas, its widgets are the individually bindable pieces.
 *
 * The look comes from the standard style settings like every widget
 * (`ModernChrome`: Size %, colors, font, custom CSS, background image;
 * the card via `surfaceBox`); the arrangement from the PanelDef.
 *
 * Each widget follows the panel's look section by section (`panel-item.ts`):
 * a following Typography / Color / Units & format shows the panel's, and a
 * stat, value, bar or gauge past its thresholds takes the warning /
 * critical colour.
 *
 * CSS hooks: `.wp-panel[data-panel-layout][data-panel-id]` (the card),
 * `.wp-panel-title`, `.wp-panel-bg`, `.wp-panel-scrim`, `.wp-band[data-band]`
 * and `.wp-widget.wp-widget--{kind}[data-widget-id][data-widget-kind]`.
 */
export function PanelView({ panel: own, settings, sensors: raw, studio, selection, enforced, locks }: PanelViewProps) {
  // HWiNFO readings also under the LibreHardwareMonitor keys (`hwinfo-aliases.ts`), as the widgets read them
  const sensors = withHwinfoAliases(raw);
  const cfg = settings ?? {};
  const title = String(cfg.label ?? (own.titleVisible ? own.title : ""));
  const surface = panelSurfaceOf(cfg.surface ?? own.background);
  const chrome = chromeOf({ accent: own.accent ?? "", ...cfg });
  const items = resolvedPanel(own, cfg, locks);
  const panel = tonedPanel(enforced ? enforcedPanel(items, chrome.accent || undefined) : items, cfg, sensors, locks);
  const overlay = panel.layout === "overlay";
  const hug = panel.fit === "hug";
  const layout = overlay ? "overlay" : panel.layout === "grid" ? "grid" : "stack";

  const skin = panelSkinOf(cfg);

  const look: CSSProperties = overlay
    ? { borderRadius: ws.radius("var(--radius)") }
    : panelCardStyle(surface, chrome);

  return (
    <PanelSkin skin={skin} graph={String(cfg.graph ?? "auto")} meter={String(cfg.meter ?? "auto")} chrome={chrome}>
      <ModernChrome
        // The panel draws its own title; its CSS joins the panel's own (presets).
        chrome={{ ...chrome, label: "", icon: "", customCss: joinCss(chrome.customCss, panel.css) }}
      >
        <div
          className="flex h-full w-full"
          // Hug: the panel keeps its content size, placed by the zone's alignment.
          style={hug ? flow("row", { x: "start", y: "start" }) : undefined}
        >
          <div
            className={cn(
              "wp-panel relative overflow-hidden",
              hug ? "max-h-full max-w-full" : "h-full w-full",
              !overlay && "flex flex-col gap-3"
            )}
            data-panel-layout={layout}
            data-panel-id={panel.id}
            // The theme tokens are re-scoped on the ModernChrome root (`tokenScope`).
            style={{ "--wp-accent": panelAccent(chrome.accent, skin), ...panelVars(panel), ...(skin ? PANEL_SKIN_VARS : null), ...look } as CSSProperties}
          >
            {overlay ? (
              <PanelOverlay
                panel={panel}
                sensors={sensors}
                title={title}
                icon={chrome.icon}
                edge={String(surfaceBox(panelSurfaceColors(surface, chrome), chrome).boxShadow)}
                selection={selection}
                studio={studio}
              />
            ) : (
              <PanelStack
                panel={panel}
                sensors={sensors}
                title={title}
                icon={chrome.icon}
                studio={studio}
                selection={selection}
              />
            )}
          </div>
        </div>
      </ModernChrome>
    </PanelSkin>
  );
}

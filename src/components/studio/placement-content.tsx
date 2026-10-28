import { lazy, Suspense, useMemo, type CSSProperties, type ReactNode } from "react";
import { OtherSensors } from "@/modules/other-sensors";
import { isClaimed, moduleReads, modules } from "@/modules";
import { chromeOf } from "@/modules/standard-settings";
import { effectiveSettings, type ModuleSettings, type SensorMap } from "@/modules/types";
import { tokenScope } from "@/components/widget-style";
import type { SensorValue } from "@/hooks/useSensors";
import { useSensors } from "@/hooks/useSensors";
import { PanelView } from "@/components/widgets/PanelView";
import type { PanelSelection } from "@/components/widgets/panel-parts";
import { YR_FORECAST_KEY, YR_FORECAST_PREFIX } from "@/lib/sensors";
import { CARDS_ID, BLANK_MODULE, CANVAS_ID, NOT_LOADED, PANEL_ID, canvasTitle, type Placement } from "@/lib/layout";
import { storedCanvasKeys, storedCanvasWidgets, type StoredWidgetRef } from "@/lib/infopanel/canvas-keys";
import { normalizePanelPlacement, panelLegacyLook, panelOwnSettings } from "@/lib/panel-model";
import { lockedIn, resolveWith, type Appearance } from "@/lib/style-resolve";
import { safeRender } from "@/components/zone-error-boundary";

const moduleById = new Map(modules.map((m) => [m.id, m]));
// The InfoPanel renderer loads only when a canvas zone is drawn.
const CanvasZone = lazy(() => import("@/components/infopanel/CanvasZone"));

/** A widget module this build doesn't know (Edit v3 SPEC §15): a grey box; the zone stays stored as it is. */
export function UnavailableWidget() {
  return (
    <div className="grid h-full w-full place-items-center rounded-lg border border-dashed border-[#55555e] bg-[#2a2a30]/70 p-2 text-center text-[11px] text-[#a1a1aa]">
      Widget not available in this version
    </div>
  );
}

export interface PlacementRender {
  content: ReactNode;
  hasData: boolean;
  title: string;
  /**
   * The theme tokens re-scoped to the zone's resolved colors, for the zone
   * frame around the content (its header and card read them too).
   */
  scope?: CSSProperties;
}

/**
 * The sensor keys (as prefixes) a placement renders from: a module's
 * prefixes, a panel's bound keys, `null` for the "cards" catch-all (every
 * sensor), `[]` for none.
 */
export function placementPrefixes(p: Placement): string[] | null {
  if (p.module === BLANK_MODULE) return [];
  if (p.module === CANVAS_ID) return mergePrefixes([storedCanvasKeys(p.canvas), ...storedCanvasWidgets(p.canvas).map((w) => placementPrefixes(widgetPlacement(w)))]);
  if (p.panel) {
    const keys = new Set<string>();
    for (const w of p.panel.widgets) {
      if (!w.visible) continue;
      for (const key of [w.sensor, w.subSensor]) {
        if (key) keys.add(key === YR_FORECAST_KEY ? YR_FORECAST_PREFIX : key);
      }
    }
    return [...keys].sort();
  }
  if (p.module === CARDS_ID) return null;
  const mod = moduleById.get(p.module);
  if (mod?.readsAll) return null;
  // The sensors a widget is bound to (a `sensor` setting) are read besides its own prefixes.
  const bound = (mod?.settings ?? []).filter((d) => d.type === "sensor").flatMap((d) => String(p.settings?.[d.key] ?? "").split(",").filter(Boolean));
  return mod ? [...moduleReads(mod), ...bound] : [];
}

/** Several placements' prefixes as one subscription: `null` (every sensor) when any reads all. */
export function mergePrefixes(lists: readonly (readonly string[] | null)[]): string[] | null {
  if (lists.some((l) => l === null)) return null;
  return [...new Set(lists.flatMap((l) => l ?? []))].sort();
}

/**
 * A Studio widget on a Free page (stored in its canvas, one-editor SPEC §3.3) as the zone it renders like: one cell,
 * its module, settings, look and panel. The kiosk, the editor and the export draw and read it through this.
 */
export function widgetPlacement(w: StoredWidgetRef & { design?: Placement["design"]; follow?: Placement["follow"] }, id = "widget"): Placement {
  const p: Placement = {
    id,
    module: w.module,
    colStart: 1,
    rowStart: 1,
    colSpan: 1,
    rowSpan: 1,
    visible: true,
    ...(w.settings ? { settings: w.settings as ModuleSettings } : {}),
    ...(w.design ? { design: w.design } : {}),
    ...(w.follow ? { follow: w.follow } : {}),
    ...(w.panel && Array.isArray(w.panel.widgets) ? { panel: w.panel as unknown as Placement["panel"] } : {}),
  };
  return normalizePanelPlacement(p);
}

/** Whether this build has the widget a Free page's item names (§11: an older or newer build's is shown greyed). */
export const knownWidget = (module: string): boolean => module === PANEL_ID || moduleById.has(module);

/** Tokens for the zone frame (`undefined` when nothing is re-scoped). */
function frameScope(settings: ModuleSettings | undefined): CSSProperties | undefined {
  const v = tokenScope(chromeOf(settings ?? {}));
  return Object.keys(v).length > 0 ? (v as CSSProperties) : undefined;
}

/**
 * Render the content of a placement (module or the "cards" catch-all grid).
 * Shared by the kiosk grid and the studio canvas. `appearance` is the
 * theme the placement's look resolves under (`resolveStyle`).
 */
export function placementContent(
  p: Placement,
  sensors: SensorMap,
  unclaimed: Array<[string, SensorValue]>,
  appearance?: Appearance,
  /** Rendering on the studio canvas (empty panels show a hint). */
  studio?: boolean,
  /** The studio's widget selection, for the selected panel zone only. */
  selection?: PanelSelection
): PlacementRender {
  if (p.module === BLANK_MODULE) {
    // A drawn, unfilled zone: nothing to render (the kiosk shows open
    // space, the studio shows the dashed zone chrome).
    return { content: null, hasData: false, title: "Blank space" };
  }
  if (p.module === CANVAS_ID) {
    // Drawn as InfoPanel draws it: the dashboard style does not reach the canvas.
    const title = canvasTitle(p) ?? "InfoPanel canvas";
    if (!p.canvas) {
      // Only its `canvasRef` (the store didn't hand it over): the studio says so; the kiosk draws nothing.
      if (!studio) return { content: null, hasData: false, title };
      return {
        content: (
          <div title={NOT_LOADED} className="grid h-full w-full place-items-center p-2 text-center text-[12px] text-ui-4">
            {NOT_LOADED}
          </div>
        ),
        hasData: true,
        title,
      };
    }
    return {
      content: (
        <Suspense fallback={null}>
          <CanvasZone canvas={p.canvas} sensors={sensors} appearance={appearance} />
        </Suspense>
      ),
      hasData: true,
      title,
    };
  }
  if (p.panel) {
    // A custom panel renders its own widgets; it "has data" when at least
    // one widget is visible (an empty panel is hidden in kiosk mode).
    const hasData = p.panel.widgets.some((w) => w.visible);
    // The legacy PanelDef look is the lowest layer, under the theme.
    const settings = resolveWith(appearance, panelOwnSettings(p), p.follow, panelLegacyLook(p));
    return {
      content: (
        <PanelView
          panel={p.panel}
          settings={settings}
          enforced={lockedIn(appearance, "colors")}
          locks={appearance?.profile?.locks}
          sensors={sensors}
          studio={studio}
          selection={selection}
        />
      ),
      hasData,
      title: p.panel.title,
      scope: frameScope(settings),
    };
  }
  if (p.module === CARDS_ID) {
    if (unclaimed.length === 0)
      return { content: null, hasData: false, title: "Other sensors" };
    const subCols = p.colSpan >= 8 ? 4 : p.colSpan >= 4 ? 3 : 2;
    const cfg = resolveWith(appearance, p.settings, p.follow) ?? {};
    return {
      hasData: true,
      title: "Other sensors",
      content: <OtherSensors unclaimed={unclaimed} settings={cfg} subCols={subCols} />,
      scope: frameScope(cfg),
    };
  }
  const mod = moduleById.get(p.module);
  // A widget this build doesn't have (a newer or older one saved it): kept as it is, drawn as a grey box.
  if (!mod) return { content: <UnavailableWidget />, hasData: true, title: p.module };
  const settings = resolveWith(appearance, p.settings, p.follow, undefined, mod.settings);
  const content = safeRender(mod.title, () => mod.render(sensors, settings));
  // Only the module's own keys (a stored color it has no option for stays inert).
  const cfg = effectiveSettings(mod, settings);
  return {
    content: content ?? null,
    hasData: content != null,
    title: mod.title,
    scope: frameScope(cfg),
  };
}

interface LivePlacementProps {
  placement: Placement;
  /** The theme (the app's clock, profile and page theme). */
  appearance?: Appearance;
  /** On the studio canvas (see `placementContent`). */
  studio?: boolean;
  /** The selected panel zone's widget selection (see `placementContent`). */
  selection?: PanelSelection;
  /** Wraps the rendered content (the zone frame). */
  children: (render: PlacementRender) => ReactNode;
}

/**
 * A placement wired to the sensor store: it subscribes to just the keys
 * it renders from, so a sensor change re-renders only the zones that show
 * it — not the whole grid.
 */
export function LivePlacement({ placement, appearance, studio, selection, children }: LivePlacementProps) {
  const prefixes = placementPrefixes(placement);
  const sensors = useSensors(prefixes);
  const isCards = placement.module === CARDS_ID;
  const unclaimed = useMemo(
    () => (isCards ? Object.entries(sensors).filter(([key]) => !isClaimed(key)) : []),
    [isCards, sensors]
  );
  return <>{children(placementContent(placement, sensors, unclaimed, appearance, studio, selection))}</>;
}

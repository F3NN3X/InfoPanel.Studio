import { lazy, Suspense, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { pageSkinOf } from "@/components/island/island-look";
import { PageBackground } from "@/components/page-background";
import { leadsPage, PinnedItems } from "@/components/pinned-layer";
import { posterBackground, resolveBackground } from "@/lib/appearance";
import { fontStack, resolveFont } from "@/lib/general";
import { SCROLL_ROW_H, type DashboardConfig, type MonitorProfile, type Placement } from "@/lib/layout";
import { profileWithPage } from "@/lib/pages";
import { isEdgePin, isGridPin, pinnedOnPage, pinnedRoom } from "@/lib/pinned";
import { profileGap, profilePadding } from "@/lib/profile-grid";
import { appearanceOf } from "@/lib/style-resolve";
import { resolveTheme, themeMode, themeVars } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { connectorZones } from "@/looks/connector-zones";
import { PackStage, packBackground, usePack, type Pack } from "@/looks/pack";
import { PageSizeCtx } from "@/looks/pack-frame";
import { LivePlacement } from "./placement-content";
import { PlacementFrame } from "./placement-frame";

interface ProfilePageProps {
  profile: MonitorProfile;
  dashboard: DashboardConfig;
  /** The page to draw (default: the first). */
  pageId?: string;
  /** Drawn over a zone, inside its frame (Theme's preview: the edit badge on a widget that doesn't follow). */
  badge?: (placement: Placement) => ReactNode;
  /** Draw the worn theme pack's scenery and effects behind the widgets, as the kiosk does (Theme's preview and thumbnails). */
  stage?: boolean;
  /** A thumbnail: the scenery and overlay only, with no burn-in care (idle dim, pixel shift) and no glow or blur filters. */
  still?: boolean;
}

/** Widgets pinned in place (config v21): loaded only by a page that has one, as the kiosk does. */
const PinnedGrid = lazy(() => import("@/components/pinned-grid"));

/** The pack as a thumbnail draws it: the stage without what moves or filters, and with nothing that dims or shifts it. */
const stillPack = (pack: Pack): Pack => (pack.stage ? { ...pack, burnIn: "static-safe", stage: { ...pack.stage, effects: (pack.stage.effects ?? []).filter((e) => e.kind !== "glow" && e.kind !== "blur") } } : pack);

/**
 * A profile's page as the kiosk draws it (background, theme, style and the real widgets, canvas
 * zones included), at its design size. A video background shows its poster. Mounted offscreen to take
 * the profile's screenshot, and scaled down as Theme's live preview.
 */
export function ProfilePage({ profile, dashboard, pageId, badge, stage = false, still = false }: ProfilePageProps) {
  const view = useMemo(() => profileWithPage(profile, pageId), [profile, pageId]);
  const theme = resolveTheme(profile);
  const bg = resolveBackground(profile);
  const background = bg && (bg.type === "video" ? posterBackground(bg) : bg);
  const font = fontStack(resolveFont(profile));
  const fill = view.fit === "fill" && view.height > 0;
  const padding = profilePadding(view, true);
  const appearance = useMemo(() => appearanceOf(dashboard, view), [dashboard, view]);
  // Only a page that asks for the stage loads the pack (`usePack` of nothing loads nothing).
  const worn = usePack(stage ? pageSkinOf(appearance).lookId : undefined);
  const pack = useMemo(() => (worn && still ? stillPack(worn) : worn), [worn, still]);
  const linkZones = useMemo(() => (pack?.connectors ? connectorZones(view.placements, view) : undefined), [pack, view]);
  // The pinned layer (config v20/v21) as the kiosk draws it (`App.tsx`): the edge items take their room off the page's
  // padding, and the grid pins sit on the page grid's cells over its zones.
  const pinned = useMemo(() => pinnedOnPage(view.pinned, view.pageId, view.hidePinned), [view]);
  const room = pinnedRoom(pinned);
  const edgePins = pinned.filter(isEdgePin);
  const gridPins = pinned.filter(isGridPin);
  const mainRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const tracks = {
    gap: profileGap(view),
    gridTemplateColumns: `repeat(${view.cols}, minmax(0, 1fr))`,
    gridTemplateRows: fill ? `repeat(${view.rows}, minmax(0, 1fr))` : `repeat(${view.rows}, ${SCROLL_ROW_H}px)`,
  };
  return (
    <PageSizeCtx.Provider value={{ width: view.width, height: view.height }}>
    <div
      ref={mainRef}
      data-theme-scope=""
      data-mode={themeMode(theme.tokens)}
      className={cn("relative isolate overflow-hidden text-foreground [contain:layout]", !background && !packBackground(pack) && "bg-background")}
      style={
        {
          ...themeVars(theme.tokens, theme.radius),
          "--radius-lg": "var(--radius)",
          "--radius-md": "calc(var(--radius) - 2px)",
          "--radius-sm": "calc(var(--radius) - 4px)",
          width: view.width,
          height: view.height,
          paddingTop: padding + room.top,
          paddingRight: padding + room.right,
          paddingBottom: padding + room.bottom,
          paddingLeft: padding + room.left,
          fontFamily: font,
        } as CSSProperties
      }
    >
      {background && <PageBackground background={background} className="absolute inset-0 -z-10" />}
      <PackStage pack={pack} page={{ width: view.width, height: view.height }} className="absolute inset-0 -z-10" overlayClassName="absolute inset-0 z-10" zones={linkZones} accent={pageSkinOf(appearance).accent} motionEffects={pageSkinOf(appearance).motionEffects} />
      <PinnedItems all={pinned} items={edgePins.filter(leadsPage)} profile={view} appearance={appearance} padding={padding} />
      <div ref={gridRef} className={cn("grid", fill && "h-full")} style={tracks}>
        {view.placements
          .filter((p) => p.visible)
          .map((p) => (
            <LivePlacement key={p.id} placement={p} appearance={appearance}>
              {({ content, hasData, title, scope }) => (
                <PlacementFrame placement={p} profile={view} studio={false} hasData={hasData} title={title} scope={scope}>
                  {content}
                  {badge?.(p)}
                </PlacementFrame>
              )}
            </LivePlacement>
          ))}
      </div>
      {gridPins.length > 0 && (
        <Suspense fallback={null}>
          <PinnedGrid items={gridPins} profile={view} appearance={appearance} grid={gridRef} main={mainRef} tracks={tracks} />
        </Suspense>
      )}
      <PinnedItems all={pinned} items={edgePins.filter((it) => !leadsPage(it))} profile={view} appearance={appearance} padding={padding} />
    </div>
    </PageSizeCtx.Provider>
  );
}

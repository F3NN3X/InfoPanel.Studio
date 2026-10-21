import { useMemo, type CSSProperties, type ReactNode } from "react";
import { PageBackground } from "@/components/page-background";
import { posterBackground, resolveBackground } from "@/lib/appearance";
import { fontStack, resolveFont } from "@/lib/general";
import { SCROLL_ROW_H, type DashboardConfig, type MonitorProfile, type Placement } from "@/lib/layout";
import { profileWithPage } from "@/lib/pages";
import { profileGap, profilePadding } from "@/lib/profile-grid";
import { appearanceOf } from "@/lib/style-resolve";
import { resolveTheme, themeVars } from "@/lib/theme";
import { useGeneral } from "@/hooks/use-general";
import { cn } from "@/lib/utils";
import { LivePlacement } from "./placement-content";
import { PlacementFrame } from "./placement-frame";

interface ProfilePageProps {
  profile: MonitorProfile;
  dashboard: DashboardConfig;
  /** The page to draw (default: the first). */
  pageId?: string;
  /** Drawn over a zone, inside its frame (Theme's preview: the edit badge on a widget that doesn't follow). */
  badge?: (placement: Placement) => ReactNode;
}

/**
 * A profile's page as the kiosk draws it (background, theme, style and the real widgets, canvas
 * zones included), at its design size. A video background shows its poster. Mounted offscreen to take
 * the profile's screenshot, and scaled down as Theme's live preview.
 */
export function ProfilePage({ profile, dashboard, pageId, badge }: ProfilePageProps) {
  const view = useMemo(() => profileWithPage(profile, pageId), [profile, pageId]);
  const theme = resolveTheme(dashboard, profile);
  const bg = resolveBackground(dashboard, profile);
  const background = bg && (bg.type === "video" ? posterBackground(bg) : bg);
  const font = fontStack(resolveFont(useGeneral(), profile));
  const fill = view.fit === "fill" && view.height > 0;
  const padding = profilePadding(view, true);
  const appearance = useMemo(() => appearanceOf(dashboard, view), [dashboard, view]);
  return (
    <div
      data-theme-scope=""
      className={cn("relative isolate overflow-hidden text-foreground", !background && "bg-background")}
      style={
        {
          ...themeVars(theme.tokens, theme.radius),
          "--radius-lg": "var(--radius)",
          "--radius-md": "calc(var(--radius) - 2px)",
          "--radius-sm": "calc(var(--radius) - 4px)",
          width: view.width,
          height: view.height,
          padding,
          fontFamily: font,
        } as CSSProperties
      }
    >
      {background && <PageBackground background={background} className="absolute inset-0 -z-10" />}
      <div
        className={cn("grid", fill && "h-full")}
        style={{
          gap: profileGap(view),
          gridTemplateColumns: `repeat(${view.cols}, minmax(0, 1fr))`,
          gridTemplateRows: fill ? `repeat(${view.rows}, minmax(0, 1fr))` : `repeat(${view.rows}, ${SCROLL_ROW_H}px)`,
        }}
      >
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
    </div>
  );
}

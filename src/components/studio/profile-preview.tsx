import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { PageBackground } from "@/components/page-background";
import { posterBackground, resolveBackground } from "@/lib/appearance";
import { fontStack } from "@/lib/general";
import { SCROLL_ROW_H, type DashboardConfig, type MonitorProfile } from "@/lib/layout";
import { profileWithPage } from "@/lib/pages";
import { profileGap, profilePadding } from "@/lib/profile-grid";
import { appearanceOf } from "@/lib/style-resolve";
import { resolveTheme, themeVars } from "@/lib/theme";
import { useGeneral } from "@/hooks/use-general";
import { PreviewProvider } from "@/hooks/use-preview";
import { cn } from "@/lib/utils";
import { fitPage } from "./profile-preview-model";
import { LivePlacement } from "./placement-content";
import { PlacementFrame } from "./placement-frame";

interface ProfilePreviewProps {
  profile: MonitorProfile;
  /** The dashboard: what the profile inherits (background, theme, style). */
  dashboard: DashboardConfig;
  /** The box in px; without a width the box fills its parent. */
  width?: number;
  height: number;
  /** Outline in the accent colour (the profile being edited). */
  active?: boolean;
  className?: string;
}

/** The box's width and whether it is on screen. Without IntersectionObserver (tests) it counts as visible. */
function useBox(fixedWidth: number | undefined) {
  const ref = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(fixedWidth ?? 0);
  const [visible, setVisible] = useState(typeof IntersectionObserver === "undefined");
  // Already on screen at mount: drawn on the first paint, not when the observer first reports.
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (r && r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth) setVisible(true);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const resize =
      fixedWidth === undefined && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
        : null;
    resize?.observe(el);
    const seen =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting))
        : null;
    seen?.observe(el);
    return () => {
      resize?.disconnect();
      seen?.disconnect();
    };
  }, [fixedWidth]);
  return { ref, width: fixedWidth ?? width, visible };
}

/** A value that follows `value` once it has held still for `ms`: a drag redraws the page when it settles. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/** The same page: the profile object and the dashboard fields it inherits. */
const samePage = (a: { profile: MonitorProfile; dashboard: DashboardConfig }, b: typeof a) =>
  a.profile === b.profile &&
  a.dashboard.background === b.dashboard.background &&
  a.dashboard.theme === b.dashboard.theme &&
  a.dashboard.radius === b.dashboard.radius &&
  a.dashboard.style === b.dashboard.style;

/**
 * The profile's first page as the kiosk draws it (background, theme, style and the real widgets),
 * at its design size and scaled down with a CSS transform. Inert and hidden from assistive tech;
 * a video background shows its poster. The page is only mounted while the box is on screen.
 */
const PreviewPage = memo(
  function PreviewPage({
    profile,
    dashboard,
    scale,
  }: {
    profile: MonitorProfile;
    dashboard: DashboardConfig;
    scale: number;
  }) {
    const view = useMemo(() => profileWithPage(profile), [profile]);
    const theme = resolveTheme(dashboard, profile);
    const bg = resolveBackground(dashboard, profile);
    const background = bg && (bg.type === "video" ? posterBackground(bg) : bg);
    const font = fontStack(useGeneral().font);
    const fill = view.fit === "fill" && view.height > 0;
    const padding = profilePadding(view, true);
    const appearance = useMemo(() => appearanceOf(dashboard, view), [dashboard, view]);
    return (
      <PreviewProvider>
        <div
          data-theme-scope=""
          className={cn(
            "absolute left-0 top-0 isolate overflow-hidden text-foreground",
            !background && "bg-background",
          )}
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
              transform: `scale(${scale})`,
              transformOrigin: "0 0",
            } as CSSProperties
          }
        >
          {background && <PageBackground background={background} className="absolute inset-0 -z-10" />}
          <div
            className={cn("grid", fill && "h-full")}
            style={{
              gap: profileGap(view),
              gridTemplateColumns: `repeat(${view.cols}, minmax(0, 1fr))`,
              gridTemplateRows: fill
                ? `repeat(${view.rows}, minmax(0, 1fr))`
                : `repeat(${view.rows}, ${SCROLL_ROW_H}px)`,
            }}
          >
            {view.placements
              .filter((p) => p.visible)
              .map((p) => (
                <LivePlacement key={p.id} placement={p} appearance={appearance}>
                  {({ content, hasData, title, scope }) => (
                    <PlacementFrame
                      placement={p}
                      profile={view}
                      studio={false}
                      hasData={hasData}
                      title={title}
                      scope={scope}
                    >
                      {content}
                    </PlacementFrame>
                  )}
                </LivePlacement>
              ))}
          </div>
        </div>
      </PreviewProvider>
    );
  },
  (a, b) => samePage(a, b) && a.scale === b.scale,
);

/**
 * A preview of a profile's first page in a letterboxed box (the panel's own colour behind it).
 * Memoised on the profile object and the dashboard fields it inherits, so an edit to another
 * profile does not redraw it.
 */
export const ProfilePreview = memo(
  function ProfilePreview({ profile, dashboard, width, height, active, className }: ProfilePreviewProps) {
    const box = useBox(width);
    // The page redraws once edits settle (the real widgets are not re-rendered on every drag frame).
    const shown = useSettled(profile, 250);
    const page = fitPage(shown, box.width - 2, height - 2);
    const designW = shown.width > 0 ? shown.width : 1920;
    return (
      <span
        ref={box.ref}
        aria-hidden
        {...{ inert: true }}
        className={cn(
          "pointer-events-none relative flex shrink-0 items-center justify-center overflow-hidden rounded-[6px] border bg-ui-app",
          width === undefined && "w-full",
          active ? "border-ui-accent" : "border-ui-default",
          className,
        )}
        style={{ width, height }}
      >
        {box.visible && box.width > 2 && (
          <span className="relative block shrink-0 overflow-hidden" style={{ width: page.width, height: page.height }}>
            <PreviewPage profile={shown} dashboard={dashboard} scale={page.width / designW} />
          </span>
        )}
      </span>
    );
  },
  (a, b) =>
    samePage(a, b) &&
    a.width === b.width &&
    a.height === b.height &&
    a.active === b.active &&
    a.className === b.className,
);

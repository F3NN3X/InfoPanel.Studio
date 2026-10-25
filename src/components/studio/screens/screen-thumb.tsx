import { Monitor } from "lucide-react";
import { CanvasThumb } from "@/components/infopanel/profile-thumb";
import { CANVAS_ID, type DashboardConfig, type MonitorProfile } from "@/lib/layout";
import { screenKind } from "@/lib/screens/list";
import { resolveTheme } from "@/lib/theme";
import { useShot } from "../profile-shot-store";

/**
 * A screen's thumbnail: its kept screenshot on the screen's own background (a dashboard screen is captured by
 * `ProfileShots`, so it fills in a moment after an edit), or, for a screen that is one InfoPanel profile, the profile drawn live.
 */
export function ScreenThumb({ profile, dashboard }: { profile: MonitorProfile; dashboard: DashboardConfig }) {
  const shot = useShot(profile.id);
  const canvas = screenKind(profile) === "infopanel" ? profile.pages[0]?.placements.find((z) => z.module === CANVAS_ID && z.canvas)?.canvas : undefined;
  if (canvas) return <CanvasThumb canvas={canvas} />;
  return (
    <div aria-hidden className="grid h-full w-full place-items-center" style={{ background: `hsl(${resolveTheme(dashboard, profile).tokens.background})` }}>
      {shot ? (
        <img src={shot.dataUrl} alt="" decoding="async" draggable={false} className="h-full w-full object-contain" />
      ) : (
        <Monitor className="h-6 w-6 text-ui-1 opacity-20" strokeWidth={1.5} />
      )}
    </div>
  );
}

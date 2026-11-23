import type { DashboardConfig, MonitorProfile } from "@/lib/layout";
import { ProfilePage } from "./profile-page";
import type { ThemeAt } from "./theme-cards";
import { previewProfile } from "./theme-exceptions";

interface PageCanvasProps {
  config: DashboardConfig;
  profile: MonitorProfile;
  at: ThemeAt;
  pageId: string;
  scale: number;
  /** The caption over it ("Now", "Preview"). */
  label?: string;
}

/** A page of a screen drawn as the kiosk draws it, scaled and inert: the live preview's Compare and Browse's detail. */
export function PageCanvas({ config, profile, at, pageId, scale, label }: PageCanvasProps) {
  return (
    <figure className="flex min-w-0 flex-col gap-1.5">
      {label && <figcaption className="text-caption text-ui-3">{label}</figcaption>}
      <div className="relative overflow-hidden rounded-10 bg-s-well ring-1 ring-ui-strong" style={{ width: profile.width * scale, height: profile.height * scale }}>
        <div className="pointer-events-none absolute left-0 top-0 origin-top-left" style={{ scale: String(scale) }} inert>
          <ProfilePage profile={previewProfile(profile, at)} dashboard={config} pageId={pageId} stage />
        </div>
      </div>
    </figure>
  );
}

import type { DashboardConfig, MonitorProfile } from "@/lib/layout";
import { ProfilePreview } from "../profile-preview";
import { CloseButton } from "../zone-inspector-parts";

/** Nothing selected: the profile being edited, as its thumbnail, name and what this panel is. */
export function ProfileHeader({ profile, dashboard }: { profile: MonitorProfile; dashboard: DashboardConfig }) {
  return (
    <div className="flex items-center gap-3">
      <ProfilePreview profile={profile} dashboard={dashboard} width={44} height={30} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="truncate text-[13.5px] font-semibold leading-4 text-ui-1">{profile.name}</div>
        <div className="truncate text-[11.5px] text-[#8a8a94]">Profile settings · select a widget to edit it</div>
      </div>
      <CloseButton />
    </div>
  );
}

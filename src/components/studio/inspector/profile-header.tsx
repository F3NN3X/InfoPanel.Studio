import { ArrowLeft } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import type { DashboardConfig, MonitorProfile } from "@/lib/layout";
import { ProfilePreview } from "../profile-preview";
import { CloseButton } from "../zone-inspector-parts";

/** The screen's settings (reached from the Page inspector): its thumbnail, name, and the way back. */
export function ProfileHeader({ profile, dashboard, onBack }: { profile: MonitorProfile; dashboard: DashboardConfig; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <IconButton label="Back to the page" onClick={onBack}>
        <ArrowLeft className="h-4 w-4" />
      </IconButton>
      <ProfilePreview profile={profile} dashboard={dashboard} width={44} height={30} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="truncate text-[13.5px] font-semibold leading-4 text-ui-1">{profile.name}</div>
        <div className="truncate text-[11.5px] text-[#8a8a94]">Screen settings · select a widget to edit it</div>
      </div>
      <CloseButton />
    </div>
  );
}

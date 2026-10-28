import type { MonitorProfile } from "@/lib/layout";
import { resolveTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { fitPage } from "./profile-preview-model";
import { useShot } from "./profile-shot-store";

interface ProfilePreviewProps {
  profile: MonitorProfile;
  /** The box in px. */
  width: number;
  height: number;
  /** Outline in the accent colour (the profile being edited). */
  active?: boolean;
}

/**
 * A profile's screenshot (see `ProfileShots`) in a letterboxed box on the profile's theme background.
 * Without a shot yet the box is just that background.
 */
export function ProfilePreview({ profile, width, height, active }: ProfilePreviewProps) {
  const shot = useShot(profile.id);
  const page = fitPage(profile, width - 2, height - 2);
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none flex shrink-0 items-center justify-center overflow-hidden rounded-[6px] border",
        active ? "border-ui-accent" : "border-ui-default"
      )}
      style={{ width, height, background: `hsl(${resolveTheme(profile).tokens.background})` }}
    >
      {shot && (
        <img src={shot.dataUrl} alt="" decoding="async" draggable={false} style={{ width: page.width, height: page.height }} />
      )}
    </span>
  );
}

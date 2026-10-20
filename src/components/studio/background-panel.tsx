import { BACKGROUND_DEFAULTS, type BackgroundType, type PageBackground } from "@/lib/appearance";
import { BackgroundEditor } from "./background-editor";
import { SegmentedRow } from "./setting-rows";

/** Which background the tab edits. */
export type BackgroundTarget = "all" | "profile";

/** A profile's own background: none set, its own, or explicitly none. */
type ProfileMode = "inherit" | "custom" | "none";

const MODES = [
  { value: "inherit" as const, label: "Inherit", title: "Use the dashboard background" },
  { value: "custom" as const, label: "Custom", title: "A background for this profile only" },
  { value: "none" as const, label: "None", title: "No background on this profile" },
];

const ALL_TYPES: BackgroundType[] = ["none", "color", "gradient", "image", "video"];
const OWN_TYPES: BackgroundType[] = ["color", "gradient", "image", "video"];

const TYPE_NAMES: Record<BackgroundType, string> = {
  none: "none",
  color: "a color",
  gradient: "a gradient",
  image: "an image",
  video: "a video",
};

interface BackgroundPanelProps {
  /** Which background to edit: the Scope section's choice. */
  target: BackgroundTarget;
  onTarget: (target: BackgroundTarget) => void;
  /** The dashboard background (every profile without its own). */
  dashboard: PageBackground | undefined;
  /** The active profile's own background. */
  profileBackground: PageBackground | undefined;
  profileName: string;
  profileId: string;
  /** Open the Library (the pickers' empty state). */
  onOpenLibrary?: () => void;
  /** Set (or clear) the background of a target. */
  onChange: (target: BackgroundTarget, bg: PageBackground | undefined) => void;
}

function profileMode(bg: PageBackground | undefined): ProfileMode {
  if (!bg) return "inherit";
  return bg.type === "none" ? "none" : "custom";
}

/**
 * Appearance › Page background, of the Scope section's target: the
 * dashboard's ("All profiles") or the active profile's own ("This
 * profile": inherit the dashboard's, a custom one, or none).
 */
export function BackgroundPanel({
  target,
  onTarget,
  dashboard,
  profileBackground,
  profileName,
  profileId,
  onOpenLibrary,
  onChange,
}: BackgroundPanelProps) {
  const mode = profileMode(profileBackground);
  const dashboardBg = dashboard ?? { type: "none" };

  const setMode = (next: ProfileMode) => {
    if (next === mode) return;
    if (next === "inherit") onChange("profile", undefined);
    else if (next === "none") onChange("profile", { type: "none" });
    // Custom starts from the dashboard's background, or a plain color.
    else
      onChange(
        "profile",
        dashboard && dashboard.type !== "none" ? dashboard : { type: "color", color: BACKGROUND_DEFAULTS.color }
      );
  };

  if (target === "all") {
    return (
      <div className="space-y-2">
        <p className="text-[11px] leading-snug text-ui-4">
          Behind the grid of every profile that has no background of its own.
        </p>
        {profileBackground && (
          <div className="rounded-lg border border-ui-warning/40 bg-ui-warning/10 px-2.5 py-2 text-[11.5px] leading-snug text-ui-2">
            <span className="text-ui-1">{profileName}</span> has its own background (
            {TYPE_NAMES[profileBackground.type]}), so this one doesn&apos;t show there.{" "}
            <button type="button" className="font-medium text-ui-1 underline-offset-2 hover:underline" onClick={() => onChange("profile", undefined)}>
              Use this one
            </button>
            {" · "}
            <button type="button" className="font-medium text-ui-1 underline-offset-2 hover:underline" onClick={() => onTarget("profile")}>
              Edit {profileName}&apos;s
            </button>
          </div>
        )}
        <BackgroundEditor value={dashboardBg} types={ALL_TYPES} onChange={(bg) => onChange("all", bg)} copyLabel="Dashboard › Background" profileId={profileId} onOpenLibrary={onOpenLibrary} />
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-[11px] leading-snug text-ui-4">
        Only for <span className="text-ui-2">{profileName}</span>.
      </p>
      <SegmentedRow
        label="Background"
        options={MODES}
        value={mode}
        onChange={(m) => setMode(m as ProfileMode)}
      />
      {mode === "inherit" && (
        <p className="text-[12px] text-ui-3">
          Uses the dashboard background ({TYPE_NAMES[dashboardBg.type]}).{" "}
          <button type="button" className="text-ui-1 underline-offset-2 hover:underline" onClick={() => onTarget("all")}>
            Edit it
          </button>
        </p>
      )}
      {mode === "none" && (
        <p className="text-[12px] text-ui-3">No background on this profile; the theme&apos;s background color shows.</p>
      )}
      {mode === "custom" && profileBackground && (
        <BackgroundEditor value={profileBackground} types={OWN_TYPES} onChange={(bg) => onChange("profile", bg)} copyLabel={`${profileName} › Background`} profileId={profileId} onOpenLibrary={onOpenLibrary} />
      )}
    </div>
  );
}

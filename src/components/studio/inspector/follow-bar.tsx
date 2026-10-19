import { Link2, Lock, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FollowMode } from "../inspector-model";
import type { FollowBar as FollowBarState } from "../settings-panel";

const PILL: Record<FollowMode, { label: string; icon: typeof Link2; className: string }> = {
  theme: { label: "Theme", icon: Link2, className: "text-ui-4" },
  custom: { label: "Custom", icon: SlidersHorizontal, className: "bg-ui-accent/[.18] text-ui-accent-text" },
  locked: { label: "Locked", icon: Lock, className: "text-ui-4" },
};

/** A followable section's header pill: Theme, Custom or Locked (SPEC §4.1). */
export function FollowPill({ mode }: { mode: FollowMode }) {
  const { label, icon: Icon, className } = PILL[mode];
  return (
    <span className={cn("flex shrink-0 items-center gap-1 rounded-lg px-[5px] py-px text-[10px] font-medium", className)}>
      <Icon className="h-3 w-3" strokeWidth={2} aria-hidden />
      {label}
    </span>
  );
}

/**
 * The first line of an open followable section: what it follows and the
 * switch (SPEC §4.1). Following: "Follows the profile theme · Desk" and
 * Customize (its rows unlock at the theme's values, or the own values kept
 * from before). Custom: "Custom for this widget" and Use theme (the own
 * values stay stored). Locked by the profile: no switch.
 */
export function FollowBar({ bar, onTheme }: { bar: FollowBarState; onTheme?: () => void }) {
  const custom = bar.mode === "custom";
  const Icon = PILL[bar.mode].icon;
  const from = onTheme ? (
    <button type="button" onClick={onTheme} className="hover:text-ui-1 hover:underline" title="Edit the theme">
      {bar.from}
    </button>
  ) : (
    bar.from
  );
  return (
    <div
      className={cn(
        "flex min-h-8 items-center gap-2 rounded-md px-2 py-1 text-[11.5px] leading-snug",
        custom ? "bg-ui-accent/10 text-ui-accent-text" : "bg-ui-raised text-ui-3"
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
      <span className="min-w-0 flex-1">
        {custom ? "Custom for this widget" : bar.mode === "locked" ? <>Locked by {from}</> : <>Follows {from}</>}
      </span>
      {bar.mode !== "locked" && (
        <button
          type="button"
          onClick={custom ? bar.onUseTheme : bar.onCustomize}
          className={cn(
            "h-6 shrink-0 rounded-md border px-2 text-[11.5px] font-medium",
            custom ? "border-ui-strong bg-ui-raised text-ui-2 hover:text-ui-1" : "border-ui-accent/50 text-ui-accent-text hover:bg-ui-accent/10"
          )}
        >
          {custom ? "Use theme" : "Customize"}
        </button>
      )}
    </div>
  );
}

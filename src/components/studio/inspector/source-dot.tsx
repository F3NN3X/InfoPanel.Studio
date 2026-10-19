import { cn } from "@/lib/utils";
import { SET_HERE, type SettingState } from "../settings-model";

/** The dot of each source state (README §5.6); `default` is an empty outline. */
const DOT: Record<SettingState, string> = {
  default: "border border-[#34343b]",
  dashboard: "bg-ui-dot-dashboard",
  profile: "bg-ui-dot-profile",
  here: "bg-ui-accent",
  overriding: "bg-ui-accent shadow-[0_0_0_2px_var(--ui-bg-panel),0_0_0_3px_var(--ui-accent)]",
  ignored: "shadow-[inset_0_0_0_1.5px_var(--ui-warning)]",
};

/** What each dot means (its tooltip, and the footer's legend). */
export const DOT_MEANING: Record<SettingState, string> = {
  default: "Default",
  dashboard: "From the dashboard style",
  profile: "From the profile style",
  here: "Set here",
  overriding: "Set here, overriding a global value",
  ignored: "Set here but not used (its section follows the theme)",
};

/** The legend order (a zone's own values that don't apply show no dot: their section follows the theme). */
export const DOT_LEGEND: readonly SettingState[] = ["default", "dashboard", "profile", "here", "overriding"];

/** The 7 px source dot before a field's label; a "set here" dot is a reset button. */
export function SourceDot({ state, onReset }: { state: SettingState; onReset?: () => void }) {
  const dot = cn("block h-[7px] w-[7px] shrink-0 rounded-full", DOT[state]);
  if (!SET_HERE.has(state) || !onReset) {
    return <span aria-hidden={state === "default"} title={state === "default" ? undefined : DOT_MEANING[state]} className={dot} />;
  }
  return (
    <button
      type="button"
      onClick={onReset}
      title={`${DOT_MEANING[state]} — click to reset`}
      aria-label={`${DOT_MEANING[state]} — reset`}
      className={cn(dot, "cursor-pointer transition-transform hover:scale-125")}
    />
  );
}

/** The dot legend (the footer's help tooltip). */
export function DotLegend() {
  return (
    <ul className="space-y-1.5 text-[12px] text-ui-2">
      {DOT_LEGEND.map((state) => (
        <li key={state} className="flex items-center gap-2">
          <span className={cn("block h-[7px] w-[7px] shrink-0 rounded-full", DOT[state])} />
          {state === "default" ? "None — the default" : DOT_MEANING[state]}
        </li>
      ))}
      <li className="pt-1 text-[11px] text-ui-4">Click a dot set here to reset it.</li>
    </ul>
  );
}

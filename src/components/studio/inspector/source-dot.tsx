import { cn } from "@/lib/utils";
import { SET_HERE, type SettingState } from "../settings-model";

/** The mark of each source state (README §5.6), told apart by shape first and hue second: `default` is an empty ring, app a diamond, screen theme a square, here a dot, overriding a ringed dot. */
const DOT: Record<SettingState, string> = {
  default: "rounded-full border border-[#6e6e78]",
  app: "rotate-45 rounded-[1px] bg-ui-dot-dashboard",
  profile: "rounded-[2px] bg-ui-dot-profile",
  here: "rounded-full bg-ui-accent",
  overriding: "rounded-full bg-ui-accent shadow-[0_0_0_2px_var(--ui-bg-panel),0_0_0_3px_var(--ui-accent)]",
  ignored: "rounded-full shadow-[inset_0_0_0_1.5px_var(--ui-warning)]",
};

/** What each dot means (its tooltip, and the footer's legend). */
export const DOT_MEANING: Record<SettingState, string> = {
  default: "Default",
  app: "From the app settings",
  profile: "From the screen's theme",
  here: "Changed here",
  overriding: "Changed here, overriding a global value",
  ignored: "Changed here but not used (its section follows the theme)",
};

/** The legend order (a zone's own values that don't apply show no dot: their section follows the theme). */
export const DOT_LEGEND: readonly SettingState[] = ["default", "app", "profile", "here", "overriding"];

/** The 7 px source dot before a field's label; a "changed here" dot is a reset button. */
export function SourceDot({ state, onReset }: { state: SettingState; onReset?: () => void }) {
  const dot = cn("block h-[7px] w-[7px] shrink-0", DOT[state]);
  if (!SET_HERE.has(state) || !onReset) {
    if (state === "default") return <span aria-hidden="true" className={dot} />;
    return <span role="img" aria-label={DOT_MEANING[state]} title={DOT_MEANING[state]} className={dot} />;
  }
  return (
    <button
      type="button"
      onClick={onReset}
      title={`${DOT_MEANING[state]} — click to reset`}
      aria-label={`${DOT_MEANING[state]} — reset`}
      className={cn(dot, "relative cursor-pointer transition-transform before:absolute before:-inset-2 before:content-[''] hover:scale-125")}
    />
  );
}

/** The dot legend (the footer's help tooltip). */
export function DotLegend() {
  return (
    <ul className="space-y-1.5 text-[12px] text-ui-2">
      {DOT_LEGEND.map((state) => (
        <li key={state} className="flex items-center gap-2">
          <span aria-hidden="true" className={cn("block h-[7px] w-[7px] shrink-0", DOT[state])} />
          {state === "default" ? "None — the default" : DOT_MEANING[state]}
        </li>
      ))}
      <li className="pt-1 text-[11px] text-ui-4">Click a dot set here to reset it.</li>
    </ul>
  );
}

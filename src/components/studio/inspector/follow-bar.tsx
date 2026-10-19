import type { ReactNode } from "react";
import { Globe, Link2, Lock, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FollowMode } from "../inspector-model";
import type { FollowBar as FollowBarState, ThemeScopeBar } from "../settings-panel";

const PILL: Record<FollowMode, { label: string; icon: typeof Link2; className: string }> = {
  theme: { label: "Theme", icon: Link2, className: "text-ui-4" },
  custom: { label: "Custom", icon: SlidersHorizontal, className: "bg-ui-accent/[.18] text-ui-accent-text" },
  locked: { label: "Locked", icon: Lock, className: "text-ui-4" },
};

/**
 * A followable section's header pill: Theme, Custom or Locked (SPEC §4.1);
 * a page theme's following section reads Profile, a profile theme's
 * unlocked section has none (it is the theme).
 */
export function FollowPill({ mode, scope }: { mode: FollowMode; scope?: ThemeScopeBar["kind"] }) {
  if (scope === "profile" && mode !== "locked") return null;
  const { label, icon: Icon, className } = PILL[mode];
  return (
    <span className={cn("flex shrink-0 items-center gap-1 rounded-lg px-[5px] py-px text-[10px] font-medium", className)}>
      <Icon className="h-3 w-3" strokeWidth={2} aria-hidden />
      {scope === "page" && mode === "theme" ? "Profile" : label}
    </span>
  );
}

/** The bar's switch: accent outline to customize or lock, plain to go back. */
function BarButton({ accent, onClick, children }: { accent: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "h-6 shrink-0 rounded-md border px-2 text-[11.5px] font-medium",
        accent ? "border-ui-accent/50 text-ui-accent-text hover:bg-ui-accent/10" : "border-ui-strong bg-ui-raised text-ui-2 hover:text-ui-1"
      )}
    >
      {children}
    </button>
  );
}

/** What the bar says and its switch: a widget's, or a profile / page theme's (the theme editor). */
function barContent(bar: FollowBarState, from: ReactNode): { text: ReactNode; button?: { label: string; accent: boolean; onClick: () => void } } {
  const custom = bar.mode === "custom";
  const locked = bar.mode === "locked";
  const scope = bar.scope;
  if (scope?.kind === "profile")
    return {
      text: locked ? "Locked: every widget uses these" : `Default for all widgets${scope.custom > 0 ? ` · ${scope.custom} custom on ${scope.pageName}` : ""}`,
      button: { label: locked ? "Unlock" : "Lock", accent: !locked, onClick: () => scope.onLock(!locked) },
    };
  if (scope?.kind === "page") {
    if (locked) return { text: "Locked by the profile theme" };
    return custom
      ? { text: `Custom for ${scope.pageName}`, button: { label: "Use profile", accent: false, onClick: bar.onUseTheme } }
      : { text: "Follows the profile theme", button: { label: "Customize", accent: true, onClick: bar.onCustomize } };
  }
  if (locked) return { text: <>Locked by {from}</> };
  return custom
    ? { text: "Custom for this widget", button: { label: "Use theme", accent: false, onClick: bar.onUseTheme } }
    : { text: <>Follows {from}</>, button: { label: "Customize", accent: true, onClick: bar.onCustomize } };
}

/**
 * The first line of an open followable section: what it follows and the
 * switch (SPEC §4.1). Following: "Follows the profile theme · Desk" and
 * Customize (its rows unlock at the theme's values, or the own values kept
 * from before). Custom: "Custom for this widget" and Use theme (the own
 * values stay stored). Locked by the profile: no switch. The theme editor's
 * profile scope reads "Default for all widgets · N custom" with Lock, its
 * page scope "Follows the profile theme" / "Custom for <page>".
 */
export function FollowBar({ bar, onTheme }: { bar: FollowBarState; onTheme?: (level: FollowBarState["level"]) => void }) {
  const custom = bar.mode === "custom";
  const Icon = bar.scope?.kind === "profile" && bar.mode !== "locked" ? Globe : PILL[bar.mode].icon;
  const from = onTheme ? (
    <button type="button" onClick={() => onTheme(bar.level)} className="hover:text-ui-1 hover:underline" title="Edit the theme">
      {bar.from}
    </button>
  ) : (
    bar.from
  );
  const { text, button } = barContent(bar, from);
  return (
    <div
      className={cn(
        "flex min-h-8 items-center gap-2 rounded-md px-2 py-1 text-[11.5px] leading-snug",
        custom ? "bg-ui-accent/10 text-ui-accent-text" : "bg-ui-raised text-ui-3"
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden />
      <span className="min-w-0 flex-1">{text}</span>
      {button && (
        <BarButton accent={button.accent} onClick={button.onClick}>
          {button.label}
        </BarButton>
      )}
    </div>
  );
}

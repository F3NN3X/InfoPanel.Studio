import { SegmentedRow, ToggleRow } from "./setting-rows";

/** Which global style (or background) a card edits. */
export type AppearanceTarget = "all" | "profile";

export const SCOPES = [
  { value: "all" as const, label: "All profiles" },
  { value: "profile" as const, label: "This profile" },
];

interface GlobalStyleScopeProps {
  target: AppearanceTarget;
  onTarget: (target: AppearanceTarget) => void;
  /** Every section of the target's profile theme is locked (of every profile, for "All profiles"). */
  forced: boolean;
  /** Lock every section of the target's profile themes, or none. */
  onEnforce: (target: AppearanceTarget, on: boolean) => void;
  /** What still hides this scope's global style: widgets with their own look, profile styles. */
  overrides: { widgets: number; profiles: number };
  /** Make the overriding widgets follow the global style. */
  onFollowAll: () => void;
}

const FORCE_LABEL = "Force global style";
const FORCE_HINT = "Locks every section of the profile theme: every widget shows it, and none can customize a section";

/**
 * Appearance › Scope: which style the presets, theme, background and
 * Global style tab edit (all profiles, or this one over the dashboard's)
 * and its "Force global style" switch (every section of the profile theme
 * locked). A widget's custom section shows its own values unless the
 * profile locks the section.
 */
export function GlobalStyleScope({ target, onTarget, forced, onEnforce, overrides, onFollowAll }: GlobalStyleScopeProps) {
  return (
    <div className="space-y-3">
      <SegmentedRow label="Apply to" options={SCOPES} value={target} onChange={(v) => onTarget(v as AppearanceTarget)} />
      <ToggleRow label={FORCE_LABEL} hint={FORCE_HINT} value={forced} onChange={(on) => onEnforce(target, on)} />
      <FollowAllRow overrides={overrides} onFollowAll={onFollowAll} />
    </div>
  );
}

/** "Make all widgets follow": drops the looks that hide the global style (they stay stored). */
function FollowAllRow({ overrides, onFollowAll }: Pick<GlobalStyleScopeProps, "overrides" | "onFollowAll">) {
  const { widgets, profiles } = overrides;
  const hidden = [
    widgets > 0 && `${widgets} widget${widgets === 1 ? "" : "s"}`,
    profiles > 0 && `${profiles} profile${profiles === 1 ? "" : "s"}`,
  ].filter(Boolean);
  return (
    <div className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] text-ui-1">Make all widgets follow</div>
        <div className="text-[11px] leading-snug text-ui-4">
          {hidden.length > 0 ? `${hidden.join(" and ")} keep their own look` : "Every widget already follows"}
        </div>
      </div>
      <button
        type="button"
        onClick={onFollowAll}
        disabled={hidden.length === 0}
        className="h-7 shrink-0 rounded-md border border-ui-strong bg-ui-raised px-2.5 text-[12px] text-ui-2 hover:text-ui-1 disabled:opacity-40"
      >
        Follow
      </button>
    </div>
  );
}

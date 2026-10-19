import { Palette } from "lucide-react";
import { SegmentedRow } from "./setting-rows";

/** Which global style (or background) a card edits. */
export type AppearanceTarget = "all" | "profile";

export const SCOPES = [
  { value: "all" as const, label: "All profiles" },
  { value: "profile" as const, label: "This profile" },
];

interface AppearanceScopeProps {
  target: AppearanceTarget;
  onTarget: (target: AppearanceTarget) => void;
  /** Studio › Theme: the widget theme (values, locks, who follows) is edited there. */
  onOpenTheme: () => void;
}

/**
 * Appearance › Scope: which level the skins, presets, theme colours and
 * surface edit (all profiles, or this one over the dashboard's). The widget
 * theme itself — every themed section, its locks and the widgets that do
 * not follow it — is the theme editor's (SPEC §7).
 */
export function AppearanceScope({ target, onTarget, onOpenTheme }: AppearanceScopeProps) {
  return (
    <div className="space-y-3">
      <SegmentedRow label="Apply to" options={SCOPES} value={target} onChange={(v) => onTarget(v as AppearanceTarget)} />
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] text-ui-1">Widget theme</div>
          <div className="text-[11px] leading-snug text-ui-4">Every themed section, locks and who doesn&apos;t follow</div>
        </div>
        <button
          type="button"
          onClick={onOpenTheme}
          className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-ui-strong bg-ui-raised px-2.5 text-[12px] text-ui-2 hover:text-ui-1"
        >
          <Palette className="h-3.5 w-3.5" />
          Theme editor
        </button>
      </div>
    </div>
  );
}

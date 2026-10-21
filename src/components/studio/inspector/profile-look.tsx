import { ChevronRight, Paintbrush } from "lucide-react";
import { Segmented } from "@/components/ui/segmented";
import { Toggle } from "@/components/ui/toggle";
import type { PageBackground } from "@/lib/appearance";
import { FONT_CATALOG } from "@/lib/fonts";
import type { GeneralFont } from "@/lib/general";
import { THEME_PRESETS, resolveTheme, type ThemeTokens } from "@/lib/theme";
import type { ModuleSettings } from "@/modules/types";
import { AppearanceGallery, type CurrentLook } from "../appearance-gallery";
import { BackgroundEditor } from "../background-editor";
import { SkinGallery } from "../skin-gallery";
import { SelectRow, SliderRow } from "../setting-rows";
import { CardEffects, SurfacePicker } from "../surface-picker";
import { ThemePanel } from "../theme-panel";
import type { AppearancePresetsApi } from "../use-appearance-presets";
import type { AppearanceTarget, LockState, LookScope, ProfileTheme } from "./profile-scope";
import { SourceDot } from "./source-dot";

/**
 * Dashboard › Look: Theme, Widget style and Background, each with an All profiles | This profile
 * switch in its header. All profiles edits the dashboard's value, This profile the profile's own
 * (present only while the section is This profile's).
 */

const HELP = "text-pretty text-[11.5px] leading-[1.4] text-ui-4";

const SCOPE_OPTIONS = [
  { value: "all" as const, label: "All profiles" },
  { value: "profile" as const, label: "This profile" },
];

/** The switch in a section's header. */
export function ScopeSwitch({ scope, onScope, label }: { scope: LookScope; onScope: (scope: LookScope) => void; label: string }) {
  return (
    <Segmented
      options={SCOPE_OPTIONS}
      value={scope}
      onChange={onScope}
      label={`${label} applies to`}
      className="shrink-0 flex-nowrap gap-0 rounded-md p-px [&>button]:whitespace-nowrap [&>button]:px-1 [&>button]:py-[3px] [&>button]:text-[10.5px]"
    />
  );
}

/** The dot after a title: teal for the shared value, purple for the profile's own. */
export function ScopeDot({ scope }: { scope: LookScope }) {
  return <SourceDot state={scope === "all" ? "dashboard" : "profile"} />;
}

/** What the section's switch means right now. */
export function ScopeNote({ scope, count, name }: { scope: LookScope; count: number; name: string }) {
  return (
    <p className={HELP}>
      {scope === "all"
        ? `${count > 1 ? `Shared by all ${count} profiles` : "Shared by every profile"}. Changes here apply to every one.`
        : `Only ${name} uses this. Other profiles keep the shared one.`}
    </p>
  );
}

/** The note above the Look sections, with the legend of the two dots. */
export function LookNote({ name }: { name: string }) {
  return (
    <>
      <span className="text-pretty">
        Look settings are shared by every profile. Switch a section to <span className="text-ui-1">This profile</span> to give {name}{" "}
        its own.
      </span>
      <span className="mt-1.5 flex gap-3.5">
        <span className="flex items-center gap-1.5">
          <SourceDot state="dashboard" />
          All profiles
        </span>
        <span className="flex items-center gap-1.5">
          <SourceDot state="profile" />
          This profile only
        </span>
      </span>
    </>
  );
}

const FONTS = FONT_CATALOG.map((f) => ({ value: f.id, label: f.label }));

export function ThemeBody({
  scope,
  count,
  name,
  dashboard,
  profile,
  onToken,
  onPreset,
  onProfileTheme,
  onRadius,
  font,
  onFont,
}: {
  scope: LookScope;
  count: number;
  name: string;
  /** The dashboard's theme (what All profiles shows and edits). */
  dashboard: { theme: ThemeTokens; radius: number };
  /** The profile's own theme colours and radius. */
  profile: ProfileTheme;
  onToken: (key: keyof ThemeTokens, value: string) => void;
  onPreset: (name: string) => void;
  onProfileTheme: (next: ProfileTheme, key?: string) => void;
  onRadius: (radius: number) => void;
  font: GeneralFont;
  onFont: (font: GeneralFont) => void;
}) {
  const all = scope === "all";
  const shown = resolveTheme(dashboard, all ? undefined : profile);
  const presetName = THEME_PRESETS.find((p) => JSON.stringify(p.tokens) === JSON.stringify(shown.tokens))?.name ?? "custom";
  return (
    <div className="space-y-3">
      <ScopeNote scope={scope} count={count} name={name} />
      <ThemePanel
        tokens={shown.tokens}
        presetName={presetName}
        onToken={all ? onToken : (key, value) => onProfileTheme({ ...profile, theme: { ...shown.tokens, [key]: value } }, `profile-theme:${key}`)}
        onPreset={
          all
            ? onPreset
            : (preset) => {
                const found = THEME_PRESETS.find((p) => p.name === preset);
                if (found) onProfileTheme({ ...profile, theme: { ...found.tokens } });
              }
        }
        after={
          <SliderRow
            label="Corners (rem)"
            hint="Every widget's corners; a widget's own Corner radius wins"
            value={shown.radius}
            min={0}
            max={1.5}
            step={0.05}
            fallback={dashboard.radius}
            onChange={onRadius}
          />
        }
      />
      <div className="space-y-1.5 border-t border-[#1c1c21] pt-3">
        <SelectRow
          label="Font"
          hint="Every widget whose Font is Theme uses it; a Font set on the widget or in the widget theme still wins."
          options={FONTS}
          value={font}
          onChange={(v) => onFont(v as GeneralFont)}
        />
        <p className={HELP}>The page font applies to every profile.</p>
      </div>
    </div>
  );
}

/** "Apply to every widget": locks all 11 sections of this profile's widget theme. */
function LockAllRow({ state, scope, onToggle }: { state: LockState; scope: LookScope; onToggle: () => void }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[12.5px] text-ui-1">Apply to every widget</span>
          <span className={HELP}>Overrides each widget&apos;s own colours and surface.</span>
        </div>
        {state === "some" && <span className="shrink-0 text-[11px] text-ui-4">Some sections</span>}
        <Toggle checked={state === "all"} onChange={onToggle} label="Apply to every widget" className="[&>span]:bg-ui-1" />
      </div>
      {scope === "all" && <p className={HELP}>Locks this profile&apos;s widgets only; the shared style has no locks.</p>}
    </div>
  );
}

export function StyleBody({
  scope,
  count,
  name,
  scoped,
  look,
  presets,
  onChange,
  lock,
  onToggleLock,
  onOpenTheme,
}: {
  scope: LookScope;
  count: number;
  name: string;
  /** The scope's stored style, no defaults. */
  scoped: ModuleSettings;
  /** The look the presets are compared with. */
  look: CurrentLook;
  presets: AppearancePresetsApi;
  /** Edit the scope's style. */
  onChange: (fn: (style: ModuleSettings) => ModuleSettings) => void;
  lock: LockState;
  onToggleLock: () => void;
  onOpenTheme: () => void;
}) {
  const target: AppearanceTarget = scope;
  return (
    <div className="space-y-4">
      <ScopeNote scope={scope} count={count} name={name} />
      <SkinGallery value={scoped.skin as string | undefined} onPick={(skin) => onChange((st) => ({ ...st, skin, surface: "auto" }))} />
      <AppearanceGallery api={presets} target={target} look={look} />
      <SurfacePicker
        surface={scoped.surface}
        skin={scoped.skin}
        accent={typeof scoped.accent === "string" ? scoped.accent : undefined}
        onPick={(surface) => onChange((st) => ({ ...st, surface }))}
      />
      <CardEffects
        opacity={scoped.surfaceOpacity}
        blur={scoped.blur}
        onOpacity={(surfaceOpacity) => onChange((st) => ({ ...st, surfaceOpacity }))}
        onBlur={(blur) => onChange((st) => ({ ...st, blur }))}
      />
      <LockAllRow state={lock} scope={scope} onToggle={onToggleLock} />
      <button
        type="button"
        onClick={onOpenTheme}
        className="flex w-full items-center gap-2.5 rounded-lg border border-ui-default bg-ui-app px-3 py-2.5 text-left hover:bg-ui-hover"
      >
        <Paintbrush className="h-[18px] w-[18px] shrink-0 text-ui-3" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[12.5px] text-ui-1">Edit widget style</span>
          <span className="text-[11.5px] text-ui-4">Surface, borders, type, spacing</span>
        </span>
        <ChevronRight className="h-[18px] w-[18px] shrink-0 text-ui-4" />
      </button>
    </div>
  );
}

export function BackgroundBody({
  scope,
  count,
  name,
  value,
  profileId,
  onChange,
  onOpenLibrary,
}: {
  scope: LookScope;
  count: number;
  name: string;
  /** The background the scope shows. */
  value: PageBackground;
  profileId: string;
  onChange: (bg: PageBackground) => void;
  onOpenLibrary: () => void;
}) {
  return (
    <div className="space-y-3">
      <ScopeNote scope={scope} count={count} name={name} />
      <BackgroundEditor
        value={value}
        types={["none", "color", "gradient", "image", "video"]}
        onChange={onChange}
        copyLabel={scope === "all" ? "Dashboard › Background" : `${name} › Background`}
        profileId={profileId}
        onOpenLibrary={onOpenLibrary}
      />
    </div>
  );
}

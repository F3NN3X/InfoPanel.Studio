import { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { BookmarkPlus, Image, MoreHorizontal, X } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { isBuiltinPreset, type AppearancePreset } from "@/lib/appearance-presets";
import type { ThemeTokens } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { ModuleSettings } from "@/modules/types";
import { activePresetId, appliedMessage } from "./appearance-actions";
import type { AppearanceTarget } from "./inspector/profile-scope";
import { AppearancePreview } from "./appearance-preview";
import { ToggleRow } from "./setting-rows";
import { ICON_BUTTON, ITEM, POPUP, SEPARATOR } from "./style-tools";
import type { AppearancePresetsApi } from "./use-appearance-presets";

/** The look the scope shows now (to mark the preset it is). */
export interface CurrentLook {
  tokens: ThemeTokens;
  radius: number;
  style: ModuleSettings | undefined;
}

/** An inline name input (Enter saves, Esc cancels; blur saves when `commitOnBlur`). */
function NameInput({
  initial,
  label,
  onDone,
  commitOnBlur = false,
}: {
  initial: string;
  label: string;
  onDone: (name: string | null) => void;
  commitOnBlur?: boolean;
}) {
  const [name, setName] = useState(initial);
  const commit = () => onDone(name.trim() || null);
  return (
    <input
      autoFocus
      value={name}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setName(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        // Keep Esc from also stepping the studio's selection out.
        e.stopPropagation();
        if (e.key === "Enter") commit();
        if (e.key === "Escape") onDone(null);
      }}
      onBlur={commitOnBlur ? commit : undefined}
      placeholder={label}
      aria-label={label}
      className="h-6 min-w-0 flex-1 rounded-md border border-ui-default bg-ui-app px-1.5 text-[11.5px] text-ui-1 outline-none placeholder:text-ui-4 focus:border-ui-accent"
    />
  );
}

/** The "⋯" of a saved look's card. */
function SavedLookMenu({ onRename, onDelete }: { onRename: () => void; onDelete: () => void }) {
  return (
    <Menu.Root>
      <Menu.Trigger
        className="rounded p-0.5 text-ui-4 hover:bg-ui-hover hover:text-ui-1 data-popup-open:bg-ui-hover data-popup-open:text-ui-1"
        title="Saved look actions"
        aria-label="Saved look actions"
      >
        <MoreHorizontal className="h-3 w-3" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-[80]" sideOffset={4} align="end">
          <Menu.Popup className={POPUP}>
            <Menu.Item className={ITEM} onClick={onRename}>
              Rename…
            </Menu.Item>
            <Menu.Separator className={SEPARATOR} />
            <Menu.Item className={cn(ITEM, "text-ui-danger")} onClick={onDelete}>
              Delete
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** One gallery card: the swatch (accent ring when it is the current look), then the name; click applies. */
function PresetCard({
  preset,
  active,
  onApply,
  onRename,
  onDelete,
}: {
  preset: AppearancePreset;
  active: boolean;
  onApply: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const saved = !isBuiltinPreset(preset.id);
  return (
    <div className="min-w-0">
      <button
        type="button"
        onClick={onApply}
        className={cn(
          "block w-full text-left outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-ui-accent/60",
          active ? "ring-2 ring-ui-accent" : "hover:ring-1 hover:ring-ui-strong"
        )}
        style={{ borderRadius: `${preset.radius}rem` }}
        title={`${preset.name} — ${preset.description}`}
        aria-label={`Apply appearance ${preset.name}`}
        aria-pressed={active}
      >
        <AppearancePreview preset={preset} />
      </button>
      <div className="mt-[5px] flex min-h-5 items-center gap-1">
        {renaming ? (
          <NameInput
            initial={preset.name}
            label="Look name"
            commitOnBlur
            onDone={(name) => {
              setRenaming(false);
              if (name) onRename(name);
            }}
          />
        ) : (
          <button
            type="button"
            onClick={onApply}
            className={cn("min-w-0 flex-1 truncate text-left text-[11.5px]", active ? "text-ui-1" : "text-[#b4b4bc]")}
          >
            {preset.name}
          </button>
        )}
        {preset.background && (
          <span title="Comes with a page background">
            <Image className="h-3 w-3 shrink-0 text-ui-4" />
          </span>
        )}
        {saved && !renaming && <SavedLookMenu onRename={() => setRenaming(true)} onDelete={onDelete} />}
      </div>
    </div>
  );
}

/** After an apply: what still hides the look, and the one-click fix. */
function OverridesBanner({
  widgets,
  profiles,
  onFollow,
  onDismiss,
}: {
  widgets: number;
  profiles: number;
  onFollow: () => void;
  onDismiss: () => void;
}) {
  const own = (n: number, noun: string, verb: [string, string], what: string) =>
    n === 1 ? `1 ${noun} ${verb[0]} its own ${what}` : `${n} ${noun}s ${verb[1]} their own ${what}`;
  const parts = [
    widgets > 0 && own(widgets, "widget", ["keeps", "keep"], "style"),
    profiles > 0 && own(profiles, "profile", ["has", "have"], "look"),
  ].filter(Boolean);
  return (
    <div className="flex items-start gap-2 rounded-lg border border-ui-warning/40 bg-ui-warning/10 px-2.5 py-2 text-[11.5px] text-ui-2">
      <div className="min-w-0 flex-1">
        {parts.join(" · ")} —{" "}
        <button type="button" onClick={onFollow} className="font-medium text-ui-1 underline-offset-2 hover:underline">
          Make them follow
        </button>
      </div>
      <button type="button" onClick={onDismiss} className="text-ui-4 hover:text-ui-1" title="Dismiss" aria-label="Dismiss">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

/**
 * Appearance › Skins › Saved looks: a 3-column gallery of the user's
 * saved whole looks, applied to the scope of the
 * Scope section. One apply is one undo step.
 */
export function AppearanceGallery({
  api,
  target,
  look,
}: {
  api: AppearancePresetsApi;
  target: AppearanceTarget;
  look: CurrentLook;
}) {
  const toast = useToast();
  const [applied, setApplied] = useState(false);
  const [naming, setNaming] = useState(false);
  const [replaceBackground, setReplaceBackground] = useState(false);
  const { widgets, profiles } = api.overrides(target);
  const activeId = activePresetId(api.presets, look);
  const apply = (preset: AppearancePreset) => {
    api.apply(preset, target, replaceBackground || undefined);
    setApplied(true);
    toast(appliedMessage(preset.name, target));
  };

  return (
    <div className="space-y-3">
      <div className="text-[12.5px] text-ui-1">Saved looks</div>
      {api.presets.length === 0 && (
        <p className="text-[11px] leading-snug text-ui-4">Save the current theme, skin, style and background to reuse them.</p>
      )}
      <div className="grid grid-cols-3 gap-2">
        {api.presets.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            active={preset.id === activeId}
            onApply={() => apply(preset)}
            onRename={(name) => api.rename(preset.id, name)}
            onDelete={() => api.remove(preset.id)}
          />
        ))}
      </div>
      {applied && widgets + profiles > 0 && (
        <OverridesBanner
          widgets={widgets}
          profiles={profiles}
          onFollow={() => {
            api.clearOverrides(target);
            setApplied(false);
          }}
          onDismiss={() => setApplied(false)}
        />
      )}
      <ToggleRow
        label="Replace the page background"
        hint="Otherwise a preset's background is only set where there is none"
        value={replaceBackground}
        onChange={setReplaceBackground}
      />
      {naming ? (
        <div className="flex items-center gap-1">
          <NameInput
            initial=""
            label="Look name"
            onDone={(name) => {
              setNaming(false);
              if (name) api.save(target, name);
            }}
          />
          <button type="button" className={ICON_BUTTON} onClick={() => setNaming(false)} title="Cancel" aria-label="Cancel">
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setNaming(true)}
          className="flex h-[30px] w-full items-center justify-center gap-1.5 rounded-[7px] border border-ui-strong bg-ui-raised text-[12px] text-ui-1 hover:bg-[#1e1e23]"
          title="Keep the current theme, style and background as a preset"
        >
          <BookmarkPlus className="h-4 w-4" />
          Save current look as preset
        </button>
      )}
    </div>
  );
}

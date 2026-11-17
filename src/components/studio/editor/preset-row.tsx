import { useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { FOCUS_RING } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { onRovingKeyDown } from "@/lib/roving";
import { cn } from "@/lib/utils";
import type { UserWidgetPreset } from "@/lib/widget-presets";
import type { DashboardModule, ModuleSettings } from "@/modules/types";
import { iconFor } from "@/widgets/core/icons";
import { gridPresets, type WidgetPreset } from "@/widgets/define";
import { userPreset } from "../widget-presets";
import { matchingPreset, presetChange, presetFromZone } from "./preset-model";

interface PresetRowProps {
  mod: DashboardModule;
  /** The widget's built-in presets (its presets.ts, else the one implicit default). */
  builtin: readonly WidgetPreset[];
  /** The user's saved presets for the widget. */
  saved: readonly UserWidgetPreset[];
  settings: ModuleSettings | undefined;
  /** The zone's size in cells (what Save as preset keeps). */
  size: [number, number];
  /** One undo step; `size` only when the user asked for the preset's size too. */
  onPick: (patch: ModuleSettings, clear: string[], size?: [number, number]) => void;
  onSave: (preset: UserWidgetPreset) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  /** Keep the widget's own style (Style tab › Save); unset when it has none. */
  onSaveStyle?: () => void;
}

const LINK = cn("rounded-ui-sm text-caption text-ui-accent-text hover:underline", FOCUS_RING);
const NAME_INPUT = "h-7 min-w-0 flex-1 rounded-md border border-ui-default bg-ui-app px-2 text-caption text-ui-1 outline-none placeholder:text-ui-4 focus:border-ui-accent";

interface NameFieldProps {
  label: string;
  initial: string;
  onDone: (name: string) => void;
  onCancel: () => void;
}

/** A name field: Enter keeps it, Escape (which stays off the studio's selection) and the cross give it up. */
function NameField({ label, initial, onDone, onCancel }: NameFieldProps) {
  const [name, setName] = useState(initial);
  const done = () => {
    if (name.trim()) onDone(name.trim());
  };
  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        aria-label={label}
        value={name}
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Enter") done();
          if (e.key === "Escape") onCancel();
        }}
        placeholder={label}
        className={NAME_INPUT}
      />
      <IconButton label="Save" size={26} disabled={!name.trim()} onClick={done}>
        <Check className="h-3 w-3" />
      </IconButton>
      <IconButton label="Cancel" size={26} onClick={onCancel}>
        <X className="h-3 w-3" />
      </IconButton>
    </div>
  );
}

/**
 * The inspector's Preset row (D-5, Q24, Phase 4): the widget's presets as tiles (the built-in ones, `presets.ts`), the zone's
 * match highlighted or "Custom", then the user's saved ones with rename and delete, and Save as preset. Picking writes the
 * preset's view and settings (the size only when "Also use the preset's size" is on); a placement's own view id never changes
 * by itself (G1). Saved styles are another list and stay under Style; the link goes there.
 */
export default function PresetRow({ mod, builtin, saved, settings, size, onPick, onSave, onRename, onDelete, onSaveStyle }: PresetRowProps) {
  const [naming, setNaming] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [withSize, setWithSize] = useState(false);
  // a rail preset fills a rail slot, not this zone
  const all = [...gridPresets(builtin), ...saved.map(userPreset)];
  const current = matchingPreset(mod, all, settings);
  const custom = all.length > 1 && !current;
  const Icon = iconFor(mod.icon);
  const pick = (p: WidgetPreset) => {
    const { patch, clear } = presetChange(mod, all, p, settings);
    onPick(patch, clear, withSize && p.size !== "rail" ? p.size : undefined);
  };
  return (
    <section data-testid="inspector-presets" className="flex flex-col gap-2 border-b border-ui-subtle px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-caption font-medium text-ui-3">
          Preset
          {custom && (
            <span data-testid="preset-custom" className="rounded-ui-sm border border-ui-strong px-1 py-px text-micro font-normal text-ui-3">
              Custom
            </span>
          )}
        </span>
        <span className="flex items-center gap-2">
          {onSaveStyle && (
            <button type="button" onClick={onSaveStyle} className={LINK}>
              Save as style
            </button>
          )}
          <button type="button" data-testid="preset-save" onClick={() => setNaming(true)} className={LINK}>
            Save as preset
          </button>
        </span>
      </div>
      {naming && (
        <NameField
          label="Preset name"
          initial=""
          onDone={(name) => {
            onSave(presetFromZone(mod, settings, size, `my-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, new Date().toISOString()));
            setNaming(false);
          }}
          onCancel={() => setNaming(false)}
        />
      )}
      {builtin.length > 1 && (
        <div role="radiogroup" aria-label="Preset" onKeyDown={(e) => onRovingKeyDown(e, '[role="radio"]')} className="grid grid-cols-3 gap-2">
          {builtin.map((p) => {
            const on = current?.id === p.id;
            return (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on || (!current && p.default) ? 0 : -1}
                title={p.blurb}
                onClick={() => !on && pick(p)}
                className={cn(
                  "flex h-16 min-w-0 flex-col items-center justify-center gap-1.5 rounded-ui-lg border px-1 transition-colors duration-(--ui-dur-fast) ease-ui",
                  FOCUS_RING,
                  on ? "border-ui-accent text-ui-1" : "border-ui-subtle text-ui-3 hover:border-ui-strong hover:text-ui-1"
                )}
              >
                <Icon className={cn("h-5 w-5 shrink-0", on ? "text-ui-accent" : "text-ui-hint")} strokeWidth={1.75} aria-hidden />
                <span className="max-w-full truncate text-micro">{p.name}</span>
              </button>
            );
          })}
        </div>
      )}
      {saved.length > 0 && (
        <div className="flex flex-col gap-0.5" role="group" aria-label="Your presets">
          <span className="pb-0.5 text-micro text-ui-hint">Yours</span>
          {saved.map((s) =>
            renaming === s.id ? (
              <NameField
                key={s.id}
                label="Preset name"
                initial={s.name}
                onDone={(name) => {
                  onRename(s.id, name);
                  setRenaming(null);
                }}
                onCancel={() => setRenaming(null)}
              />
            ) : (
              <div key={s.id} data-testid="saved-preset" className="flex h-8 items-center gap-1 rounded-ui-sm">
                <button
                  type="button"
                  aria-pressed={current?.id === s.id}
                  onClick={() => current?.id !== s.id && pick(userPreset(s))}
                  className={cn(
                    "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-ui-sm border px-2 text-left text-caption",
                    FOCUS_RING,
                    current?.id === s.id ? "border-ui-accent text-ui-1" : "border-transparent text-ui-2 hover:bg-ui-hover hover:text-ui-1"
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <span className="shrink-0 text-micro text-ui-hint">
                    {s.size[0]}×{s.size[1]}
                  </span>
                </button>
                <IconButton label={`Rename ${s.name}`} size={26} onClick={() => setRenaming(s.id)}>
                  <Pencil className="h-3 w-3" />
                </IconButton>
                <IconButton label={`Delete ${s.name}`} size={26} danger onClick={() => onDelete(s.id)}>
                  <Trash2 className="h-3 w-3" />
                </IconButton>
              </div>
            )
          )}
        </div>
      )}
      {all.length > 1 && (
        <label className="flex items-center gap-2 text-caption text-ui-3">
          <input type="checkbox" checked={withSize} onChange={(e) => setWithSize(e.target.checked)} />
          Also use the preset&apos;s size
        </label>
      )}
    </section>
  );
}

import { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { Check, ChevronRight, ClipboardPaste, Copy, MoreHorizontal } from "lucide-react";
import type { StylePreset } from "@/lib/layout";
import type { AppearanceTarget } from "./inspector/profile-scope";

interface StyleToolsProps {
  /** Something was copied (Paste is enabled). */
  canPaste: boolean;
  presets: StylePreset[];
  onCopy: () => void;
  onPaste: () => void;
  /** Make this widget's style the global style of every profile, or of this one. */
  onUseAsGlobal: (target: AppearanceTarget) => void;
  onSavePreset: (name: string) => void;
  onApplyPreset: (id: string) => void;
  onDeletePreset: (id: string) => void;
}

export const ICON_BUTTON =
  "flex h-6 w-6 items-center justify-center rounded-md border border-ui-strong text-ui-3 transition-colors hover:bg-ui-hover hover:text-ui-1 disabled:pointer-events-none disabled:opacity-40 data-popup-open:bg-ui-hover data-popup-open:text-ui-1";
export const POPUP =
  "min-w-40 rounded-[9px] border border-ui-menu bg-ui-raised p-1 font-ui text-[12.5px] text-ui-2 shadow-ui-menu outline-none";
export const ITEM =
  "flex h-[30px] cursor-default items-center justify-between gap-3 rounded-md px-2 outline-none select-none data-disabled:text-ui-5 data-highlighted:bg-ui-hover data-highlighted:text-ui-1 data-popup-open:bg-ui-hover";
export const SEPARATOR = "mx-1 my-1 h-px bg-ui-subtle";

/** A "▸" submenu listing the style presets. */
function PresetSubmenu({
  label,
  presets,
  onPick,
}: {
  label: string;
  presets: StylePreset[];
  onPick: (id: string) => void;
}) {
  return (
    <Menu.SubmenuRoot>
      <Menu.SubmenuTrigger className={ITEM} disabled={presets.length === 0}>
        {label} <ChevronRight className="h-3 w-3" />
      </Menu.SubmenuTrigger>
      <Menu.Portal>
        <Menu.Positioner className="z-50" sideOffset={4} alignOffset={-4}>
          <Menu.Popup className={POPUP}>
            {presets.map((p) => (
              <Menu.Item key={p.id} className={ITEM} onClick={() => onPick(p.id)}>
                {p.name}
              </Menu.Item>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.SubmenuRoot>
  );
}

/**
 * Inspector actions for a widget's look (the keys in `PROFILE_STYLE_KEYS`):
 * copy / paste it between widgets, and a "⋯" menu to make it the global
 * style (all profiles or this one) and keep named presets.
 */
export function StyleTools({
  canPaste,
  presets,
  onCopy,
  onPaste,
  onUseAsGlobal,
  onSavePreset,
  onApplyPreset,
  onDeletePreset,
}: StyleToolsProps) {
  // Non-null while the "Save as preset…" name input is shown.
  const [name, setName] = useState<string | null>(null);

  const save = () => {
    const trimmed = name?.trim();
    if (!trimmed) return;
    onSavePreset(trimmed);
    setName(null);
  };

  if (name !== null) {
    return (
      <div className="flex items-center gap-1">
        <input
          autoFocus
          aria-label="Style preset name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setName(null);
          }}
          onBlur={() => !name.trim() && setName(null)}
          placeholder="Preset name"
          className="h-6 w-28 rounded-md border border-ui-default bg-ui-app px-2 text-[12px] text-ui-1 outline-none placeholder:text-ui-4 focus:border-ui-accent"
        />
        <button
          type="button"
          className={ICON_BUTTON}
          disabled={!name.trim()}
          onClick={save}
          title="Save as preset"
        >
          <Check className="h-3 w-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <button type="button" className={ICON_BUTTON} onClick={onCopy} title="Copy this widget's style">
        <Copy className="h-3 w-3" />
      </button>
      <button
        type="button"
        className={ICON_BUTTON}
        onClick={onPaste}
        disabled={!canPaste}
        title="Paste style: replace this widget's style with the copied one"
      >
        <ClipboardPaste className="h-3 w-3" />
      </button>
      <Menu.Root>
        <Menu.Trigger className={ICON_BUTTON} title="More style actions">
          <MoreHorizontal className="h-3 w-3" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner className="z-50" sideOffset={4} align="end">
            <Menu.Popup className={POPUP}>
              <Menu.SubmenuRoot>
                <Menu.SubmenuTrigger className={ITEM}>
                  Use as global… <ChevronRight className="h-3 w-3" />
                </Menu.SubmenuTrigger>
                <Menu.Portal>
                  <Menu.Positioner className="z-50" sideOffset={4} alignOffset={-4}>
                    <Menu.Popup className={POPUP}>
                      <Menu.Item
                        className={ITEM}
                        onClick={() => onUseAsGlobal("all")}
                        title="Make this style the default for every widget in every profile"
                      >
                        All profiles
                      </Menu.Item>
                      <Menu.Item
                        className={ITEM}
                        onClick={() => onUseAsGlobal("profile")}
                        title="Make this style the default for every widget in this profile"
                      >
                        This profile
                      </Menu.Item>
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.SubmenuRoot>
              <Menu.Separator className={SEPARATOR} />
              <PresetSubmenu label="Apply preset" presets={presets} onPick={onApplyPreset} />
              <Menu.Item className={ITEM} onClick={() => setName("")}>
                Save as preset…
              </Menu.Item>
              <PresetSubmenu label="Delete preset" presets={presets} onPick={onDeletePreset} />
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}

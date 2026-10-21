import { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import { Image, MoreHorizontal } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import type { AppearancePreset } from "@/lib/appearance-presets";
import { THEME_PRESETS, type ThemePreset } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { AppearancePreview } from "./appearance-preview";
import { ITEM, POPUP, SEPARATOR } from "./menu-styles";
import { PaletteSwatch } from "./theme-start-from";
import type { AppearancePresetsApi } from "./use-appearance-presets";
import type { ThemeAt } from "./theme-cards";

const BUTTON =
  "flex h-7 shrink-0 items-center whitespace-nowrap rounded-[7px] border border-ui-strong px-2.5 text-[12px] text-ui-1 transition-colors hover:bg-ui-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent data-popup-open:bg-ui-hover";
const PANEL = "rounded-[10px] border border-ui-menu bg-ui-raised p-2.5 font-ui text-[12px] text-ui-2 shadow-ui-menu outline-none";
const LABEL = "px-0.5 pb-1 text-[11px] text-ui-4";

/** An inline name input (Enter commits, Esc cancels; blur commits when `commitOnBlur`). */
function NameInput({ initial, label, onDone, commitOnBlur = false }: { initial: string; label: string; onDone: (name: string | null) => void; commitOnBlur?: boolean }) {
  const [name, setName] = useState(initial);
  const commit = () => onDone(name.trim() || null);
  return (
    <input
      autoFocus
      value={name}
      onFocus={(e) => e.target.select()}
      onChange={(e) => setName(e.target.value)}
      onKeyDown={(e) => {
        // Keep Esc from also stepping the studio's selection out.
        e.stopPropagation();
        if (e.key === "Enter") commit();
        if (e.key === "Escape") onDone(null);
      }}
      onBlur={commitOnBlur ? commit : undefined}
      placeholder={label}
      aria-label={label}
      className="h-7 min-w-0 flex-1 rounded-md border border-ui-default bg-ui-app px-2 text-[12px] text-ui-1 outline-none placeholder:text-ui-4 focus:border-ui-accent"
    />
  );
}

function Check({ label, checked, disabled, note, onChange }: { label: string; checked: boolean; disabled?: boolean; note?: string; onChange: (on: boolean) => void }) {
  return (
    <label className={cn("flex items-center gap-2 text-[12px]", disabled ? "text-ui-5" : "text-ui-2")}>
      <input type="checkbox" checked={checked && !disabled} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="accent-[var(--ui-accent)]" />
      {label}
      {note && <span className="text-[11px] text-ui-5">{note}</span>}
    </label>
  );
}

/** A saved Theme's card: its preview, name and ⋯ (Rename…, Delete). */
function SavedCard({ preset, onApply, api }: { preset: AppearancePreset; onApply: () => void; api: AppearancePresetsApi }) {
  const [renaming, setRenaming] = useState(false);
  return (
    <div className="min-w-0">
      <button type="button" onClick={onApply} title={preset.name} aria-label={`Apply theme ${preset.name}`} className="block w-full rounded-md outline-none hover:ring-1 hover:ring-ui-strong focus-visible:ring-2 focus-visible:ring-ui-accent/60">
        <AppearancePreview preset={preset} />
      </button>
      <div className="mt-1 flex min-h-5 items-center gap-1">
        {renaming ? (
          <NameInput
            initial={preset.name}
            label="Theme name"
            commitOnBlur
            onDone={(name) => {
              setRenaming(false);
              if (name) api.rename(preset.id, name);
            }}
          />
        ) : (
          <button type="button" onClick={onApply} className="min-w-0 flex-1 truncate text-left text-[11.5px] text-[#b4b4bc]">
            {preset.name}
          </button>
        )}
        {preset.background && (
          <span title="Comes with a page background">
            <Image className="h-3 w-3 shrink-0 text-ui-4" />
          </span>
        )}
        {!renaming && (
          <Menu.Root>
            <Menu.Trigger className="rounded p-0.5 text-ui-4 hover:bg-ui-hover hover:text-ui-1 data-popup-open:bg-ui-hover" aria-label="Theme actions" title="Theme actions">
              <MoreHorizontal className="h-3 w-3" />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner className="z-[90]" sideOffset={4} align="end">
                <Menu.Popup className={POPUP}>
                  <Menu.Item className={ITEM} onClick={() => setRenaming(true)}>
                    Rename…
                  </Menu.Item>
                  <Menu.Separator className={SEPARATOR} />
                  <Menu.Item className={cn(ITEM, "text-ui-danger")} onClick={() => api.remove(preset.id)}>
                    Delete
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        )}
      </div>
    </div>
  );
}

interface ApplyThemeProps {
  at: ThemeAt;
  /** The scope's name for the toast. */
  scopeName: string;
  api: AppearancePresetsApi;
  /** A built-in palette applies the color tokens only (none at page scope: they are set per screen). */
  onPalette: (palette: ThemePreset) => void;
}

/**
 * "Apply a theme here…" (SPEC §7.1): the saved Themes and the built-in palettes, with Include background, applied at
 * the current scope as one undo step. A page takes a Theme's widget style only.
 */
export function ApplyTheme({ at, scopeName, api, onPalette }: ApplyThemeProps) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [background, setBackground] = useState(false);
  const page = at.level === "page";
  const done = (name: string) => {
    setOpen(false);
    toast(`Applied ${name} to ${scopeName}`);
  };
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className={BUTTON}>Apply a theme here…</Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6} className="z-[80]">
          <Popover.Popup className={cn(PANEL, "w-[320px] space-y-3")}>
            <div>
              <p className={LABEL}>Saved themes</p>
              {api.presets.length === 0 ? (
                <p className="px-0.5 text-[11.5px] text-ui-4">Themes you save appear here and in Library › Themes.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {api.presets.map((p) => (
                    <SavedCard
                      key={p.id}
                      preset={p}
                      api={api}
                      onApply={() => {
                        api.apply(p, at, !page && background);
                        done(p.name);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
            <div>
              <p className={LABEL}>Palettes{page && " · set per screen"}</p>
              <div className="grid grid-cols-3 gap-2">
                {THEME_PRESETS.map((p) => (
                  <button
                    key={p.name}
                    type="button"
                    disabled={page}
                    title={page ? "Set per screen" : `Apply ${p.label}`}
                    onClick={() => {
                      onPalette(p);
                      done(p.label);
                    }}
                    className="min-w-0 text-left outline-none disabled:opacity-40 [&:not(:disabled)>div]:hover:border-ui-3"
                  >
                    <div className="aspect-[16/10] overflow-hidden rounded-md border border-ui-strong">
                      <PaletteSwatch tokens={p.tokens} />
                    </div>
                    <div className="mt-1 truncate text-[11.5px] text-[#b4b4bc]">{p.label}</div>
                  </button>
                ))}
              </div>
            </div>
            <Check label="Include background" checked={background} disabled={page} note={page ? "Set per screen" : undefined} onChange={setBackground} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** "Save as Theme" (SPEC §7.1): the scope's resolved tokens, widget style and (optionally) background into Library › Themes. */
export function SaveTheme({ at, api }: { at: ThemeAt; api: AppearancePresetsApi }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [background, setBackground] = useState(true);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="flex h-7 shrink-0 items-center whitespace-nowrap rounded-[7px] bg-ui-inverse px-2.5 text-[12px] font-semibold text-ui-inverse-fg transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent">
        Save as Theme
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="end" sideOffset={6} className="z-[80]">
          <Popover.Popup className={cn(PANEL, "w-[280px] space-y-2.5")}>
            <p className="text-[11.5px] leading-snug text-ui-4">The colors, widget style and background this scope shows, saved to Library › Themes.</p>
            <NameInput
              initial=""
              label="Theme name"
              onDone={(name) => {
                setOpen(false);
                if (!name) return;
                api.save(at, name, background);
                toast(`Saved ${name} to Library › Themes`);
              }}
            />
            <Check label="Include background" checked={background} onChange={setBackground} />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

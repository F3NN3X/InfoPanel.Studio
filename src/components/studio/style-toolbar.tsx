import { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import { Check, ChevronDown, X } from "lucide-react";
import { BUILTIN_STYLES } from "@/lib/builtin-styles";
import type { StylePreset } from "@/lib/layout";
import type { ModuleSettings } from "@/modules/types";
import type { MakeThemeTarget } from "./inherit-chip";
import { ICON_BUTTON, ITEM, POPUP } from "./menu-styles";

interface StyleToolbarProps {
  /** The Styles saved in the Library (`config.stylePresets`). */
  saved: StylePreset[];
  /** The widget has a look of its own to save. */
  hasStyle: boolean;
  /** It has custom sections to move into a theme. */
  canMakeTheme: boolean;
  /** Write a Style's sections as the widget's own (`withPastedStyle`). */
  onApply: (settings: ModuleSettings) => void;
  onSave: (name: string) => void;
  onMakeTheme: (target: MakeThemeTarget) => void;
}

const BUTTON =
  "flex h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-[7px] border border-ui-strong bg-ui-raised px-2 text-[11.5px] font-medium text-ui-2 transition-colors hover:bg-ui-hover hover:text-ui-1 disabled:pointer-events-none disabled:opacity-40 data-popup-open:bg-ui-hover data-popup-open:text-ui-1";

const MAKE_THEME: { target: MakeThemeTarget; label: string }[] = [
  { target: "all", label: "All screens" },
  { target: "screen", label: "This screen" },
  { target: "page", label: "This page" },
];

const SURFACE_TILE: Record<string, string> = {
  "matte-dark": "#17171b",
  "matte-light": "#f1f1f3",
  glass: "linear-gradient(135deg,#2a2a35,#14141a)",
};

/** A Style's card: its surface and accent as a tiny tile, then its name. */
function StyleCard({ name, settings, onPick }: { name: string; settings: ModuleSettings; onPick: () => void }) {
  const surface = typeof settings.surface === "string" ? settings.surface : undefined;
  const accent = typeof settings.accent === "string" && settings.accent !== "" ? settings.accent : undefined;
  return (
    <button
      type="button"
      onClick={onPick}
      className="flex min-w-0 items-center gap-2 rounded-md border border-ui-subtle p-1.5 text-left text-[12px] text-ui-2 hover:bg-ui-hover hover:text-ui-1"
    >
      <span
        aria-hidden
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-ui-strong"
        style={{ background: (surface && SURFACE_TILE[surface]) || "transparent" }}
      >
        <span className="h-2 w-2 rounded-full bg-ui-accent" style={accent ? { background: accent } : undefined} />
      </span>
      <span className="truncate">{name}</span>
    </button>
  );
}

/**
 * The Style tab's toolbar (SPEC §6.3), one line: Start from a Style ▾ (the built-in Styles and the saved
 * ones; applying writes their sections as the widget's own), Save as Style (into Library › Styles) and
 * Make this the theme for… ▾.
 */
export function StyleToolbar({ saved, hasStyle, canMakeTheme, onApply, onSave, onMakeTheme }: StyleToolbarProps) {
  // Non-null while the "Save as Style" name input is shown.
  const [name, setName] = useState<string | null>(null);
  const [gallery, setGallery] = useState(false);
  const apply = (settings: ModuleSettings) => {
    setGallery(false);
    onApply(settings);
  };
  const save = () => {
    const trimmed = name?.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setName(null);
  };

  if (name !== null)
    return (
      <div className="flex items-center gap-1 px-4 pb-1 pt-3">
        <input
          autoFocus
          aria-label="Style name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            // Keep Esc from also stepping the studio's selection out.
            e.stopPropagation();
            if (e.key === "Enter") save();
            if (e.key === "Escape") setName(null);
          }}
          placeholder="Style name"
          className="h-7 min-w-0 flex-1 rounded-md border border-ui-default bg-ui-app px-2 text-[12px] text-ui-1 outline-none placeholder:text-ui-4 focus:border-ui-accent"
        />
        <button type="button" className={ICON_BUTTON} disabled={!name.trim()} onClick={save} title="Save to Library › Styles">
          <Check className="h-3 w-3" />
        </button>
        <button type="button" className={ICON_BUTTON} onClick={() => setName(null)} title="Cancel">
          <X className="h-3 w-3" />
        </button>
      </div>
    );

  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 px-4 pb-1 pt-3">
      <Popover.Root open={gallery} onOpenChange={setGallery}>
        <Popover.Trigger className={BUTTON}>
          Start from a Style <ChevronDown className="h-3 w-3 shrink-0" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner side="bottom" align="start" sideOffset={6} className="z-[80]">
            <Popover.Popup className="w-[264px] space-y-2 rounded-[9px] border border-ui-menu bg-ui-raised p-2 font-ui shadow-ui-menu outline-none">
              <div>
                <p className="px-0.5 pb-1 text-[11px] text-ui-4">Built-in</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {BUILTIN_STYLES.map((s) => (
                    <StyleCard key={s.id} name={s.name} settings={s.settings} onPick={() => apply(s.settings)} />
                  ))}
                </div>
              </div>
              <div>
                <p className="px-0.5 pb-1 text-[11px] text-ui-4">Saved</p>
                {saved.length === 0 ? (
                  <p className="px-0.5 pb-0.5 text-[11.5px] text-ui-4">Styles you save appear here and in Library.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5">
                    {saved.map((s) => (
                      <StyleCard key={s.id} name={s.name} settings={s.settings} onPick={() => apply(s.settings)} />
                    ))}
                  </div>
                )}
              </div>
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
      <button
        type="button"
        className={BUTTON}
        disabled={!hasStyle}
        onClick={() => setName("")}
        title={hasStyle ? "Keep this widget's own look in Library › Styles" : "This widget follows the theme: nothing of its own to save"}
      >
        Save as Style
      </button>
      <Menu.Root>
        <Menu.Trigger
          className={BUTTON}
          disabled={!canMakeTheme}
          title={canMakeTheme ? "Make this the theme for…" : "This widget follows the theme: nothing of its own to move"}
        >
          Make this the theme for… <ChevronDown className="h-3 w-3 shrink-0" />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner className="z-[80]" sideOffset={4} align="end">
            <Menu.Popup className={POPUP}>
              {MAKE_THEME.map((m) => (
                <Menu.Item key={m.target} className={ITEM} onClick={() => onMakeTheme(m.target)}>
                  {m.label}
                </Menu.Item>
              ))}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </div>
  );
}

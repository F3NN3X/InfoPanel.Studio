import { useState, type ReactNode } from "react";
import { Menu } from "@base-ui/react/menu";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import type { PageBackground } from "@/lib/appearance";
import type { AppearancePreset } from "@/lib/appearance-presets";
import type { ThemeTokens } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { AppearancePreview } from "./appearance-preview";
import { ITEM, SEPARATOR } from "./menu-styles";
import { ThemeNameInput } from "./theme-name-input";
import { BackgroundSwatch, TokenSwatches } from "./theme-swatches";
import { radiusPx, pxRadius, remText, type CardKind } from "./theme-view-model";

/** The theme card's ⋯ menu (SPEC §4.3.1): 260 px, #131316 on #3f3f46. */
const MENU = "w-[260px] rounded-[10px] border border-[#3f3f46] bg-ui-panel p-1 font-ui text-[12.5px] text-ui-2 shadow-[0_12px_32px_rgba(0,0,0,.6)] outline-none";
const LINK = "rounded-sm text-[12px] text-ui-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent";
const PRIMARY = "h-7 rounded-md bg-[#3b82f6] px-2.5 text-[12px] font-medium text-white hover:bg-[#2563eb] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent";

interface ThemeLookCardProps {
  /** The level's look as a theme, for the thumbnail. */
  preview: AppearancePreset;
  name: string;
  kind: CardKind;
  kindLine: string;
  /** Reset to ‹name› and its sub-text; none without a theme to go back to. */
  reset?: { text: string; onReset: () => void };
  /** Saved themes only. */
  onRename?: (name: string) => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  tokens: ThemeTokens;
  paletteName: string;
  skinName: string;
  radius: number;
  background: PageBackground | undefined;
  backgroundLabel: string;
  /** A page: the palette, corners and background are its screen's (read-only, with this note). */
  partsNote?: string;
  onPalette: () => void;
  onSkin: () => void;
  onRadius: (rem: number) => void;
  onBackground: () => void;
  /** Switch theme's counts ("2 saved · 55 from templates"). */
  counts: string;
  onSwitch: () => void;
}

/** One MADE OF row: the 78 px label, then its value; a button with › when it opens a picker. */
function PartRow({ label, onOpen, children }: { label: string; onOpen?: () => void; children: ReactNode }) {
  const body = (
    <>
      <span className="w-[78px] shrink-0 text-[12px] text-[#a1a1aa]">{label}</span>
      <span className="flex min-w-0 flex-1 items-center gap-2 text-[12px] text-ui-1">{children}</span>
      {onOpen && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ui-hint" aria-hidden />}
    </>
  );
  const row = "flex w-full items-center gap-2 border-t border-ui-raised px-3 py-[9px] text-left first:border-t-0";
  return onOpen ? (
    <button type="button" onClick={onOpen} className={cn(row, "hover:bg-ui-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ui-accent")}>
      {body}
    </button>
  ) : (
    <div className={row}>{body}</div>
  );
}

export interface ThemeUpdateBarProps {
  name: string;
  kind: CardKind;
  /** The Update bar: its text, and Update ‹name› for a saved theme. */
  update?: { text: string; onUpdate?: () => void };
  /** Save the look as a new theme (Save as theme, Save as new), named as typed; `saveName` is the name it offers. */
  onSave: (name: string) => void;
  saveName: string;
}

/**
 * The Update bar, in the preview's header beside the zoom: once a part of a theme changed, what Update changes, with
 * Update ‹name› (a saved theme) and Save as new; a custom or deleted look offers Save as theme. Nothing otherwise.
 */
export function ThemeUpdateBar(p: ThemeUpdateBarProps) {
  const [saving, setSaving] = useState(false);
  const saved = p.kind === "saved";
  if (!(saving || p.update !== undefined || p.kind === "custom" || p.kind === "deleted")) return null;
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-3 rounded-lg px-2.5 py-1 text-[12px]",
        p.update ? "border border-[#1e3a8a] bg-[#0b1530] text-[#bfdbfe]" : ""
      )}
    >
      {p.update && (
        <p className="min-w-0 truncate leading-snug" title={p.update.text}>
          {p.update.text}
        </p>
      )}
      {saving ? (
        <ThemeNameInput
          initial={p.saveName}
          label="Theme name"
          onDone={(name) => {
            setSaving(false);
            if (name) p.onSave(name);
          }}
        />
      ) : (
        <div className="flex shrink-0 items-center gap-3">
          {p.update?.onUpdate && (
            <button type="button" onClick={p.update.onUpdate} className={cn(PRIMARY, "max-w-[200px] truncate")}>
              Update {p.name}
            </button>
          )}
          <button type="button" onClick={() => setSaving(true)} className={saved ? LINK : PRIMARY}>
            {saved ? "Save as new" : "Save as theme"}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The theme card (handoff SPEC §4.3.1): the thumbnail, name, kind line and ⋯ (Reset to ‹name›, Rename, Duplicate,
 * Delete), the four parts it's MADE OF and Switch theme. The Update bar is the preview's (`ThemeUpdateBar`).
 */
export function ThemeLookCard(p: ThemeLookCardProps) {
  const [renaming, setRenaming] = useState(false);
  const nameField = (initial: string, label: string, done: (name: string) => void) => (
    <ThemeNameInput
      initial={initial}
      label={label}
      onDone={(name) => {
        setRenaming(false);
        if (name) done(name);
      }}
    />
  );
  return (
    <section data-nav-section="theme" className="flex flex-col gap-3.5 p-4">
      <div className="flex items-center gap-3">
        <AppearancePreview preset={p.preview} className="h-[60px] w-24 shrink-0 rounded-md" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          {renaming ? nameField(p.name, "Theme name", (name) => p.onRename?.(name)) : <h2 className="truncate text-[16px] font-semibold text-ui-1">{p.name}</h2>}
          <p className="truncate text-[12px] text-[#a1a1aa]">{p.kindLine}</p>
        </div>
        <Menu.Root>
          <Menu.Trigger
            aria-label="Theme actions"
            title="Theme actions"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-ui-strong text-ui-3 hover:bg-ui-hover hover:text-ui-1 data-popup-open:bg-ui-hover"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner className="z-[80]" sideOffset={4} align="end">
              <Menu.Popup className={MENU}>
                <Menu.Item className={cn(ITEM, "h-auto flex-col items-start gap-0.5 py-1.5")} disabled={!p.reset} onClick={p.reset?.onReset}>
                  <span>Reset to {p.reset ? p.name : "a theme"}</span>
                  <span className="text-[11px] leading-snug text-ui-hint">{p.reset?.text ?? "This look wasn't applied from a theme. Save it as one first."}</span>
                </Menu.Item>
                <Menu.Separator className={SEPARATOR} />
                <Menu.Item className={ITEM} disabled={!p.onRename} onClick={() => setRenaming(true)}>
                  Rename
                </Menu.Item>
                <Menu.Item className={ITEM} disabled={!p.onDuplicate} onClick={p.onDuplicate}>
                  Duplicate
                </Menu.Item>
                {p.onDelete && (
                  <Menu.Item className={cn(ITEM, "text-[#f87171]")} onClick={p.onDelete}>
                    Delete
                  </Menu.Item>
                )}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </div>
      <div className="overflow-hidden rounded-[9px] border border-ui-strong">
        <h3 className="border-b border-ui-raised px-3 py-1.5 font-ui-mono text-[10px] uppercase tracking-[0.08em] text-ui-hint">Made of</h3>
        <PartRow label="Palette" onOpen={p.partsNote ? undefined : p.onPalette}>
          <TokenSwatches tokens={p.tokens} />
          <span className="truncate">{p.paletteName}</span>
        </PartRow>
        <PartRow label="Skin" onOpen={p.onSkin}>
          <span className="block h-4 w-7 shrink-0 rounded-[3px] border" style={{ background: `hsl(${p.tokens.card})`, borderColor: `hsl(${p.tokens.border})` }} aria-hidden />
          <span className="truncate">{p.skinName}</span>
        </PartRow>
        <PartRow label="Corners">
          <input
            type="range"
            min={0}
            max={24}
            step={1}
            value={radiusPx(p.radius)}
            disabled={p.partsNote !== undefined}
            onChange={(e) => p.onRadius(pxRadius(Number(e.target.value)))}
            aria-label="Corners (px)"
            className="min-w-0 flex-1 accent-[#3b82f6] disabled:opacity-50"
          />
          <span className="w-16 shrink-0 whitespace-nowrap text-right font-ui-mono text-[11px] text-[#a1a1aa]">{remText(p.radius)}</span>
        </PartRow>
        <PartRow label="Background" onOpen={p.partsNote ? undefined : p.onBackground}>
          <BackgroundSwatch bg={p.background} tokens={p.tokens} />
          <span className="truncate">{p.backgroundLabel}</span>
        </PartRow>
        {p.partsNote && <p className="border-t border-ui-raised px-3 py-2 text-[11.5px] leading-snug text-ui-hint">{p.partsNote}</p>}
      </div>
      <button
        type="button"
        onClick={p.onSwitch}
        data-nav-section="start"
        className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-ui-strong text-[13px] font-medium text-ui-1 hover:bg-ui-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent"
      >
        Switch theme <span className="font-normal text-ui-hint">{p.counts}</span>
      </button>
    </section>
  );
}

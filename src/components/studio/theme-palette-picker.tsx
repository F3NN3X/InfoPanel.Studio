import { useEffect, useState, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { sameValues } from "@/lib/applied-theme";
import type { SavedPalette } from "@/lib/layout";
import { THEME_PRESETS, type ThemeTokens } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { ThemeNameInput } from "./theme-name-input";
import { GRID, Tile } from "./theme-part-pickers";
import { PickerShell } from "./theme-pickers";
import { PaletteSwatch } from "./theme-swatches";
import { paletteCounts } from "./theme-messages";

const ACTION = "rounded-sm text-[12px] text-[#60a5fa] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent";

interface PalettePickerProps {
  current: ThemeTokens;
  /** The user's palettes (`config.palettes`). */
  saved: readonly SavedPalette[];
  /** A saved palette's "used by" line. */
  usedBy: (tokens: ThemeTokens) => string;
  onPick: (name: string, tokens: ThemeTokens) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  /** + Save current colors as a palette. */
  onSaveCurrent: (name: string) => void;
  onBack: () => void;
}

/**
 * The Palette picker (handoff SPEC §4.3.3): the six built-ins as tiles (Zinc the built-in default), then the user's
 * palettes tagged Yours, each with ⋯ (who uses it, Rename, Duplicate, Delete) opening a panel under its row; the
 * footer counts both and saves the current colors as a palette.
 */
export function PalettePicker(p: PalettePickerProps) {
  const [menuFor, setMenuFor] = useState<string>();
  const [renaming, setRenaming] = useState<string>();
  const [saving, setSaving] = useState(false);
  // A rename belongs to the panel it was started in: closing or switching panels ends it.
  useEffect(() => setRenaming(undefined), [menuFor]);
  const same = (tokens: ThemeTokens) => sameValues(tokens, p.current);
  const open = p.saved.find((s) => s.id === menuFor);
  // The ⋯ panel spans the grid under the open tile's row (tiles count from 0, two per row).
  const openAt = open ? THEME_PRESETS.length + p.saved.indexOf(open) : -1;
  const rowEnd = Math.min(openAt + (openAt % 2 === 0 ? 1 : 0), THEME_PRESETS.length + p.saved.length - 1);

  const menu = open && (
    <div key="menu" className="col-span-2 flex flex-col gap-1.5 rounded-lg border border-ui-strong bg-[#131316] px-3 py-2">
      <p className="text-[11px] text-[#71717a]">{p.usedBy(open.tokens)}</p>
      {renaming === open.id ? (
        <ThemeNameInput
          initial={open.name}
          label="Palette name"
          onDone={(name) => {
            setRenaming(undefined);
            if (name) p.onRename(open.id, name);
          }}
        />
      ) : (
        <div className="flex gap-3">
          <button type="button" className={ACTION} onClick={() => setRenaming(open.id)}>
            Rename
          </button>
          <button type="button" className={ACTION} onClick={() => p.onDuplicate(open.id)}>
            Duplicate
          </button>
          <button
            type="button"
            className={cn(ACTION, "text-[#f87171]")}
            onClick={() => {
              setMenuFor(undefined);
              p.onDelete(open.id);
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );

  const tiles: ReactNode[] = [
    ...THEME_PRESETS.map((t) => (
      <Tile key={t.name} name={t.label} tag={t.name === "zinc" ? "Built-in default" : "Built-in"} selected={same(t.tokens)} onPick={() => p.onPick(t.label, t.tokens)}>
        <PaletteSwatch tokens={t.tokens} />
      </Tile>
    )),
    ...p.saved.map((s) => (
      <div key={s.id} className="relative grid min-w-0">
        <Tile name={s.name} tag="Yours" selected={same(s.tokens)} onPick={() => p.onPick(s.name, s.tokens)}>
          <PaletteSwatch tokens={s.tokens} />
        </Tile>
        <button
          type="button"
          aria-expanded={menuFor === s.id}
          aria-label={`${s.name} actions`}
          onClick={() => setMenuFor(menuFor === s.id ? undefined : s.id)}
          className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-black/50 text-[#d4d4d8] hover:bg-black/70 hover:text-ui-1"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>
    )),
  ];

  return (
    <PickerShell
      title="Palette"
      help="The 19 color tokens. Changing the palette keeps the skin, corners, background and fine-tune."
      onBack={p.onBack}
      footer={
        <div className="flex items-center gap-3 text-[12px]">
          <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[#71717a]">{paletteCounts(THEME_PRESETS.length, p.saved.length)}</span>
          {saving ? (
            <ThemeNameInput
              initial=""
              label="Palette name"
              onDone={(name) => {
                setSaving(false);
                if (name) p.onSaveCurrent(name);
              }}
            />
          ) : (
            <button type="button" onClick={() => setSaving(true)} className={cn(ACTION, "shrink-0")}>
              + Save current colors as a palette
            </button>
          )}
        </div>
      }
    >
      <div className={GRID}>{tiles.flatMap((t, i) => (i === rowEnd ? [t, menu] : [t]))}</div>
    </PickerShell>
  );
}

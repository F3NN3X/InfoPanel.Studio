import { useState } from "react";
import { Menu } from "@/components/ui/menu";
import { PopoverParts } from "@/components/ui/popover";
import { Bookmark, Copy, MoreHorizontal } from "lucide-react";
import { Button, FOCUS_RING } from "@/components/ui/button";
import type { AppearancePreset } from "@/lib/appearance-presets";
import { cn } from "@/lib/utils";
import { LookThumb } from "./look-thumb";
import ScreensList from "./theme-screens-list";
import { ThemeNameInput } from "./theme-name-input";
import type { CardKind } from "./theme-view-model";

interface ThemeLookCardProps {
  /** The level's theme as a preset, for the thumbnail. */
  preview: AppearancePreset;
  name: string;
  /** "Theme pack · 1 change". */
  kindLine: string;
  /** Change opens Browse themes. */
  onChange: () => void;
  /** A page: what it follows ("Main follows it"), in place of Change's neighbour. */
  note?: string;
}

/** The theme card (inspector top): the real-render thumbnail, the name, what it is and how much changed, and Change. */
export function ThemeLookCard({ preview, name, kindLine, onChange, note }: ThemeLookCardProps) {
  return (
    <section data-nav-section="theme" className="flex flex-col gap-3 px-5 pb-3 pt-5">
      <div className="flex items-center gap-3">
        <LookThumb preset={preview} width={64} className="rounded-ui-sm border border-ui-subtle" />
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h2 className="truncate text-head font-medium text-ui-1">{name}</h2>
          <p className="truncate text-caption text-ui-3" title={note ?? kindLine}>
            {note ?? kindLine}
          </p>
        </div>
        <Button onClick={onChange}>Change</Button>
      </div>
    </section>
  );
}

export interface ThemeSaveProps {
  name: string;
  kind: CardKind;
  /** What changed since the theme was applied, and Update ‹name› for a saved theme. */
  update?: { text: string; onUpdate?: () => void };
  /** Save as a new theme named as typed; `saveName` is the name it offers. */
  onSave: (name: string) => void;
  saveName: string;
}

/**
 * Save as my theme, in the header: a name field in place of the button, Enter saves. A saved theme with changes also
 * offers Update ‹name›; a saved theme that did not change offers nothing.
 */
export function ThemeSave({ name, kind, update, onSave, saveName }: ThemeSaveProps) {
  const [saving, setSaving] = useState(false);
  if (!(saving || update !== undefined || kind !== "saved")) return null;
  if (saving)
    return (
      <div className="flex w-56 items-center">
        <ThemeNameInput
          initial={saveName}
          label="Theme name"
          onDone={(n) => {
            setSaving(false);
            if (n) onSave(n);
          }}
        />
      </div>
    );
  return (
    <div className="flex items-center gap-2">
      {update?.onUpdate && (
        <Button className="max-w-50 truncate" onClick={update.onUpdate} title={update.text}>
          Update {name}
        </Button>
      )}
      <Button title="Save as my theme" icon={<Bookmark aria-hidden />} onClick={() => setSaving(true)}>
        <span className="max-xl:sr-only">Save as my theme</span>
      </Button>
    </div>
  );
}

export interface ThemeApplyScreensProps {
  /** The screen's theme. */
  name: string;
  /** The other screens, each with its size. */
  screens: readonly { id: string; name: string; size: string }[];
  /** Apply the theme to this screen and the ticked ones (one undo step). */
  onApply: (ids: string[]) => void;
}

/**
 * Apply to other screens…, beside Save as my theme (L47): a popover with a checkbox per screen and Apply, so saving a
 * look and wearing it on another screen is Theme, Save (Enter), Apply to other screens, a tick and Apply.
 */
export function ThemeApplyScreens({ name, screens, onApply }: ThemeApplyScreensProps) {
  const [open, setOpen] = useState(false);
  return (
    <PopoverParts.Root open={open} onOpenChange={setOpen}>
      <PopoverParts.Trigger render={<Button title={`Apply ${name} to other screens`} icon={<Copy aria-hidden />} />}>
        <span className="max-xl:sr-only">Apply to other screens…</span>
      </PopoverParts.Trigger>
      <PopoverParts.Content sideOffset={4} align="end" className="w-72 space-y-2 text-caption">
        <PopoverParts.Title className="font-medium text-ui-1">Apply {name} to</PopoverParts.Title>
        <ScreensList
          screens={screens}
          onApply={(ids) => {
            setOpen(false);
            onApply(ids);
          }}
        />
      </PopoverParts.Content>
    </PopoverParts.Root>
  );
}

interface ThemeActionsProps {
  /** Reset to ‹name› and its sub-text; none without a theme to go back to. */
  reset?: { name: string; text: string; onReset: () => void };
  /** Saved themes only. */
  onRename?: (name: string) => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  /** Lock all / Unlock all at Screen level. */
  lock?: { on: boolean; screen: string; onToggle: () => void };
}

/** The header's ⋯ menu: Reset to the theme, Rename, Duplicate, Delete, and Lock all. */
export function ThemeActions({ reset, onRename, onDuplicate, onDelete, lock }: ThemeActionsProps) {
  const [renaming, setRenaming] = useState(false);
  if (renaming && onRename)
    return (
      <div className="flex w-56 items-center">
        <ThemeNameInput
          initial=""
          label="Theme name"
          onDone={(n) => {
            setRenaming(false);
            if (n) onRename(n);
          }}
        />
      </div>
    );
  return (
    <Menu.Root>
      <Menu.Trigger aria-label="Theme actions" title="Theme actions" className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-ui-md text-ui-3 hover:bg-ui-raised hover:text-ui-1 data-popup-open:bg-ui-raised data-popup-open:text-ui-1", FOCUS_RING)}>
        <MoreHorizontal className="h-4 w-4" strokeWidth={1.5} />
      </Menu.Trigger>
      <Menu.Content sideOffset={4} align="end" className="w-70">
        <Menu.Item className="h-auto flex-col items-start gap-0.5 py-1.5" disabled={!reset} onClick={reset?.onReset}>
          <span>Reset to {reset ? reset.name : "a theme"}</span>
          <span className="text-caption leading-snug text-ui-3">{reset?.text ?? "This was not applied from a theme. Save it first."}</span>
        </Menu.Item>
        <Menu.Separator />
        <Menu.Item disabled={!onRename} onClick={() => setRenaming(true)}>
          Rename
        </Menu.Item>
        <Menu.Item disabled={!onDuplicate} onClick={onDuplicate}>
          Duplicate
        </Menu.Item>
        {lock && (
          <Menu.Item onClick={lock.onToggle}>
            {lock.on ? "Unlock all" : "Lock all"}
            <span className="text-caption text-ui-3">{lock.on ? `Unlock every section of ${lock.screen}` : `Force every section on ${lock.screen}`}</span>
          </Menu.Item>
        )}
        {onDelete && (
          <>
            <Menu.Separator />
            <Menu.Item danger onClick={onDelete}>
              Delete
            </Menu.Item>
          </>
        )}
      </Menu.Content>
    </Menu.Root>
  );
}

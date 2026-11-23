/**
 * The editor's bar (spec §5, the page's title bar): back and the "Gauges ›" breadcrumb, the name (renamed in place), what saving it
 * means (a "Draft · saved" chip), one undo and redo, Export and Save to library. Import, Save as new and Discard
 * draft are in the menu. An image sequence has no spec to import or export.
 */
import { ArrowLeft, ChevronRight, Download, MoreHorizontal, Pencil, Redo2, Save, Undo2, Upload } from "lucide-react";
import { useState } from "react";
import { Menu } from "@/components/ui/menu";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { StatusChip, type StatusTone } from "@/components/ui/status-chip";
import { BarFill, PageBar } from "@/components/studio/page-bar";
import { KIND_LABEL, kindOf } from "@/lib/gauge-studio/model";
import type { VectorGauge } from "@/lib/infopanel/gauges/vector";
import type { GaugeEdit } from "./use-gauge-edit";

export interface EditorHistory {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export interface EditorHeaderProps {
  edit: GaugeEdit;
  /** The spec being edited; null for an image sequence. */
  gauge: VectorGauge | null;
  saving: boolean;
  /** Undo and redo: the working copy's own, or the studio's for a gauge that writes through. */
  history: EditorHistory | null;
  onBack: () => void;
  /** The Import door (a gauge file lands in Gauges). */
  onImport?: () => void;
  onExport?: () => void;
  onSave: () => void;
  /** Save as new "<name> copy"; absent when there is no item to fork (Save already creates one). */
  onSaveAsNew?: (() => void) | null;
  /** Asks to delete the draft; absent when the gauge is not one. */
  onDiscardDraft?: (() => void) | null;
}

/** What saving this gauge means right now: the chip's tone, word and the reason behind it. */
export function savedState(edit: GaugeEdit): { tone: StatusTone; text: string; tip: string } {
  if (edit.writeThrough) return { tone: "neutral", text: "Saved", tip: "Changes go straight to the screen it is on" };
  if (edit.draft) {
    return edit.dirty
      ? { tone: "warn", text: "Draft · saving", tip: "Your edits are being saved to your library" }
      : { tone: "neutral", text: "Draft · saved", tip: "Saved to your library as you edit. Save to library keeps it; Discard draft deletes it" };
  }
  if (edit.dirty) return { tone: "warn", text: "Unsaved changes", tip: "Not in your library yet. Save to library, or leaving asks first" };
  if (edit.origin) return { tone: "neutral", text: "Saved", tip: "This is the gauge in your library" };
  return { tone: "neutral", text: "Not saved yet", tip: "Your first edit saves it to your library as a draft" };
}

/** Where the gauge lives (a profile gauge's canvas or page and the item Save updates, "My library"). */
function where(edit: GaugeEdit): string {
  const place = edit.writeThrough && edit.entry ? `${edit.entry.where}${edit.saveTo ? ` · Saves to ${edit.saveTo}` : ""}` : edit.origin?.kind === "library" ? "My library" : null;
  return place ? ` · ${place}` : "";
}

export function EditorHeader({ edit, gauge, saving, history, onBack, onImport, onExport, onSave, onSaveAsNew, onDiscardDraft }: EditorHeaderProps) {
  // What's typed while the field has focus: a profile gauge's name reads back with a fallback ("Custom gauge") when
  // emptied, which would otherwise snap into the field mid-edit.
  const [draft, setDraft] = useState<string | null>(null);
  const chip = savedState(edit);
  const hasMenu = !!(onImport || onSaveAsNew || onDiscardDraft);
  return (
    <PageBar>
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1">
        <IconButton label="Back to Gauges" size={32} onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </IconButton>
        <button type="button" onClick={onBack} className="h-8 rounded-ui-sm px-1.5 text-body text-ui-3 hover:text-ui-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent max-xl:hidden">
          Gauges
        </button>
        <ChevronRight className="h-4 w-4 shrink-0 text-ui-hint max-xl:hidden" aria-hidden />
        <label className="relative flex min-w-0 items-center">
          <input
            aria-label="Gauge name"
            value={draft ?? edit.name}
            onFocus={() => setDraft(edit.name)}
            onBlur={() => setDraft(null)}
            onChange={(e) => {
              setDraft(e.target.value);
              edit.rename(e.target.value);
            }}
            className="h-8 w-55 min-w-0 shrink rounded-ui-sm border border-transparent bg-transparent pl-1.5 pr-7 text-title font-medium text-ui-1 outline-none hover:border-ui-strong focus:border-ui-accent"
          />
          <Pencil className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-ui-hint" aria-hidden />
        </label>
      </nav>
      <span title={chip.tip}>
        <StatusChip tone={chip.tone} dot={false} className="border border-ui-strong bg-transparent">
          {chip.text}
        </StatusChip>
      </span>
      <span className="hidden truncate font-ui-mono text-micro text-ui-4 xl:inline">
        {KIND_LABEL[kindOf(gauge)]}
        {where(edit)}
      </span>
      <BarFill />
      {history && (
        <>
          <IconButton label="Undo (Ctrl+Z)" size={32} disabled={!history.canUndo} onClick={history.undo}>
            <Undo2 className="h-4 w-4" />
          </IconButton>
          <IconButton label="Redo (Ctrl+Shift+Z)" size={32} disabled={!history.canRedo} onClick={history.redo}>
            <Redo2 className="h-4 w-4" />
          </IconButton>
          <span aria-hidden className="h-5 w-px bg-ui-subtle" />
        </>
      )}
      <span title={onExport ? undefined : "An image sequence has no spec to export"}>
        <Button onClick={onExport} disabled={!onExport} title={onExport ? "Export" : undefined} icon={<Upload strokeWidth={1.5} />}>
          <span className="max-xl:sr-only">Export</span>
        </Button>
      </span>
      <Button variant="primary" onClick={onSave} disabled={saving} icon={<Save strokeWidth={1.5} />}>
        Save to library
      </Button>
      {hasMenu && (
        <Menu.Root>
          <Menu.Trigger aria-label="More gauge actions" className="grid h-8 w-8 place-items-center rounded-ui-md text-ui-3 hover:bg-ui-raised hover:text-ui-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent data-popup-open:bg-ui-raised">
            <MoreHorizontal className="h-4 w-4" />
          </Menu.Trigger>
          <Menu.Content sideOffset={6} align="end">
            {onImport && (
              <Menu.Item onClick={onImport}>
                <span className="flex items-center gap-2">
                  <Download className="h-4 w-4 text-ui-3" aria-hidden /> Import a gauge
                </span>
              </Menu.Item>
            )}
            {onSaveAsNew && (
              <Menu.Item disabled={saving} onClick={onSaveAsNew}>
                Save as new
              </Menu.Item>
            )}
            {onDiscardDraft && (
              <>
                <div role="separator" />
                <Menu.Item danger onClick={onDiscardDraft}>
                  Discard draft
                </Menu.Item>
              </>
            )}
          </Menu.Content>
        </Menu.Root>
      )}
    </PageBar>
  );
}

/** The editor's header (spec §6): back, name and kind, undo/redo of a working copy, Import, Export, Save to library. An image sequence has no spec to import or export. */
import { ArrowLeft, Copy, Download, Redo2, Save, Undo2, Upload } from "lucide-react";
import { useState } from "react";
import { IconButton } from "@/components/ui/icon-button";
import { KIND_LABEL, kindOf } from "@/lib/gauge-studio/model";
import type { VectorGauge } from "@/lib/infopanel/gauges/vector";
import type { GaugeEdit } from "./use-gauge-edit";

const BUTTON = "flex h-[34px] items-center gap-1.5 rounded-[8px] border border-ui-default px-3 text-[12.5px] text-ui-1 hover:bg-ui-hover disabled:pointer-events-none disabled:opacity-40";

export interface EditorHeaderProps {
  edit: GaugeEdit;
  /** The spec being edited; null for an image sequence. */
  gauge: VectorGauge | null;
  saving: boolean;
  onBack: () => void;
  /** The Import door (a gauge file lands in Library › Gauges). */
  onImport?: () => void;
  onExport?: () => void;
  onSave: () => void;
  /** Save as new "<name> copy"; absent when there is no item to fork (Save already creates one). */
  onSaveAsNew?: (() => void) | null;
}

/** Where the gauge lives (a profile gauge's canvas or page and the item Save updates, "My library"), else whether the working copy is unsaved. */
function where(edit: GaugeEdit): string {
  const place = edit.writeThrough && edit.entry ? `${edit.entry.where}${edit.saveTo ? ` · Saves to ${edit.saveTo}` : ""}` : edit.origin?.kind === "library" ? "My library" : null;
  return `${place ? ` · ${place}` : ""}${edit.dirty ? " · unsaved" : ""}`;
}

export function EditorHeader({ edit, gauge, saving, onBack, onImport, onExport, onSave, onSaveAsNew }: EditorHeaderProps) {
  const history = edit.history;
  // What's typed while the field has focus: a profile gauge's name reads back with a fallback ("Custom gauge") when
  // emptied, which would otherwise snap into the field mid-edit.
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-ui-subtle bg-ui-chrome px-4 font-ui">
      <IconButton label="Back to Gauges" size={32} onClick={onBack}>
        <ArrowLeft className="h-4 w-4" />
      </IconButton>
      <input
        aria-label="Gauge name"
        value={draft ?? edit.name}
        onFocus={() => setDraft(edit.name)}
        onBlur={() => setDraft(null)}
        onChange={(e) => {
          setDraft(e.target.value);
          edit.rename(e.target.value);
        }}
        className="h-8 w-[240px] min-w-0 rounded-[6px] border border-transparent bg-transparent px-1.5 text-[14px] font-semibold text-ui-1 outline-none hover:border-ui-default focus:border-ui-accent"
      />
      <span className="font-ui-mono text-[11px] text-ui-4">
        {KIND_LABEL[kindOf(gauge)]}
        {where(edit)}
      </span>
      <span className="flex-1" />
      {history && (
        <>
          <IconButton label="Undo (Ctrl+Z)" size={32} disabled={!history.canUndo} onClick={history.undo}>
            <Undo2 className="h-4 w-4" />
          </IconButton>
          <IconButton label="Redo (Ctrl+Shift+Z)" size={32} disabled={!history.canRedo} onClick={history.redo}>
            <Redo2 className="h-4 w-4" />
          </IconButton>
        </>
      )}
      {onImport && (
        <button type="button" onClick={onImport} className={BUTTON}>
          <Download className="h-4 w-4" /> Import
        </button>
      )}
      <button
        type="button"
        onClick={onExport}
        disabled={!onExport}
        title={onExport ? undefined : "An image sequence has no spec to export: its frames go out with the .infopanel export"}
        className={BUTTON}
      >
        <Upload className="h-4 w-4" /> Export
      </button>
      {onSaveAsNew && (
        <button type="button" onClick={onSaveAsNew} disabled={saving} className={BUTTON}>
          <Copy className="h-4 w-4" /> Save as new
        </button>
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={saving}
        className="flex h-[34px] items-center gap-1.5 rounded-[8px] bg-ui-inverse px-3 text-[12.5px] font-medium text-ui-inverse-fg hover:opacity-90 disabled:opacity-50"
      >
        <Save className="h-4 w-4" /> Save to library
      </button>
    </header>
  );
}

/** The editor's header (spec §6): back, name and kind, undo/redo of a working copy, Import, Export, Save to library. An image sequence has no spec to import or export. */
import { ArrowLeft, Redo2, Save, Undo2, Upload } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import type { ImportedGauge } from "@/lib/gauge-studio/import-file";
import { KIND_LABEL, kindOf } from "@/lib/gauge-studio/model";
import type { VectorGauge } from "@/lib/infopanel/gauges/vector";
import { ImportGaugeButton } from "./gauge-files";
import type { GaugeEdit } from "./use-gauge-edit";

const BUTTON = "flex h-[34px] items-center gap-1.5 rounded-[8px] border border-ui-default px-3 text-[12.5px] text-ui-1 hover:bg-ui-hover disabled:pointer-events-none disabled:opacity-40";

export interface EditorHeaderProps {
  edit: GaugeEdit;
  /** The spec being edited; null for an image sequence. */
  gauge: VectorGauge | null;
  saving: boolean;
  onBack: () => void;
  onImported?: (got: ImportedGauge) => void;
  onExport?: () => void;
  onSave: () => void;
}

export function EditorHeader({ edit, gauge, saving, onBack, onImported, onExport, onSave }: EditorHeaderProps) {
  const history = edit.history;
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-ui-subtle bg-ui-chrome px-4 font-ui">
      <IconButton label="Back to Gauges" size={32} onClick={onBack}>
        <ArrowLeft className="h-4 w-4" />
      </IconButton>
      <input
        aria-label="Gauge name"
        value={edit.name}
        disabled={edit.writeThrough}
        title={edit.writeThrough ? "A gauge in the profile is named where it is placed" : undefined}
        onChange={(e) => edit.rename(e.target.value)}
        className="h-8 w-[240px] min-w-0 rounded-[6px] border border-transparent bg-transparent px-1.5 text-[14px] font-semibold text-ui-1 outline-none hover:border-ui-default focus:border-ui-accent disabled:hover:border-transparent"
      />
      <span className="font-ui-mono text-[11px] text-ui-4">
        {KIND_LABEL[kindOf(gauge)]}
        {edit.writeThrough && edit.entry ? ` · ${edit.entry.where}` : edit.dirty ? " · unsaved" : ""}
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
      {onImported && <ImportGaugeButton label="Import" onImported={onImported} className={BUTTON} />}
      <button
        type="button"
        onClick={onExport}
        disabled={!onExport}
        title={onExport ? undefined : "An image sequence has no spec to export: its frames go out with the .infopanel export"}
        className={BUTTON}
      >
        <Upload className="h-4 w-4" /> Export
      </button>
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

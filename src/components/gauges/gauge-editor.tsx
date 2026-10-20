/**
 * The gauge editor (spec §6). A vector gauge: header, preset strip, parts list, preview stage and the
 * selected part's inspector (a canvas gauge adds the bake bar). An image sequence: the preview with its
 * frame filmstrip and the frame tools. A profile gauge writes through to the config; anything else is a
 * working copy with its own undo, and leaving it with changes asks first.
 */
import { useImperativeHandle, useState, type ReactNode, type Ref } from "react";
import type { StudioBridge } from "@/components/library/library-actions";
import { normalizeGauge, type VectorGauge } from "@/lib/infopanel/gauges/vector";
import { NO_RECOLOUR, recolourFilter } from "@/lib/infopanel/gauges/raster";
import type { ImportedGauge } from "@/lib/gauge-studio/import-file";
import type { GaugeEntry, GaugeSource } from "@/lib/gauge-studio/model";
import type { EditorOpen } from "@/lib/gauge-studio/open";
import { selectable, type PartId } from "@/lib/gauge-studio/parts";
import { previewScope, themeNameOf } from "@/lib/gauge-studio/preview";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import type { LibraryItem } from "@/lib/library";
import type { ThemeTokens } from "@/lib/theme";
import { BakeBar } from "./bake-bar";
import { EditorHeader } from "./editor-header";
import { useEditorShell, type EditorHandle, type WriteOptions } from "./editor-shell";
import { EditorStage } from "./editor-stage";
import { FramesInspector } from "./frames-inspector";
import { FramesStage } from "./frames-stage";
import type { FramesTools } from "./frames-tools";
import { downloadSpec } from "./gauge-files";
import { PartInspector } from "./inspector/part-inspector";
import { PartsList } from "./parts-list";
import { PresetStrip } from "./preset-strip";
import { saveGauge } from "./save-gauge";
import { useCanvasFrames } from "./use-canvas-frames";
import { useGaugeEdit, type GaugeEdit } from "./use-gauge-edit";
import { useGaugeKeys } from "./use-gauge-keys";
import { useLibraryFrames } from "./use-library-frames";
import { usePlayback } from "./use-playback";

export type { EditorHandle };

export interface GaugeEditorProps {
  ref?: Ref<EditorHandle>;
  bridge: StudioBridge;
  open: EditorOpen;
  /** Which opened editor this is: its working copy is kept under it while the page is closed. */
  editorId: number;
  theme: ThemeTokens;
  onBack: () => void;
  /** A gauge was saved to My library: reload the list. */
  onSaved: () => void;
}

export function GaugeEditor(props: GaugeEditorProps) {
  const { open } = props;
  if (open.kind === "frames") return <LibraryFramesEditor {...props} open={open} />;
  return <GaugeInPlaceEditor {...props} open={open} />;
}

function Gone({ ref, onBack }: { ref?: Ref<EditorHandle>; onBack: () => void }) {
  useImperativeHandle(ref, () => ({ requestBack: (then) => (then ?? onBack)() }), [onBack]);
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 bg-ui-app font-ui text-center">
      <p className="text-[12.5px] text-ui-3">This gauge is no longer on the page.</p>
      <button type="button" onClick={onBack} className="h-[34px] rounded-[8px] border border-ui-default px-3 text-[12.5px] text-ui-1 hover:bg-ui-hover">
        Back to Gauges
      </button>
    </div>
  );
}

/** A profile gauge or a copy of a spec: the parts editor, or (a canvas image sequence) the frames editor. */
function GaugeInPlaceEditor(props: GaugeEditorProps & { open: Extract<EditorOpen, { kind: "profile" | "copy" }> }) {
  const { bridge, open, editorId, ref, onBack } = props;
  const edit = useGaugeEdit(bridge, open, editorId);
  const entry = edit.entry;
  const canvas = open.kind === "profile" && open.source.kind === "canvas" ? open.source : null;
  const write = (g: VectorGauge | null) => (o?: WriteOptions) =>
    saveGauge({ name: edit.name, gauge: g, itemId: edit.origin?.itemId, from: entry ?? undefined, link: edit.link ?? undefined, ...o });

  if (edit.gauge) {
    const bakeBar = canvas && entry ? <BakeBar bridge={bridge} source={canvas} entry={entry} gauge={edit.gauge} /> : null;
    return <VectorEditor {...props} edit={edit} gauge={edit.gauge} write={write(edit.gauge)} below={bakeBar} />;
  }
  const stored = canvas ? bridge.profile.placements.find((z) => z.id === canvas.zoneId)?.canvas : undefined;
  if (!canvas || !entry || !stored) return <Gone ref={ref} onBack={onBack} />;
  return <CanvasFramesEditor {...props} edit={edit} entry={entry} source={canvas} stored={stored} write={write(null)} />;
}

function CanvasFramesEditor(
  p: GaugeEditorProps & {
    edit: GaugeEdit;
    entry: GaugeEntry;
    source: Extract<GaugeSource, { kind: "canvas" }>;
    stored: StoredCanvas;
    write: (o?: WriteOptions) => Promise<LibraryItem>;
  },
) {
  const tools = useCanvasFrames(p.bridge, p.entry, p.source, p.stored);
  // Frames the asset store can't name can't go to the library.
  const write = (o?: WriteOptions) => (p.entry.files ? p.write(o) : Promise.reject(new Error("some frames are not files in the asset store")));
  return <FramesEditor ref={p.ref} edit={p.edit} tools={tools} write={write} onBack={p.onBack} onSaved={p.onSaved} />;
}

function LibraryFramesEditor(props: GaugeEditorProps & { open: Extract<EditorOpen, { kind: "frames" }> }) {
  const lib = useLibraryFrames(props.open, props.editorId);
  const g = lib.edit.gauge;
  return g ? (
    <VectorEditor {...props} edit={lib.edit} gauge={g} write={lib.save} />
  ) : (
    <FramesEditor ref={props.ref} edit={lib.edit} tools={lib.tools} write={lib.save} onBack={props.onBack} onSaved={props.onSaved} />
  );
}

interface FramesEditorProps {
  ref?: Ref<EditorHandle>;
  edit: GaugeEdit;
  tools: FramesTools;
  write: (o?: WriteOptions) => Promise<LibraryItem>;
  onBack: () => void;
  onSaved: () => void;
}

function FramesEditor({ ref, edit, tools, write, onBack, onSaved }: FramesEditorProps) {
  const playback = usePlayback();
  const [recolour, setRecolour] = useState(NO_RECOLOUR);
  const shell = useEditorShell({ ref, edit, write, onBack, onSaved });
  useGaugeKeys({ history: edit.history ?? undefined });
  const filter = recolour === NO_RECOLOUR ? undefined : recolourFilter(recolour);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-ui-app">
      <EditorHeader edit={edit} gauge={null} saving={shell.saving} onBack={() => shell.requestBack()} onSave={() => void shell.save()} onSaveAsNew={shell.saveAsNew && (() => void shell.saveAsNew?.())} />
      <div className="flex min-h-0 flex-1 max-[899px]:flex-col max-[899px]:overflow-y-auto">
        <FramesStage tools={tools} playback={playback} filter={filter} />
        <FramesInspector tools={tools} recolour={recolour} onRecolour={setRecolour} />
      </div>
      {shell.dialog}
    </div>
  );
}

interface VectorEditorProps extends GaugeEditorProps {
  edit: GaugeEdit;
  gauge: VectorGauge;
  write: (o?: WriteOptions) => Promise<LibraryItem>;
  /** Under the editor: the bake bar of a canvas gauge. */
  below?: ReactNode;
}

function VectorEditor({ ref, edit, gauge: g, write, below, theme, onBack, onSaved }: VectorEditorProps) {
  const playback = usePlayback();
  const [part, setPart] = useState<PartId>("shape");
  const shell = useEditorShell({ ref, edit, write, onBack, onSaved });
  useGaugeKeys({ history: edit.history ?? undefined });

  const pick = (preset: GaugeEntry) => {
    edit.commit(normalizeGauge(preset.gauge));
    if (!edit.writeThrough) edit.rename(`${preset.name} copy`);
  };
  const imported = (got: ImportedGauge) => {
    edit.commit(got.gauge);
    if (!edit.writeThrough) edit.rename(got.name);
  };
  const set = (next: VectorGauge, key?: string) => edit.commit(next, key);
  const scope = previewScope(theme);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-ui-app">
      <EditorHeader edit={edit} gauge={g} saving={shell.saving} onBack={() => shell.requestBack()} onImported={imported} onExport={() => downloadSpec(edit.name, g)} onSave={() => void shell.save()} onSaveAsNew={shell.saveAsNew && (() => void shell.saveAsNew?.())} />
      <PresetStrip scope={scope} onPick={pick} />
      <div className="flex min-h-0 flex-1 max-[899px]:flex-col max-[899px]:overflow-y-auto">
        <PartsList g={g} selected={selectable(g, part)} onSelect={setPart} set={set} />
        <EditorStage gauge={g} playback={playback} scope={scope} themeName={themeNameOf(theme)} />
        <PartInspector part={selectable(g, part)} g={g} set={set} />
      </div>
      {below}
      {shell.dialog}
    </div>
  );
}

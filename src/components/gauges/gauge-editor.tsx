/**
 * The gauge editor (spec §5). A vector gauge: header, parts list, preview stage (Change preset, the range
 * labelled, play) and the selected part's inspector with Value range and Colour zones. An image sequence: the preview with its
 * frame filmstrip and the frame tools. A profile gauge writes through to the config; anything else is a
 * working copy with its own undo, and leaving it with changes asks first.
 */
import { useImperativeHandle, useState, type Ref } from "react";
import type { StudioBridge } from "@/components/library/library-actions";
import { normalizeGauge, type VectorGauge } from "@/lib/infopanel/gauges/vector";
import { NO_RECOLOUR, recolourFilter } from "@/lib/infopanel/gauges/raster";
import { zoneOf, type GaugeEntry, type GaugeSource } from "@/lib/gauge-studio/model";
import type { EditorOpen } from "@/lib/gauge-studio/open";
import { selectable, type PartId } from "@/lib/gauge-studio/parts";
import { readout } from "@/lib/gauge-studio/readout";
import { zoneRead } from "@/lib/gauge-studio/zones";
import { previewScope, themeNameOf } from "@/lib/gauge-studio/preview";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import type { LibraryItem } from "@/lib/library";
import type { ThemeTokens } from "@/lib/theme";
import { BarTitle, PageBar } from "@/components/studio/page-bar";
import { EditorHeader, type EditorHistory } from "./editor-header";
import { useEditorShell, type EditorHandle, type WriteOptions } from "./editor-shell";
import { EditorStage } from "./editor-stage";
import { FramesInspector } from "./frames-inspector";
import { FramesStage } from "./frames-stage";
import type { FramesTools } from "./frames-tools";
import { openExportSheet, openImportDoor } from "@/components/studio/file-doors";
import { PartInspector } from "./inspector/part-inspector";
import { PartsList } from "./parts-list";
import { saveGauge } from "./save-gauge";
import { useCanvasFrames } from "./use-canvas-frames";
import { useGaugeEdit, type GaugeEdit } from "./use-gauge-edit";
import { useGaugeKeys } from "./use-gauge-keys";
import { useLibraryFrames } from "./use-library-frames";
import { usePlayback, type Playback } from "./use-playback";
import { useGaugeView, useLiveReading } from "./use-gauge-view";

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
  /** Colour zones' "From <rule>": opens the alert rule. */
  onOpenRule: (ruleId: string) => void;
  /** The preview sensor picker's "Open data explorer". */
  onOpenSources: () => void;
}

/** One undo and redo in the header: the working copy's own, or the studio's for a gauge that writes through. */
function historyOf(edit: GaugeEdit, bridge: StudioBridge): EditorHistory | null {
  if (edit.history) return edit.history;
  return bridge.undo && bridge.redo ? { undo: bridge.undo, redo: bridge.redo, canUndo: bridge.canUndo ?? true, canRedo: bridge.canRedo ?? true } : null;
}

export function GaugeEditor(props: GaugeEditorProps) {
  const { open } = props;
  if (open.kind === "frames") return <LibraryFramesEditor {...props} open={open} />;
  return <GaugeInPlaceEditor {...props} open={open} />;
}

function Gone({ ref, onBack }: { ref?: Ref<EditorHandle>; onBack: () => void }) {
  useImperativeHandle(ref, () => ({ requestBack: (then) => (then ?? onBack)() }), [onBack]);
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-ui-app font-ui">
      <PageBar>
        <BarTitle title="Gauge editor" />
      </PageBar>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-body text-ui-3">This gauge is no longer on the page.</p>
        <button type="button" onClick={onBack} className="h-(--ui-h-field) rounded-ui-md border border-ui-default px-3 text-body text-ui-1 hover:bg-ui-hover">
          Back to Gauges
        </button>
      </div>
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
    return <VectorEditor {...props} edit={edit} gauge={edit.gauge} write={write(edit.gauge)} />;
  }
  const stored = canvas ? zoneOf(bridge.config, canvas.zoneId)?.canvas : undefined;
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
  return <FramesEditor ref={p.ref} bridge={p.bridge} editorId={p.editorId} edit={p.edit} tools={tools} write={write} onBack={p.onBack} onSaved={p.onSaved} />;
}

function LibraryFramesEditor(props: GaugeEditorProps & { open: Extract<EditorOpen, { kind: "frames" }> }) {
  const lib = useLibraryFrames(props.open, props.editorId);
  const g = lib.edit.gauge;
  return g ? (
    <VectorEditor {...props} edit={lib.edit} gauge={g} write={lib.save} />
  ) : (
    <FramesEditor ref={props.ref} bridge={props.bridge} editorId={props.editorId} edit={lib.edit} tools={lib.tools} write={lib.save} onBack={props.onBack} onSaved={props.onSaved} />
  );
}

interface FramesEditorProps {
  ref?: Ref<EditorHandle>;
  bridge: StudioBridge;
  editorId: number;
  edit: GaugeEdit;
  tools: FramesTools;
  write: (o?: WriteOptions) => Promise<LibraryItem>;
  onBack: () => void;
  onSaved: () => void;
}

function FramesEditor({ ref, bridge, editorId, edit, tools, write, onBack, onSaved }: FramesEditorProps) {
  const playback = usePlayback();
  const [recolour, setRecolour] = useState(NO_RECOLOUR);
  const shell = useEditorShell({ ref, editorId, edit, write, onBack, onSaved });
  useGaugeKeys({ history: edit.history ?? undefined });
  const filter = recolour === NO_RECOLOUR ? undefined : recolourFilter(recolour);
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-ui-app">
      <EditorHeader edit={edit} gauge={null} saving={shell.saving} history={historyOf(edit, bridge)} onBack={() => shell.requestBack()} onSave={() => void shell.save()} onSaveAsNew={shell.saveAsNew && (() => void shell.saveAsNew?.())} />
      <div className="flex min-h-0 flex-1 max-narrow:flex-col max-narrow:overflow-y-auto">
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
}

function VectorEditor({ ref, bridge, editorId, edit, gauge: g, write, theme, onBack, onSaved, onOpenRule, onOpenSources }: VectorEditorProps) {
  const sweep = usePlayback();
  const [view, setView] = useGaugeView();
  const [part, setPart] = useState<PartId>("shape");
  // The stage follows the preview sensor while it has a reading and "Live" is on; the scrubber and play take it back.
  const { min, max } = readout(g, 0);
  const sensor = useLiveReading(view, min, max);
  const following = view.live && sensor.p !== null;
  const playback: Playback = following
    ? {
        p: sensor.p!,
        playing: false,
        scrub: (v) => {
          setView({ live: false });
          sweep.scrub(v);
        },
        toggle: () => {
          setView({ live: false });
          sweep.toggle();
        },
      }
    : sweep;
  const zones = zoneRead(bridge.config.alerts?.rules ?? [], view.sensor, view.follow, g);
  const shell = useEditorShell({ ref, editorId, edit, write, onBack, onSaved });
  useGaugeKeys({ history: edit.history ?? undefined });

  const pick = (preset: GaugeEntry) => {
    edit.commit(normalizeGauge(preset.gauge));
    if (!edit.writeThrough) edit.rename(`${preset.name} copy`);
  };
  const set = (next: VectorGauge, key?: string) => edit.commit(next, key);
  const scope = previewScope(theme);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-ui-app">
      <EditorHeader edit={edit} gauge={g} saving={shell.saving} history={historyOf(edit, bridge)} onBack={() => shell.requestBack()} onImport={openImportDoor} onExport={() => openExportSheet({ row: "gauge", gauge: { name: edit.name, gauge: g } })} onSave={() => void shell.save()} onSaveAsNew={shell.saveAsNew && (() => void shell.saveAsNew?.())} onDiscardDraft={shell.discardDraft} />
      <div className="flex min-h-0 flex-1 max-narrow:flex-col max-narrow:overflow-y-auto">
        <PartsList g={g} selected={selectable(g, part)} onSelect={setPart} set={set} />
        <EditorStage gauge={g} playback={playback} scope={scope} themeName={themeNameOf(theme)} view={view} sensor={{ name: sensor.name, reading: sensor.p !== null, unit: sensor.unit }} zones={zones} onPickPreset={pick} onLive={(live) => setView({ live })} />
        <PartInspector part={selectable(g, part)} g={g} set={set} view={view} onView={setView} onOpenSources={onOpenSources} zones={zones} onOpenRule={onOpenRule} />
      </div>
      {shell.dialog}
    </div>
  );
}

/**
 * The Gauges page (spec §6, A7): browse presets, the profile's gauges and My library's, and edit
 * one. A [Gauges | Editor] segment in the header; lazily loaded by studio-view.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { addGaugeZone, type StudioBridge } from "@/components/library/library-actions";
import { useMyLibrary } from "@/components/library/use-my-library";
import { useToast } from "@/components/ui/toast";
import { presetGauges, profileGauges, sourceKey, type GaugeEntry, type GaugeSource } from "@/lib/gauge-studio/model";
import { editorOpenOf, newGaugeOpen, type EditorOpen } from "@/lib/gauge-studio/open";
import { previewScope } from "@/lib/gauge-studio/preview";
import { closeSession, openSession, sessionEditor, type EditorSlot } from "@/lib/gauge-studio/session";
import type { ThemeTokens } from "@/lib/theme";
import { useViewportBelow } from "@/hooks/use-viewport-below";
import { PaneSheet } from "@/components/studio/pane-sheet";
import { NARROW_PAGE_WIDTH } from "@/components/studio/studio-layout";
import { GaugeDetail, EmptyDetail } from "./gauge-detail";
import { GaugeEditor, type EditorHandle } from "./gauge-editor";
import { downloadSpec, ImportGaugeButton } from "./gauge-files";
import { GaugesBrowse, type GaugeSection } from "./gauges-browse";
import { saveGauge } from "./save-gauge";
import { useGaugeKeys } from "./use-gauge-keys";
import { useLibraryGauges } from "./use-library-gauges";
import { useThumbClock } from "./use-playback";

export interface GaugesPageProps {
  bridge: StudioBridge;
  profileName: string;
  /** The dashboard theme's tokens: "Theme colours follow '<theme>'" and live previews. */
  theme: ThemeTokens;
  /** A gauge to open in the editor (set by "Edit gauge…"); `onOpened` clears it once taken. */
  initial: GaugeSource | null;
  onOpened: () => void;
  /** Back to the canvas (a drag from a gauge card springs there, as on the Library page). */
  onShowCanvas: () => void;
}

const HEADER_BUTTON = "flex h-[34px] items-center gap-1.5 rounded-[8px] border border-ui-default px-3 text-[12.5px] text-ui-1 hover:bg-ui-hover";

export default function GaugesPage({ bridge: studio, profileName, theme, initial, onOpened }: GaugesPageProps) {
  const toast = useToast();
  const lib = useMyLibrary(studio.config);
  const library = useLibraryGauges(lib.items);
  const clock = useThumbClock();
  const editorRef = useRef<EditorHandle>(null);
  // The editor outlives this page (the rail unmounts it): it is read back from the session.
  const [editor, setEditor] = useState<EditorSlot | null>(sessionEditor);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  useGaugeKeys({});
  const narrow = useViewportBelow(NARROW_PAGE_WIDTH);

  // Copies counted through the page's list, so the counts update in place.
  const bridge: StudioBridge = { ...studio, addCopy: lib.addCopy };
  const scope = previewScope(theme);
  const presets = useMemo(presetGauges, []);
  const inProfile = useMemo(() => profileGauges(studio.profile), [studio.profile]);
  const all = useMemo(() => [...presets, ...inProfile, ...library.entries], [presets, inProfile, library.entries]);
  const selected = all.find((e) => e.key === selectedKey) ?? null;

  const openEditor = (open: EditorOpen) => setEditor(openSession(open));
  const closeEditor = () => {
    closeSession();
    setEditor(null);
  };
  useEffect(() => {
    if (!initial) return;
    const entry = all.find((e) => e.key === sourceKey(initial));
    if (entry) openEditor(editorOpenOf(entry));
    // A library gauge may still be on its way: the list loads, and a large spec is fetched after it.
    else if (initial.kind === "library" && (lib.loading || lib.items.some((i) => i.id === initial.itemId))) return;
    else toast("That gauge is not in your library any more");
    onOpened();
  }, [initial, all, lib.loading, lib.items]);

  const sections: GaugeSection[] = [
    { id: "presets", title: "Presets", note: "Customising one makes your own copy", entries: presets, empty: "No presets." },
    { id: "profile", title: `In ${profileName}`, entries: inProfile, empty: "No gauges on this page yet. Add one with Add to canvas." },
    { id: "library", title: "My library", entries: library.entries, empty: "Nothing saved yet. Save a gauge from the editor." },
  ];

  const addToCanvas = (e: GaugeEntry) => {
    if (!e.gauge) return toast("An image sequence goes into a canvas zone: add it there");
    addGaugeZone(bridge, e.name, e.gauge, undefined, library.itemOf(e.key));
  };
  const duplicate = (e: GaugeEntry) => {
    const item = library.itemOf(e.key);
    const done = (key: string) => {
      lib.refresh();
      setSelectedKey(key);
      toast(`Saved a copy of ${e.name}`);
    };
    const failed = (err: Error) => toast(`Not duplicated: ${err.message}`);
    if (item) return void lib.duplicate(item).then((copy) => copy && done(`library:${copy.id}`), failed);
    if (e.gauge || e.files) void saveGauge({ name: `${e.name} copy`, gauge: e.gauge, from: e }).then((copy) => done(`library:${copy.id}`), failed);
  };

  const detail = (entry: GaugeEntry, sheet: boolean) => (
    <GaugeDetail
      key={entry.key}
      entry={entry}
      sheet={sheet}
      copies={library.itemOf(entry.key)?.copies.length}
      scope={scope}
      onEdit={() => openEditor(editorOpenOf(entry))}
      onAddToCanvas={() => addToCanvas(entry)}
      onDuplicate={() => duplicate(entry)}
      onExport={() => entry.gauge && downloadSpec(entry.name, entry.gauge)}
    />
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-ui-app font-ui">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-ui-subtle bg-ui-chrome px-4">
        <h1 className="text-[15px] font-semibold text-ui-1">Gauges</h1>
        <div role="tablist" aria-label="Gauges" className="flex h-[34px] items-center gap-0.5 rounded-[9px] border border-ui-default p-0.5">
          <button
            type="button"
            role="tab"
            aria-selected={!editor}
            onClick={() => (editorRef.current ? editorRef.current.requestBack() : closeEditor())}
            className={cn("h-full rounded-[7px] px-3 text-[12.5px] text-ui-3 hover:text-ui-1", !editor && "bg-ui-active text-ui-1")}
          >
            Gauges
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!!editor}
            disabled={!editor}
            title={editor ? undefined : "Open a gauge to edit it"}
            className={cn("h-full rounded-[7px] px-3 text-[12.5px] text-ui-3 disabled:opacity-40", editor && "bg-ui-active text-ui-1")}
          >
            Editor
          </button>
        </div>
        <span className="flex-1" />
        {!editor && (
          <>
            <ImportGaugeButton className={HEADER_BUTTON} onImported={(got) => openEditor({ kind: "copy", name: got.name, gauge: got.gauge, origin: null })} />
            <button
              type="button"
              onClick={() => openEditor(newGaugeOpen())}
              className="flex h-[34px] items-center gap-1.5 rounded-[8px] bg-ui-inverse px-3 text-[12.5px] font-medium text-ui-inverse-fg hover:opacity-90"
            >
              <Plus className="h-4 w-4" /> New gauge
            </button>
          </>
        )}
      </header>
      {editor ? (
        <GaugeEditor key={editor.id} ref={editorRef} bridge={bridge} open={editor.open} editorId={editor.id} theme={theme} onBack={closeEditor} onSaved={lib.refresh} />
      ) : (
        <div className="relative flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            {lib.error && (
              <div role="alert" className="m-4 mb-0 rounded-lg border border-ui-danger/40 bg-ui-danger/10 px-3 py-2 text-[12.5px] text-ui-2">
                {lib.error}
              </div>
            )}
            <GaugesBrowse sections={sections} selectedKey={selected?.key ?? null} p={clock} scope={scope} onSelect={(e) => setSelectedKey(e.key)} onOpen={(e) => openEditor(editorOpenOf(e))} />
          </div>
          {selected ? (
            narrow ? (
              <PaneSheet label="Gauge details" onClose={() => setSelectedKey(null)}>
                {detail(selected, true)}
              </PaneSheet>
            ) : (
              detail(selected, false)
            )
          ) : (
            !narrow && <EmptyDetail />
          )}
        </div>
      )}
    </div>
  );
}

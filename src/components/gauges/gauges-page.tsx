/**
 * The Gauges page (spec §5): browse what is on your screens, the presets and My library's gauges, and edit
 * one (the editor's own header carries the way back); lazily loaded by studio-view.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addGaugeZone, type StudioBridge } from "@/components/library/library-actions";
import { dropLibraryItem } from "@/components/library/library-drop";
import { useMyLibrary } from "@/components/library/use-my-library";
import { RemoveItemDialog } from "@/components/library/remove-item-dialog";
import { ContextMenu } from "@/components/ui/context-menu";
import { useToast } from "@/components/ui/toast";
import type { LibraryItem } from "@/lib/library";
import { configGauges, presetGauges, sourceKey, type GaugeEntry, type GaugeSource } from "@/lib/gauge-studio/model";
import { configRings, type RingsEntry } from "@/lib/gauge-studio/rings";
import { editorOpenOf, newGaugeOpen, type EditorOpen } from "@/lib/gauge-studio/open";
import { previewScope } from "@/lib/gauge-studio/preview";
import { closeSession, openSession, sessionEditor, type EditorSlot } from "@/lib/gauge-studio/session";
import type { ThemeTokens } from "@/lib/theme";
import { useViewportBelow } from "@/hooks/use-viewport-below";
import { PaneSheet } from "@/components/studio/pane-sheet";
import { NARROW_PAGE_WIDTH } from "@/components/studio/studio-layout";
import { LIBRARY_MIME, setActiveLibraryDrag } from "@/lib/my-library/drag";
import { CanvasDropPill } from "./canvas-drop-pill";
import { gaugeDragItem, startGaugeDrag } from "./gauge-drag";
import { gaugeActions, gaugeMenuEntries, libraryMenuHandlers } from "./gauge-actions";
import { GaugeDetail, EmptyDetail } from "./gauge-detail";
import { GaugeEditor, type EditorHandle } from "./gauge-editor";
import { openImportDoor } from "@/components/studio/file-doors";
import { BarFill, BarTitle, PageBar } from "@/components/studio/page-bar";
import { downloadFrames, downloadSpec } from "./gauge-files";
import { GaugesBrowse, type GaugeSection } from "./gauges-browse";
import { OnScreens, opensOnCanvas } from "./on-screens";
import { saveGauge } from "./save-gauge";
import { useGaugeKeys } from "./use-gauge-keys";
import { useLibraryGauges } from "./use-library-gauges";
import { useThumbClock } from "./use-playback";

export interface GaugesPageProps {
  bridge: StudioBridge;
  /** The dashboard theme's tokens: "Theme colours follow '<theme>'" and live previews. */
  theme: ThemeTokens;
  /** A gauge to open in the editor (set by "Edit gauge…"); `onOpened` clears it once taken. */
  initial: GaugeSource | null;
  onOpened: () => void;
  /** Back to the canvas (a drag from a gauge card springs there, as on the Library page). */
  onShowCanvas: () => void;
  /** Open a widget on its screen and page (a ring row's "Open widget"). */
  onOpenZone: (profileId: string, pageId: string, zoneId: string) => void;
  /** An alert rule, in Alerts (Colour zones' "From <rule>"). */
  onOpenRule: (ruleId: string) => void;
  /** The preview sensor picker's "Open data explorer". */
  onOpenSources: () => void;
}

/** Presets shown before "Show all". */
const PRESETS_AT_FIRST = 12;

export default function GaugesPage({ bridge: studio, theme, initial, onOpened, onShowCanvas, onOpenZone, onOpenRule, onOpenSources }: GaugesPageProps) {
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
  const [dragging, setDragging] = useState(false);
  const [menu, setMenu] = useState<{ entry: GaugeEntry; x: number; y: number } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<LibraryItem | null>(null);
  /** The card whose name is being edited (Rename from the menu); a ref too, as Enter and the blur after it both report. */
  const [renameKey, setRenameKey] = useState<string | null>(null);
  const renameKeyRef = useRef<string | null>(null);
  // The studio's config as it is now, read when a removal decides which files to delete.
  const configRef = useRef(studio.config);
  configRef.current = studio.config;

  // Copies counted through the page's list, so the counts update in place.
  // A transient (preset, profile) gauge has no library item to count a copy on.
  const bridge: StudioBridge = { ...studio, addCopy: (item, copy) => (item.id.startsWith("cfg-") ? undefined : lib.addCopy(item, copy)) };
  const scope = previewScope(theme);
  const presets = useMemo(presetGauges, []);
  // Every screen and page, not only the one on the canvas (B3).
  const onScreens = useMemo(() => configGauges(studio.config), [studio.config]);
  const rings = useMemo(() => configRings(studio.config), [studio.config]);
  const all = useMemo(() => [...presets, ...onScreens, ...library.entries], [presets, onScreens, library.entries]);
  const selected = all.find((e) => e.key === selectedKey) ?? null;

  const openEditor = (open: EditorOpen) => setEditor(openSession(open));
  // An image sequence placed on a page is edited on the canvas, not here.
  const openEntry = (e: GaugeEntry) => (opensOnCanvas(e) && e.on ? onOpenZone(e.on.profileId, e.on.pageId, e.source.kind === "item" ? e.source.zoneId : "") : openEditor(editorOpenOf(e)));
  const closeEditor = () => {
    closeSession();
    setEditor(null);
  };
  // Replacing an open editor asks about its unsaved changes, as Back does.
  const replaceEditor = (open: EditorOpen) => (editorRef.current ? editorRef.current.requestBack(() => openEditor(open)) : openEditor(open));
  useEffect(() => {
    if (!initial) return;
    const entry = all.find((e) => e.key === sourceKey(initial));
    if (entry) replaceEditor(editorOpenOf(entry));
    // A library gauge may still be on its way: the list loads, and a large spec is fetched after it.
    else if (initial.kind === "library" && (lib.loading || lib.items.some((i) => i.id === initial.itemId))) return;
    else toast("That gauge is not in your library any more");
    onOpened();
  }, [initial, all, lib.loading, lib.items]);

  const sections: GaugeSection[] = [
    { id: "presets", title: "Presets", note: "customizing one makes your own copy", entries: presets, limit: PRESETS_AT_FIRST, empty: "No presets." },
    { id: "library", title: "Saved in your library", entries: library.entries, empty: "Nothing saved yet. Customize a preset, or save a gauge from the editor." },
  ];

  const addToCanvas = (e: GaugeEntry) => {
    if (e.gauge) addGaugeZone(bridge, e.name, e.gauge, undefined, library.itemOf(e.key));
  };
  // An image sequence goes into one of the page's canvas zones, centred, as a drop there would.
  const canvasZones = studio.profile.placements.filter((z) => z.canvas).map((z) => ({ id: z.id, name: z.canvas!.source.name }));
  const addToZone = (e: GaugeEntry, zoneId: string) => {
    const item = gaugeDragItem(e, library.itemOf(e.key));
    void dropLibraryItem(bridge, { id: item.id, item }, null, null, { zoneId, fx: 0.5, fy: 0.5 });
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

  const exportEntry = (e: GaugeEntry) => {
    if (e.gauge) return downloadSpec(e.name, e.gauge);
    downloadFrames(e).catch((err: Error) => toast(`Not exported: ${err.message}`));
  };

  // The detail pane and the card's menu read the same actions.
  const actionsOf = (entry: GaugeEntry) =>
    gaugeActions(entry, {
      canvasZones,
      onEdit: () => openEntry(entry),
      onAddToCanvas: () => addToCanvas(entry),
      onAddToZone: (zoneId) => addToZone(entry, zoneId),
      onDuplicate: () => duplicate(entry),
      onExport: () => exportEntry(entry),
    });

  // Presets and profile gauges are not library items: they cannot be renamed or deleted here.
  const askRemove = (e: GaugeEntry) => {
    const item = library.itemOf(e.key);
    if (item) setConfirmRemove(item);
  };
  const remove = (item: LibraryItem) => {
    if (selectedKey === `library:${item.id}`) setSelectedKey(null);
    // The live config: it may hold a file the saved config doesn't yet.
    lib.remove(item, () => JSON.stringify(configRef.current)).then(
      ({ deleted, kept }) =>
        toast(
          kept > 0
            ? `Removed ${item.name}; ${kept} of its files could not be deleted`
            : `Removed ${item.name}${deleted === 0 ? "" : deleted === 1 ? " and its file" : ` and its ${deleted} files`}`,
        ),
      (e: Error) => toast(`Not removed: ${e.message}`),
    );
  };
  const startRename = (e: GaugeEntry) => {
    setSelectedKey(e.key);
    renameKeyRef.current = e.key;
    setRenameKey(e.key);
  };
  const renamed = (e: GaugeEntry, name: string | null) => {
    if (renameKeyRef.current !== e.key) return;
    renameKeyRef.current = null;
    setRenameKey(null);
    const item = library.itemOf(e.key);
    const next = name?.trim();
    if (item && next && next !== item.name) lib.rename(item, next);
  };
  const menuEntries = (e: GaugeEntry) =>
    gaugeMenuEntries(actionsOf(e), libraryMenuHandlers(library.itemOf(e.key), { onRename: () => startRename(e), onDelete: () => askRemove(e) }));

  const detail = (entry: GaugeEntry, sheet: boolean) => (
    <GaugeDetail key={entry.key} entry={entry} sheet={sheet} copies={library.itemOf(entry.key)?.copies.length} scope={scope} actions={actionsOf(entry)} onOpenSources={onOpenSources} />
  );

  const onYourScreens = (
    <section aria-label="On your screens" className="mb-8">
      <div className="flex items-baseline gap-2">
        <h2 className="text-body font-medium text-ui-1">On your screens</h2>
        {onScreens.length + rings.length > 0 && <span className="text-caption text-ui-3">{onScreens.length + rings.length}</span>}
      </div>
      {onScreens.length + rings.length === 0 ? (
        <p className="mt-3 rounded-ui-lg border border-dashed border-ui-strong px-4 py-5 text-center text-caption text-ui-3">No gauges on your screens yet. Pick one below and use Add to canvas.</p>
      ) : (
        <div className="mt-3">
          <OnScreens
            gauges={onScreens}
            rings={rings}
            selectedKey={selected?.key ?? null}
            p={clock}
            scope={scope}
            onSelect={(e) => setSelectedKey(e.key)}
            onOpen={openEntry}
            onDragStart={(e, dt) => startGaugeDrag(dt, e, library.itemOf(e.key))}
            onMenu={(entry, x, y) => setMenu({ entry, x, y })}
            onOpenWidget={(r: RingsEntry) => onOpenZone(r.on.profileId, r.on.pageId, r.zoneId)}
          />
          <p className="mt-2 text-caption text-ui-3">Canvas gauges and Custom gauge widgets open in the gauge editor. Widget rings are part of their widget’s settings.</p>
        </div>
      )}
    </section>
  );

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-ui-app font-ui"
      onDragStart={(e) => setDragging(e.dataTransfer.types.includes(LIBRARY_MIME))}
      onDragEnd={() => {
        setDragging(false);
        setActiveLibraryDrag(null);
      }}
    >
      {!editor && (
        <PageBar>
          <BarTitle title="Gauges" note={`${presets.length} presets · ${onScreens.length + rings.length} on your screens · ${library.entries.length} saved`} />
          <BarFill />
          <div className="flex items-center gap-2">
            <Button icon={<Upload strokeWidth={1.5} />} onClick={() => openImportDoor()}>
              Import
            </Button>
            <Button variant="primary" icon={<Plus strokeWidth={1.5} />} onClick={() => openEditor(newGaugeOpen())}>
              New gauge
            </Button>
          </div>
        </PageBar>
      )}
      {editor ? (
        <GaugeEditor key={editor.id} ref={editorRef} bridge={bridge} open={editor.open} editorId={editor.id} theme={theme} onBack={closeEditor} onSaved={lib.refresh} onOpenRule={onOpenRule} onOpenSources={onOpenSources} />
      ) : (
        <div className="relative flex min-h-0 flex-1">
          <div className="flex min-w-0 flex-1 flex-col">
            {lib.error && (
              <div role="alert" className="m-4 mb-0 rounded-lg border border-ui-danger/40 bg-ui-danger/10 px-3 py-2 text-body text-ui-2">
                {lib.error}
              </div>
            )}
            <GaugesBrowse head={onYourScreens} sections={sections} selectedKey={selected?.key ?? null} p={clock} scope={scope} onSelect={(e) => setSelectedKey(e.key)} onOpen={(e) => openEditor(editorOpenOf(e))} onDragStart={(e, dt) => startGaugeDrag(dt, e, library.itemOf(e.key))} onMenu={(entry, x, y) => setMenu({ entry, x, y })} onRemove={askRemove} renamingKey={renameKey} onRenamed={renamed} />
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
          {menu && <ContextMenu x={menu.x} y={menu.y} entries={menuEntries(menu.entry)} onClose={() => setMenu(null)} />}
          <RemoveItemDialog item={confirmRemove} onClose={() => setConfirmRemove(null)} onRemove={remove} verb="Delete" />
          {dragging && <CanvasDropPill onShowCanvas={onShowCanvas} />}
        </div>
      )}
    </div>
  );
}

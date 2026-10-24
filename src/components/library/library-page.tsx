/**
 * The Library page (spec §3, §10.4), opened from the rail: a 56 px header (title and tagline, search
 * everything, [Grid | Shelves], the "Used by" screen filter, Add files…) over the collections
 * sidebar (smart collections, then Themes · Styles · Panels · Gauges · Media · Fonts · Canvases), the
 * grid or shelves, and the detail pane. Fonts are a collection with its own view; a gauge opens in the
 * Gauges view; the edited screen's canvas files are one button away. Lazy-loaded.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Copy,
  Download,
  Eye,
  FolderInput,
  Gauge,
  ImageDown,
  LayoutGrid,
  MonitorPlay,
  Pencil,
  Plus,
  Rows3,
  Search,
  Trash2,
  Type,
  Wallpaper,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { ContextMenu, type ContextMenuEntry } from "@/components/ui/context-menu";
import { formatBytes } from "@/lib/assets";
import type { AppearancePreset } from "@/lib/appearance-presets";
import type { LibraryCopy, LibraryItem } from "@/lib/library";
import type { ModuleSettings } from "@/modules/types";
import { THEME_PRESETS, type ThemeTokens } from "@/lib/theme";
import {
  buildIndex,
  cleanupCounts,
  collectionCounts,
  collectionItems,
  COLLECTIONS,
  hintOf,
  isConfigItem,
  search,
  sortItems,
  tagsOf,
  topTags,
  usedByScreen,
  type CollectionId,
  type SortId,
} from "@/lib/my-library/model";
import { suggestBackgrounds } from "@/lib/my-library/theme-suggest";
import { downloadSpec } from "@/components/gauges/gauge-files";
import { gaugeDataOf } from "@/lib/gauge-studio/model";
import { addToProfile, dataOf, setAsBackground, useForSelection, useForSelectionBlocked, type StudioBridge } from "./library-actions";
import { LibraryDetail, type DetailAction } from "./library-detail";
import { PresetDetail } from "./preset-detail";
import { isPresetItem, presetPrimary, presetScopes, presetSecondary, renamePreset, type PresetContext } from "./preset-actions";
import { GridView, LibrarySidebar, ShelvesView } from "./library-views";
import { openImportDoor, openNewInfoPanel } from "@/components/studio/file-doors";
import { optimiseItem } from "./optimise";
import { FontsView } from "./fonts-view";
import { ProfileAssets, type ProfileAssetsProps } from "./profile-assets";
import { UploadTray } from "./upload-tray";
import { LooseUploads } from "./loose-uploads";
import { RemoveItemDialog } from "./remove-item-dialog";
import { useMyLibrary } from "./use-my-library";
import { LIBRARY_MIME, setActiveLibraryDrag } from "@/lib/my-library/drag";
import { useViewportBelow } from "@/hooks/use-viewport-below";
import { PaneSheet } from "@/components/studio/pane-sheet";
import { NARROW_PAGE_WIDTH } from "@/components/studio/studio-layout";
import { useHoldZoneShortcuts } from "./use-hold-zone-shortcuts";

export interface LibraryPageProps {
  bridge: StudioBridge;
  /** A link to a collection ("All themes in Library ↗", "Edit gauge…"); `seq` makes a repeat count. */
  request?: { collection: CollectionId; seq: number };
  /** The page on the canvas (a Theme's "Apply to… this page"). */
  pageId: string;
  /** The look the selected widget has of its own (a Style's "Update from selection"); null = nothing selected. */
  selectionStyle: ModuleSettings | null;
  /** A saved Theme's "Edit in Theme": Theme opens at All screens with it applied. */
  onEditInTheme: (preset: AppearancePreset) => void;
  /** A canvas's primary action: its editor, on the zone that uses it (else it comes in as a new screen). */
  onEditCanvas: (item: LibraryItem) => void;
  /** A card dragged onto "Drop on the canvas": the page makes way so the drag goes on to the canvas. */
  onShowCanvas: () => void;
  theme: ThemeTokens;
  /** The stored profile's name (the canvas files button, the suggestions' note). */
  profileName: string;
  /** Reopen a saved canvas in the import wizard, landing where `dest` says (chosen here, so the wizard does not ask). */
  onImport: (source: { canvasId: string }, dest: "new" | "zone") => void;
  /** Open a library gauge in the Gauges view's editor. */
  onOpenGauge: (itemId: string) => void;
  /** Export a saved canvas (download) without placing it. */
  onExportCanvas: (item: LibraryItem) => void;
  copyLabel: (copy: LibraryCopy) => string;
  onJump: (copy: LibraryCopy) => void;
  /** The canvas files view's studio side. */
  assets: Omit<ProfileAssetsProps, "onSaveToLibrary" | "onUse" | "useBlocked" | "tiledSrc">;
}

export default function LibraryPage(p: LibraryPageProps) {
  const toast = useToast();
  const lib = useMyLibrary(p.bridge.config);
  /** The edited screen's canvas files, in place of the collections (a button in the header). */
  const [showFiles, setShowFiles] = useState(false);
  /** The "Used by" filter: a screen id, "" = any screen. */
  const [usedBy, setUsedBy] = useState("");
  const [view, setView] = useState<"grid" | "shelves">("grid");
  const [collection, setCollection] = useState<CollectionId>("all");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [sort, setSort] = useState<SortId>("recent");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ item: LibraryItem; x: number; y: number } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<LibraryItem | null>(null);
  /** The item whose name field takes focus (Rename from the menu). */
  const [renameId, setRenameId] = useState<string | null>(null);
  // The studio's config as it is now, read when a removal decides which files to delete.
  const configRef = useRef(p.bridge.config);
  configRef.current = p.bridge.config;
  const focusedName = useCallback(() => setRenameId(null), []);
  useHoldZoneShortcuts();
  const narrow = useViewportBelow(NARROW_PAGE_WIDTH);

  // Copies counted through the page's list, so the counts update in place.
  const bridge: StudioBridge = { ...p.bridge, addCopy: lib.addCopy };
  const [dragging, setDragging] = useState(false);
  const themeName = THEME_PRESETS.find((t) => t.tokens.accent === p.theme.accent && t.tokens.foreground === p.theme.foreground)?.label;
  const index = useMemo(() => {
    const suggested = suggestBackgrounds(lib.items, { foreground: p.theme.foreground, accent: p.theme.accent, name: themeName });
    return buildIndex(lib.items, suggested);
  }, [lib.items, p.theme.foreground, p.theme.accent, themeName]);
  // A tiled page background: the profile asset served from its image is the tile.
  const background = p.bridge.config.profiles.find((x) => x.id === p.bridge.profileId)?.background;
  const tiledSrc = background?.type === "image" && background.fit === "tile" ? background.src : undefined;
  const counts = useMemo(() => collectionCounts(index), [index]);

  const searching = query.trim().length > 0;
  const found = searching ? search(index.items, query) : collectionItems(collection, index);
  const base = usedBy ? usedByScreen(found, usedBy) : found;
  const tags = useMemo(() => topTags(base), [base]);
  const shown = sortItems(tag ? base.filter((i) => tagsOf(i).includes(tag)) : base, sort);
  const selected = lib.items.find((i) => i.id === selectedId) ?? null;

  const pickCollection = (id: CollectionId) => {
    setShowFiles(false);
    setCollection(id);
    setQuery("");
    setTag(null);
    if (id !== "all") setView("grid");
  };
  useEffect(() => {
    if (p.request) pickCollection(p.request.collection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.request?.seq]);
  /** Files chosen on the grid's upload tile: the Import door detects them. */
  const addFiles = (files: File[]) => openImportDoor({ files });

  const open = (item: LibraryItem) => {
    setSelectedId(item.id);
    if (item.kind === "font") return pickCollection("fonts");
    const primary = primaryOf(item);
    if (primary && !primary.disabled) primary.run();
  };

  const presetCtx: PresetContext = {
    bridge,
    pageId: p.pageId,
    selectionStyle: p.selectionStyle,
    onEditInTheme: p.onEditInTheme,
    select: setSelectedId,
    rename: (id) => {
      setSelectedId(id);
      setRenameId(id);
    },
  };

  function primaryOf(item: LibraryItem): DetailAction | null {
    switch (item.kind) {
      case "image":
      case "video":
        return { label: "Set as background", icon: Wallpaper, run: () => setAsBackground(bridge, item) };
      case "gauge":
        return { label: "Open in editor", icon: Gauge, run: () => p.onOpenGauge(item.id) };
      case "canvas":
        return { label: "Edit canvas", icon: MonitorPlay, run: () => p.onEditCanvas(item) };
      case "style":
      case "theme":
        return presetPrimary(item, presetCtx);
      case "panel":
        return { label: "Add to screen", icon: Plus, run: () => void addToProfile(bridge, item) };
      case "font":
        return { label: "Show font", icon: Type, run: () => pickCollection("fonts") };
      case "svg":
        return { label: "Add to canvas", icon: Plus, run: () => void addToProfile(bridge, item) };
      default:
        return null;
    }
  }

  function secondaryOf(item: LibraryItem): DetailAction[] {
    if (isPresetItem(item)) return presetSecondary(item, presetCtx);
    const out: DetailAction[] = [];
    if (item.kind === "image") out.push({ label: "Add to canvas", icon: Plus, run: () => void addToProfile(bridge, item) });
    if (item.kind === "video") out.push({ label: "Add to canvas", icon: Plus, run: () => {}, disabled: true, title: "A video plays as the background, or in a canvas zone (drag it into the canvas editor)" });
    out.push({
      label: "Duplicate",
      icon: Copy,
      run: () =>
        void lib.duplicate(item).then(
          (copy) => copy && setSelectedId(copy.id),
          (e: Error) => toast(`Not duplicated: ${e.message}`),
        ),
      title: "Duplicate as variant: an independent copy to change",
    });
    if (item.kind === "image" && !["svg", "gif"].includes(String((item.meta as { type?: string }).type)))
      out.push({
        label: "Optimise",
        icon: ImageDown,
        run: () =>
          void optimiseItem(item).then(
            (r) => {
              if (!r) return toast("Already as small as it gets: kept as is");
              void lib.update(item, { files: [r.id], meta: { ...item.meta, ...r.meta } }).then(() => toast(`Optimised: saved ${formatBytes(r.saved)}`));
            },
            (e: Error) => toast(`Not optimised: ${e.message}`),
          ),
      });
    if (item.kind === "gauge")
      out.push({
        label: "Export .gauge.json",
        icon: Download,
        run: () =>
          void dataOf(item).then(
            (raw) => {
              const spec = gaugeDataOf(raw)?.vector;
              if (spec) downloadSpec(item.name, spec);
              else toast("An image sequence has no spec to export: its frames go out with the .infopanel export");
            },
            (e: Error) => toast(`Not exported: ${e.message}`),
          ),
      });
    if (item.kind === "canvas") {
      out.push({ label: "Export…", icon: Download, run: () => p.onExportCanvas(item) });
      out.push({ label: "Add to this page…", icon: FolderInput, run: () => p.onImport({ canvasId: item.id }, "zone") });
    }
    return out;
  }

  const askRemove = (item: LibraryItem) => !isConfigItem(item) && setConfirmRemove(item);
  const remove = (item: LibraryItem) => {
    if (selectedId === item.id) setSelectedId(null);
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

  function menuEntries(item: LibraryItem): ContextMenuEntry[] {
    const entry = (a: DetailAction): ContextMenuEntry => ({ id: a.label, label: a.label, icon: <a.icon />, disabled: a.disabled, onSelect: a.run });
    const primary = primaryOf(item);
    const actions = [...(primary ? [entry(primary)] : []), ...secondaryOf(item).map(entry)];
    if (isConfigItem(item)) return actions;
    return [
      ...actions,
      ...(actions.length ? ["separator" as const] : []),
      {
        id: "rename",
        label: "Rename",
        icon: <Pencil />,
        onSelect: () => {
          setSelectedId(item.id);
          setRenameId(item.id);
        },
      },
      { id: "remove", label: "Remove from library…", icon: <Trash2 />, hint: "Del", danger: true, onSelect: () => askRemove(item) },
    ];
  }

  const c = cleanupCounts(index);
  const firstGroup = index.duplicates[0];
  const attention = [
    ...(firstGroup
      ? [
          {
            id: "duplicates",
            title: `${c.duplicates} duplicate${c.duplicates === 1 ? "" : "s"}`,
            text: `${firstGroup[1].name} is identical to ${firstGroup[0].name}`,
            action: "Merge",
            onAction: () => void lib.merge(firstGroup).then(() => toast(`Merged into ${firstGroup[0].name}`)),
          },
        ]
      : []),
    ...(c.unused ? [{ id: "unused", title: `${c.unused} unused`, text: "Not used by any screen", action: "Review", onAction: () => pickCollection("unused") }] : []),
    ...(c.large ? [{ id: "large", title: `${c.large} large file${c.large === 1 ? "" : "s"}`, text: `${formatBytes(c.largeBytes)} in all`, action: "Review", onAction: () => pickCollection("large") }] : []),
  ];
  const shelves = [
    { id: "suggested" as const, title: "Suggested backgrounds", note: `For the ${themeName ?? "current"} theme on ${p.profileName}`, items: index.suggested.map((s) => s.item) },
    { id: "recent" as const, title: "Recent", note: "Added or edited this week", items: sortItems(collectionItems("recent", index), "recent") },
    { id: "gauges" as const, title: "Gauges", note: "Built here or imported", items: collectionItems("gauges", index) },
    { id: "videos" as const, title: "Videos", note: "Backgrounds that move", items: collectionItems("videos", index) },
    { id: "panels" as const, title: "Panels & Styles", note: "Yours to reuse", items: [...collectionItems("panels", index), ...collectionItems("styles", index)] },
  ];

  const detail = (item: LibraryItem, sheet: boolean) => {
    if (isPresetItem(item))
      return (
        <PresetDetail
          key={item.id}
          item={item}
          sheet={sheet}
          config={p.bridge.config}
          primary={primaryOf(item)}
          scopes={presetScopes(item, presetCtx)}
          secondary={secondaryOf(item)}
          focusName={renameId === item.id}
          onFocusedName={focusedName}
          onRename={(name) => renamePreset(item, bridge, name)}
        />
      );
    return (
      <LibraryDetail
        key={item.id}
        item={item}
        sheet={sheet}
        index={index}
        primary={primaryOf(item)}
        secondary={secondaryOf(item)}
        focusName={renameId === item.id}
        onFocusedName={focusedName}
        onRename={(name) => lib.rename(item, name)}
        onRemove={() => askRemove(item)}
        onMerge={(group) => void lib.merge(group).then(() => toast(`Merged into ${group[0].name}`))}
        onVideo={(patch) => void lib.update(item, { meta: { ...item.meta, ...patch } })}
        copyLabel={p.copyLabel}
        onJump={p.onJump}
      />
    );
  };

  const title = searching ? `Results for “${query.trim()}”` : (COLLECTIONS.find((x) => x.id === collection)?.label ?? "All items");
  // First run: the grid's wide upload tile fills the page; the view choice is kept for when items exist.
  const empty = !lib.loading && lib.items.every(isConfigItem);
  const fonts = !searching && collection === "fonts" && !showFiles;
  const uploads = collection === "all" || collection === "media" || COLLECTIONS.some((c) => c.id === collection && c.parent === "media");

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-ui-app font-ui"
      onDragStart={(e) => setDragging(e.dataTransfer.types.includes(LIBRARY_MIME))}
      onDragEnd={() => {
        setDragging(false);
        setActiveLibraryDrag(null);
      }}
    >
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-ui-subtle bg-ui-chrome px-4 max-sm:h-auto max-sm:flex-wrap max-sm:gap-2 max-sm:px-3 max-sm:py-2">
        <h1 className="text-[15px] font-semibold text-ui-1">Library</h1>
        <span className="hidden min-w-0 truncate text-[12px] text-ui-4 xl:block">Everything you’ve saved, beside the built-ins.</span>
        <label className="flex h-[34px] min-w-0 max-w-[520px] flex-1 items-center gap-2 rounded-[9px] border border-ui-default bg-ui-panel px-3 focus-within:border-ui-accent">
          <Search className="h-4 w-4 shrink-0 text-ui-4" />
          <input
            type="search"
            aria-label="Search everything"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setTag(null);
              setShowFiles(false);
            }}
            placeholder="Search the library"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ui-1 outline-none placeholder:text-ui-4"
          />
          {query && (
            <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="text-ui-4 hover:text-ui-1">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </label>
        {!empty && !showFiles && (
          <div role="radiogroup" aria-label="View" className="flex h-[34px] items-center gap-0.5 rounded-[9px] border border-ui-default p-0.5">
            {(
              [
                ["grid", "Grid", LayoutGrid],
                ["shelves", "Shelves", Rows3],
              ] as const
            ).map(([id, label, Icon]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={view === id}
                onClick={() => {
                  setView(id);
                  if (id === "shelves") setCollection("all");
                }}
                className={cn("flex h-full items-center gap-1.5 rounded-[7px] px-2.5 text-[12.5px] text-ui-3 hover:text-ui-1", view === id && "bg-ui-active text-ui-1")}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        )}
        <select
          aria-label="Used by"
          value={usedBy}
          onChange={(e) => {
            setUsedBy(e.target.value);
            setShowFiles(false);
          }}
          className="h-[34px] max-w-[200px] rounded-[9px] border border-ui-default bg-ui-panel px-2.5 text-[12.5px] text-ui-2"
        >
          <option value="">Used by any screen</option>
          {p.bridge.config.profiles.map((s) => (
            <option key={s.id} value={s.id}>
              Used by {s.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-pressed={showFiles}
          onClick={() => setShowFiles((on) => !on)}
          title="The files its canvases use: replace and optimise them"
          className={cn("flex h-[34px] max-w-[220px] items-center gap-1.5 rounded-[8px] border border-ui-default px-3 text-[12.5px] text-ui-1 hover:bg-ui-hover", showFiles && "bg-ui-active")}
        >
          <FolderInput className="h-4 w-4 shrink-0" />
          <span className="truncate">Canvas files · {p.profileName}</span>
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => openNewInfoPanel()}
          title="An InfoPanel profile from scratch, as a new screen in the InfoPanel editor"
          className="flex h-[34px] items-center gap-1.5 rounded-[8px] border border-ui-default px-3 text-[12.5px] text-ui-1 hover:bg-ui-hover"
        >
          New InfoPanel profile…
        </button>
        <button
          type="button"
          onClick={() => openImportDoor()}
          className="flex h-[34px] items-center gap-1.5 rounded-[8px] bg-ui-inverse px-3 text-[12.5px] font-medium text-ui-inverse-fg hover:opacity-90"
        >
          Add files…
        </button>
      </header>
      {!showFiles && <LooseUploads items={lib.items} config={p.bridge.config} ready={!lib.loading && !lib.error} onImport={lib.importAssets} onResult={toast} />}
      <div className="relative flex min-h-0 flex-1 max-sm:flex-col">
        {showFiles ? (
          <ProfileAssets
            {...p.assets}
            onSaveToLibrary={(files) => lib.addFiles(files)}
            tiledSrc={tiledSrc}
            onUse={(file) => file.url && useForSelection(bridge, file.name, file.url)}
            useBlocked={useForSelectionBlocked(p.bridge.selection)}
          />
        ) : (
          <>
            <LibrarySidebar active={searching || showFiles ? null : collection} counts={counts} onPick={pickCollection} />
            {fonts ? (
              <FontsView fonts={collectionItems("fonts", index)} library={lib} zones={p.assets.zones} setConfig={p.assets.setConfig} onSelectItems={p.assets.onSelectUses} />
            ) : (
              <>
                <div className="flex min-w-0 flex-1 flex-col">
                  {lib.error && (
                    <div role="alert" className="m-4 rounded-lg border border-ui-danger/40 bg-ui-danger/10 px-3 py-2 text-[12.5px] text-ui-2">
                      {lib.error}
                    </div>
                  )}
                  {view === "shelves" && !searching && !empty ? (
                    <ShelvesView
                      index={index}
                      shelves={shelves}
                      attention={attention}
                      selectedId={selectedId}
                      onSelect={(i) => setSelectedId(i.id)}
                      onOpen={open}
                      onMenu={(item, x, y) => setMenu({ item, x, y })}
                      onRemove={askRemove}
                      onSeeAll={pickCollection}
                    />
                  ) : (
                    <GridView
                      title={title}
                      items={shown}
                      index={index}
                      tags={tags}
                      tag={tag}
                      onTag={setTag}
                      sort={sort}
                      onSort={setSort}
                      showCleanup={!searching && collection === "all"}
                      onCollection={pickCollection}
                      selectedId={selectedId}
                      onSelect={(i) => setSelectedId(i.id)}
                      onOpen={open}
                      onMenu={(item, x, y) => setMenu({ item, x, y })}
                      onRemove={askRemove}
                      onFiles={addFiles}
                      searching={searching}
                      empty={empty}
                      uploadTile={uploads && !usedBy}
                      hint={searching ? undefined : hintOf(collection)}
                    />
                  )}
                </div>
                {selected ? (
                  narrow ? (
                    <PaneSheet label="Item details" onClose={() => setSelectedId(null)}>
                      {detail(selected, true)}
                    </PaneSheet>
                  ) : (
                    detail(selected, false)
                  )
                ) : (
                  !narrow && (
                    <aside className="flex w-[320px] shrink-0 flex-col items-center justify-center gap-2 border-l border-ui-subtle bg-ui-panel p-6 text-center text-[12.5px] text-ui-4">
                      <Eye className="h-5 w-5" />
                      Select an item to see it here. Drag a card onto the canvas to place a copy.
                    </aside>
                  )
                )}
              </>
            )}
          </>
        )}
        {menu && <ContextMenu x={menu.x} y={menu.y} entries={menuEntries(menu.item)} onClose={() => setMenu(null)} />}
        <RemoveItemDialog item={confirmRemove} onClose={() => setConfirmRemove(null)} onRemove={remove} />
        <UploadTray rows={lib.uploads} onClear={lib.clearUploads} onShow={(id) => setSelectedId(id)} />
        {dragging && (
          <div
            onDragEnter={(e) => {
              e.preventDefault();
              p.onShowCanvas();
            }}
            onDragOver={(e) => e.preventDefault()}
            className="absolute bottom-6 left-1/2 z-30 flex h-12 -translate-x-1/2 items-center gap-2 rounded-full border border-dashed border-ui-accent bg-ui-raised px-5 text-[13px] text-ui-1 shadow-ui-modal"
          >
            <MonitorPlay className="h-4 w-4 text-ui-accent-text" />
            Drag here to place it on the canvas
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The Library page (spec §3, §10.4), opened from the rail: a 56 px header (title and tagline, search
 * everything, [Grid | Shelves], the "Used by" screen filter, Add files…) over the collections
 * sidebar (smart collections, then Styles · Panels · Gauges · Media · Fonts (and the built-in ones) ·
 * Components · InfoPanel profiles · Screen templates · InfoPanel templates, and a row to Theme, where Themes, palettes and skins are), the grid or shelves, and the detail pane. Fonts are a collection with
 * its own view; a gauge opens in the Gauges view; a screen template opens the New screen page (Duplicate adds the screen at once), an InfoPanel template the New profile
 * page; ticked cards (Select, Ctrl, Shift) are deleted together; the edited
 * screen's canvas files are one button away. Every upload is an item (`useAdoptUploads`). Lazy-loaded.
 */
import { onRovingKeyDown } from "@/lib/roving";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Copy,
  Download,
  Eye,
  FolderInput,
  Gauge,
  ImageDown,
  ListChecks,
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
  isUsed,
  search,
  sortItems,
  tagsOf,
  topTags,
  usedByScreen,
  usedHashes,
  type CollectionId,
  type SortId,
} from "@/lib/my-library/model";
import { suggestBackgrounds } from "@/lib/my-library/theme-suggest";
import { downloadSpec } from "@/components/gauges/gauge-files";
import { gaugeDataOf } from "@/lib/gauge-studio/model";
import { pickedAfterClick, planDelete, deleteConfigItems, isSavedInConfig, type ClickMod, type DeletePlan } from "./multi-delete";
import { useSensorCatalog } from "@/lib/catalog";
import { instantiate as instantiateScreen } from "@/lib/screen-templates/instantiate";
import type { NewScreen } from "@/components/templates/new-page";
import type { Template } from "@/lib/infopanel/templates/kit";
import type { DataApiValue } from "@/lib/infopanel/sensors";
import { addToProfile, dataOf, duplicatePanel, isSavedPanel, setAsBackground, useForSelection, useForSelectionBlocked, type StudioBridge } from "./library-actions";
import { LibraryDetail, type DetailAction } from "./library-detail";
import { PresetDetail } from "./preset-detail";
import { isPresetItem, presetPrimary, presetSecondary, renamePreset, type PresetContext } from "./preset-actions";
import { GridView, LibrarySidebar, ShelvesView } from "./library-views";
import { openImportDoor, openNewInfoPanel } from "@/components/studio/file-doors";
import { optimiseItem } from "./optimise";
import { FontsView } from "./fonts-view";
import { ProfileAssets, type ProfileAssetsProps } from "./profile-assets";
import { UploadTray } from "./upload-tray";
import { useAdoptUploads } from "./adopt-uploads";
import { DeleteSelectedDialog, RemoveItemDialog, RemoveManyDialog } from "./remove-item-dialog";
import { FILE_KINDS, type RemoveBlock } from "./remove-item";
import { useMyLibrary } from "./use-my-library";
import { isComponent } from "@/lib/my-library/component-meta";
import { isOlderItem } from "@/lib/my-library/item-format";
import { CONFIG_PANEL, isBuiltinItem } from "@/lib/my-library/config-items";
import type { ScreenTemplate } from "@/lib/screen-templates/kit";
import { uid } from "@/lib/layout";
import { deletePanelPreset, renamePanelPreset } from "@/components/studio/panel-preset-actions";
import { LIBRARY_MIME, setActiveLibraryDrag } from "@/lib/my-library/drag";
import { addComponentZone } from "./library-drop";
import { useViewportBelow } from "@/hooks/use-viewport-below";
import { PaneSheet } from "@/components/studio/pane-sheet";
import { NARROW_PAGE_WIDTH } from "@/components/studio/studio-layout";
import { useHoldZoneShortcuts } from "./use-hold-zone-shortcuts";

export interface LibraryPageProps {
  bridge: StudioBridge;
  /** A link to a collection ("Edit gauge…"); `seq` makes a repeat count. */
  request?: { collection: CollectionId; seq: number };
  /** The look the selected widget has of its own (a Style's "Update from selection"); null = nothing selected. */
  selectionStyle: ModuleSettings | null;
  /** The "Themes, palettes and skins are in Theme" row. */
  onOpenTheme: () => void;
  /** A profile's primary action: Edit, on the zone that uses it (else it comes in as a new screen). */
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
  /** A screen template's "New screen from this": the New screen page, on that template and palette. */
  onNewScreen: (templateId: string, variant: string) => void;
  /** An InfoPanel template's "New InfoPanel profile from this": the New page, on that template and palette. */
  onNewProfile: (templateId: string, variant: string) => void;
  /** A screen template's Duplicate: the screen made from it, added to Screens. */
  onAddScreen: (made: NewScreen) => void;
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
  const sensors = useSensorCatalog().sensors;
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
  /** The Not used collection's "Remove all…", waiting for its confirm. */
  const [confirmMany, setConfirmMany] = useState<LibraryItem[] | null>(null);
  /** The cards ticked for a multi-delete (in the order ticked), and Select mode, where a click ticks. */
  const [picked, setPicked] = useState<string[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  /** The multi-delete waiting for its confirm. */
  const [confirmPicked, setConfirmPicked] = useState<DeletePlan | null>(null);
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
  // The files the studio's config names: an upload set as a background or picked in a widget is in use.
  const used = useMemo(() => usedHashes(p.bridge.config), [p.bridge.config]);
  const index = useMemo(() => {
    const suggested = suggestBackgrounds(lib.items, { foreground: p.theme.foreground, accent: p.theme.accent, name: themeName });
    return buildIndex(lib.items, suggested, used);
  }, [lib.items, p.theme.foreground, p.theme.accent, themeName, used]);
  useAdoptUploads({
    items: lib.items,
    config: p.bridge.config,
    ready: !lib.loading && !lib.error,
    adopt: lib.importAssets,
    onAdopted: (n) => toast(`Added ${n} earlier upload${n === 1 ? "" : "s"} to My library`),
  });
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
    setPicked([]);
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

  /** A click on a card: select it, or (Select mode, Ctrl, Shift) tick it into the multi-selection. */
  const clickCard = (item: LibraryItem, mod: ClickMod) => {
    const next = pickedAfterClick(picked, selectedId, shown.map((i) => i.id), item.id, mod, selectMode);
    setPicked(next);
    if (next.length === 0 || !mod.range) setSelectedId(item.id);
  };

  const open = (item: LibraryItem) => {
    setSelectedId(item.id);
    if (item.kind === "font" && !isBuiltinItem(item)) return pickCollection("fonts");
    if (item.kind === "font") return;
    const primary = primaryOf(item);
    if (primary && !primary.disabled) primary.run();
  };

  const presetCtx: PresetContext = {
    bridge,
    selectionStyle: p.selectionStyle,
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
        return isComponent(item)
          ? { label: "Place on this page", icon: Plus, run: () => void addComponentZone(bridge, item) }
          : { label: "Edit profile", icon: MonitorPlay, run: () => p.onEditCanvas(item) };
      case "style":
        return presetPrimary(item, presetCtx);
      case "template": {
        const t = item.data as ScreenTemplate;
        return { label: "New screen from this", icon: MonitorPlay, run: () => p.onNewScreen(t.id, t.variants?.[0]?.id ?? ""), title: "Opens the New screen page on this template" };
      }
      case "panel":
        return { label: "Add to screen", icon: Plus, run: () => void addToProfile(bridge, item) };
      case "font":
        return isBuiltinItem(item) ? null : { label: "Show font", icon: Type, run: () => pickCollection("fonts") };
      case "ptemplate": {
        const t = item.data as Template;
        return { label: "New InfoPanel profile from this", icon: MonitorPlay, run: () => p.onNewProfile(t.id, t.variants[0]?.id ?? ""), title: "Opens the New page on this template" };
      }
      case "svg":
        return { label: "Add to canvas", icon: Plus, run: () => void addToProfile(bridge, item) };
      default:
        return null;
    }
  }

  /** A built-in or saved panel's copy: a new saved panel in the config (one undo step), selected. */
  const duplicateConfigPanel = (item: LibraryItem) => {
    const id = uid("panel");
    p.bridge.setConfig((c) => duplicatePanel(c, item, id));
    setSelectedId(CONFIG_PANEL + id);
    toast(`Saved ${item.name} copy to your panels`);
  };

  function secondaryOf(item: LibraryItem): DetailAction[] {
    if (isPresetItem(item)) return presetSecondary(item, presetCtx);
    // There is no store of your own templates: a screen template's copy is a new screen in Screens.
    if (item.kind === "template") {
      const t = item.data as ScreenTemplate;
      return [
        {
          label: "Duplicate",
          icon: Copy,
          title: "Adds a new screen made from this template to Screens. The template itself stays as it is.",
          run: () => p.onAddScreen(instantiateScreen(t, { name: `${t.name} copy`, width: t.size.width, height: t.size.height, variant: t.variants?.[0]?.id, sensors: sensors as unknown as Record<string, DataApiValue> })),
        },
      ];
    }
    if (isBuiltinItem(item) && (item.kind === "ptemplate" || item.kind === "font")) return [];
    if (item.kind === "panel" && isConfigItem(item)) return [{ label: "Duplicate", icon: Copy, run: () => duplicateConfigPanel(item), title: "A saved copy to change" }];
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
        label: "Optimize",
        icon: ImageDown,
        run: () =>
          void optimiseItem(item).then(
            (r) => {
              if (!r) return toast("Already as small as it gets: kept as is");
              void lib.update(item, { files: [r.id], meta: { ...item.meta, ...r.meta } }).then(() => toast(`Optimized: saved ${formatBytes(r.saved)}`));
            },
            (e: Error) => toast(`Not optimized: ${e.message}`),
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
      if (!isComponent(item)) out.push({ label: "Add to this page…", icon: FolderInput, run: () => p.onImport({ canvasId: item.id }, "zone") });
    }
    return out;
  }

  /** A saved panel goes from the config (one undo step); copies already placed stay. */
  const deleteSavedPanel = (item: LibraryItem) => {
    if (selectedId === item.id) setSelectedId(null);
    p.bridge.setConfig((c) => deletePanelPreset(c, (item.data as { id: string }).id));
    const undo = p.bridge.undo;
    toast(`Deleted ${item.name}`, undo ? { action: { label: "Undo", onClick: undo }, ms: 8000 } : undefined);
  };
  const askRemove = (item: LibraryItem) => {
    // Delete on a ticked card deletes the whole ticked set.
    if (picked.length > 1 && picked.includes(item.id)) return askDeletePicked();
    if (isSavedPanel(item)) return deleteSavedPanel(item);
    if (!isConfigItem(item)) setConfirmRemove(item);
  };
  const keptWhy = (_why: RemoveBlock) => "a screen uses its file. Take it off the screen first";
  const remove = (item: LibraryItem) => {
    // The live config: it may hold a file the saved config doesn't yet.
    lib.remove(item, () => JSON.stringify(configRef.current)).then(
      ({ deleted, kept, refused }) => {
        if (refused) return toast(`Kept ${item.name}: ${keptWhy(refused)}`);
        if (selectedId === item.id) setSelectedId(null);
        toast(
          kept > 0
            ? `Removed ${item.name}; ${kept} of its files could not be deleted`
            : `Removed ${item.name}${deleted === 0 ? "" : deleted === 1 ? " and its file" : ` and its ${deleted} files`}`,
        );
      },
      (e: Error) => toast(`Not removed: ${e.message}`),
    );
  };
  /** Remove each in turn; one whose file a screen uses stays (checked again here, on the live config). */
  const removeEach = async (items: readonly LibraryItem[]) => {
    let removed = 0;
    let stayed = 0;
    let failed = 0;
    for (const item of items) {
      try {
        const r = await lib.remove(item, () => JSON.stringify(configRef.current));
        if (r.refused) stayed++;
        else removed++;
      } catch {
        failed++;
      }
    }
    if (selectedId && items.some((i) => i.id === selectedId)) setSelectedId(null);
    return { removed, stayed, failed };
  };
  const summary = (verb: string, r: { removed: number; stayed: number; failed: number }) =>
    [`${verb} ${r.removed} item${r.removed === 1 ? "" : "s"}`, r.stayed && `${r.stayed} kept: a screen uses ${r.stayed === 1 ? "its file" : "their files"}`, r.failed && `${r.failed} could not be removed; try again`].filter(Boolean).join("; ");
  const removeMany = async (items: readonly LibraryItem[]) => toast(summary("Removed", await removeEach(items)));
  /** The multi-delete: saved Styles and panels from the config in one edit, the rest through the Library's remove. */
  const deletePicked = async (items: readonly LibraryItem[]) => {
    const own = items.filter(isSavedInConfig);
    if (own.length > 0) p.bridge.setConfig((c) => deleteConfigItems(c, own));
    const r = await removeEach(items.filter((i) => !isSavedInConfig(i)));
    setPicked([]);
    toast(summary("Deleted", { ...r, removed: r.removed + own.length }));
  };
  const askDeletePicked = () => setConfirmPicked(planDelete(picked.map((id) => index.items.find((i) => i.id === id)).filter((i): i is LibraryItem => !!i), used));

  function menuEntries(item: LibraryItem): ContextMenuEntry[] {
    const entry = (a: DetailAction): ContextMenuEntry => ({ id: a.label, label: a.label, icon: <a.icon />, disabled: a.disabled, onSelect: a.run });
    const primary = primaryOf(item);
    const actions = [...(primary ? [entry(primary)] : []), ...secondaryOf(item).map(entry)];
    if (isSavedPanel(item))
      return [
        ...actions,
        "separator" as const,
        {
          id: "rename",
          label: "Rename",
          icon: <Pencil />,
          onSelect: () => {
            setSelectedId(item.id);
            setRenameId(item.id);
          },
        },
        { id: "remove", label: "Delete", icon: <Trash2 />, hint: "Del", danger: true, onSelect: () => deleteSavedPanel(item) },
      ];
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
    ...(c.unused ? [{ id: "unused", title: `${c.unused} not used`, text: "Not used by any screen", action: "Review", onAction: () => pickCollection("unused") }] : []),
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
          primary={primaryOf(item)}
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
        onRename={(name) => (isSavedPanel(item) ? p.bridge.setConfig((c) => renamePanelPreset(c, (item.data as { id: string }).id, name)) : lib.rename(item, name))}
        onRemove={() => askRemove(item)}
        onMerge={(group) => void lib.merge(group).then(() => toast(`Merged into ${group[0].name}`))}
        onVideo={(patch) => void lib.update(item, { meta: { ...item.meta, ...patch } })}
        onUpdateFormat={isOlderItem(item) ? () => updateFormat([item]) : undefined}
        copyLabel={p.copyLabel}
        onJump={p.onJump}
      />
    );
  };

  const older = lib.items.filter(isOlderItem);
  /** Rewrite older items in today's format, each backed up first. */
  const updateFormat = (items: readonly LibraryItem[]) =>
    void lib.updateFormat(items).then(({ updated, failed }) => {
      const done = updated === 1 && items.length === 1 ? `Updated ${items[0].name}` : `Updated ${updated} item${updated === 1 ? "" : "s"}`;
      if (failed.length === 0) toast(`${done}: ${updated === 1 ? "a backup copy is" : "backup copies are"} in the Library`);
      else toast(`${updated > 0 ? `${done}. ` : ""}Not updated, as ${failed.length === 1 ? "it" : "they"} couldn’t be read: ${failed.join(", ")}`);
    });

  const title = searching ? `Results for “${query.trim()}”` : (COLLECTIONS.find((x) => x.id === collection)?.label ?? "All items");
  // First run: the grid's wide upload tile fills the page; the view choice is kept for when items exist.
  const empty = !lib.loading && lib.items.every(isConfigItem);
  const fonts = !searching && collection === "fonts" && !showFiles;
  const uploads = collection === "all" || collection === "media" || COLLECTIONS.some((c) => c.id === collection && c.parent === "media");
  // Not used: the files shown (images, videos, SVGs) can go together; the remove rechecks each file, and a used one stays.
  const removable = !searching && collection === "unused" ? shown.filter((i) => FILE_KINDS.has(i.kind) && !isUsed(i, index)) : [];
  const notUsedAction =
    !searching && collection === "unused"
      ? { label: "Remove these files…", disabled: removable.length === 0, title: "Remove the images, videos and SVGs shown here: a file a screen uses stays", onRun: () => setConfirmMany(removable) }
      : undefined;

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
          <div role="radiogroup" aria-label="View" onKeyDown={(e) => onRovingKeyDown(e, '[role="radio"]')} className="flex h-[34px] items-center gap-0.5 rounded-[9px] border border-ui-default p-0.5">
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
                tabIndex={view === id ? 0 : -1}
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
          title="The files its canvases use: replace and optimize them"
          className={cn("flex h-[34px] max-w-[220px] items-center gap-1.5 rounded-[8px] border border-ui-default px-3 text-[12.5px] text-ui-1 hover:bg-ui-hover", showFiles && "bg-ui-active")}
        >
          <FolderInput className="h-4 w-4 shrink-0" />
          <span className="truncate">Canvas files · {p.profileName}</span>
        </button>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => openNewInfoPanel()}
          title="An InfoPanel profile from scratch, as a new screen in Edit"
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
            <LibrarySidebar active={searching || showFiles ? null : collection} counts={counts} onPick={pickCollection} onOpenTheme={p.onOpenTheme} />
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
                  {older.length > 0 && (
                    <div role="status" className="mx-4 mt-4 flex items-center gap-3 rounded-lg border border-ui-warning/40 bg-ui-warning/10 px-3 py-2 text-[12.5px] text-ui-2">
                      <span className="min-w-0 flex-1">
                        {older.length === 1 ? "1 item was" : `${older.length} items were`} saved by an older version. {older.length === 1 ? "It works" : "They work"} as{" "}
                        {older.length === 1 ? "it is" : "they are"}; Update saves {older.length === 1 ? "it" : "them"} in today&rsquo;s format and keeps a copy of {older.length === 1 ? "it" : "each"} as it was.
                      </span>
                      <button type="button" onClick={() => updateFormat(older)} className="h-[28px] shrink-0 rounded-[7px] border border-ui-default px-2.5 text-[12px] text-ui-1 hover:bg-ui-hover">
                        {older.length === 1 ? "Update" : "Update all"}
                      </button>
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
                      picked={picked}
                      selectMode={selectMode}
                      onSelectMode={(on) => {
                        setSelectMode(on);
                        if (!on) setPicked([]);
                      }}
                      onPickAll={() => setPicked(shown.map((i) => i.id))}
                      onClearPicked={() => setPicked([])}
                      onDeletePicked={askDeletePicked}
                      onSelect={clickCard}
                      onOpen={open}
                      onMenu={(item, x, y) => setMenu({ item, x, y })}
                      onRemove={askRemove}
                      onFiles={addFiles}
                      searching={searching}
                      empty={empty}
                      uploadTile={uploads && !usedBy}
                      hint={searching ? undefined : hintOf(collection)}
                      action={notUsedAction}
                    />
                  )}
                </div>
                {picked.length > 1 ? (
                  <aside aria-label="Selection" className="flex w-[320px] shrink-0 flex-col items-center justify-center gap-3 border-l border-ui-subtle bg-ui-panel p-6 text-center text-[12.5px] text-ui-3 max-sm:w-full">
                    <ListChecks className="h-5 w-5" />
                    {picked.length} items selected
                    <button
                      type="button"
                      onClick={askDeletePicked}
                      className="flex h-[34px] items-center gap-1.5 rounded-[8px] border border-ui-danger/50 px-3 text-ui-danger hover:bg-ui-danger/10"
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete…
                    </button>
                    <button type="button" onClick={() => setPicked([])} className="text-[12px] text-ui-4 hover:text-ui-1">
                      Clear selection
                    </button>
                  </aside>
                ) : selected ? (
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
        <DeleteSelectedDialog plan={confirmPicked} onClose={() => setConfirmPicked(null)} onDelete={(items) => void deletePicked(items)} />
        <RemoveManyDialog items={confirmMany} onClose={() => setConfirmMany(null)} onRemove={(items) => void removeMany(items)} />
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

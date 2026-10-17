/**
 * The Library page (spec §3), opened from the rail: a 56 px header ([My library | Profile assets ·
 * <profile>], search everything, [Grid | Shelves], Import profile, Upload) over the collections
 * sidebar, the grid or shelves, and the detail pane. Fonts is a collection with its own view; the
 * profile assets tab is the active profile's canvas files. Lazy-loaded.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Copy,
  Download,
  Eye,
  FolderInput,
  Gauge,
  ImageDown,
  LayoutGrid,
  MonitorPlay,
  Paintbrush,
  Plus,
  Rows3,
  Search,
  Type,
  Upload,
  Wallpaper,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { formatBytes } from "@/lib/assets";
import type { LibraryCopy, LibraryItem } from "@/lib/library";
import { THEME_PRESETS, type ThemeTokens } from "@/lib/theme";
import {
  buildIndex,
  cleanupCounts,
  collectionCounts,
  collectionItems,
  COLLECTIONS,
  search,
  sortItems,
  tagsOf,
  topTags,
  type CollectionId,
  type SortId,
} from "@/lib/my-library/model";
import { suggestBackgrounds } from "@/lib/my-library/theme-suggest";
import { addToProfile, applyStyle, setAsBackground, type StudioBridge } from "./library-actions";
import { LibraryDetail, type DetailAction } from "./library-detail";
import { GridView, LibrarySidebar, ShelvesView, fileDrop } from "./library-views";
import { optimiseItem } from "./optimise";
import { FontsView } from "./fonts-view";
import { ProfileAssets, type ProfileAssetsProps } from "./profile-assets";
import { UploadTray } from "./upload-tray";
import { useMyLibrary } from "./use-my-library";
import { LIBRARY_MIME, setActiveLibraryDrag } from "@/lib/my-library/drag";
import { canvasKeyAction } from "@/components/infopanel/edit/canvas-keys";

const isTyping = (el: Element | null) =>
  el instanceof HTMLElement && (el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT");

/**
 * The studio's zone shortcuts (Del, Ctrl+D, arrows …) would act on the canvas hidden behind the
 * page: hold them back while it is open. Undo, redo, save and the palette still pass.
 */
function useHoldZoneShortcuts() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const action = canvasKeyAction(
        { key: e.key, code: e.code, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, altKey: e.altKey },
        { typing: isTyping(document.activeElement), overlay: document.querySelector('[role="dialog"], [role="menu"]') !== null },
      );
      if (action && action.type !== "escape") e.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}

export interface LibraryPageProps {
  bridge: StudioBridge;
  /** A card dragged onto "Drop on the canvas": the page makes way so the drag goes on to the canvas. */
  onShowCanvas: () => void;
  theme: ThemeTokens;
  /** The stored profile's name (the tab, the suggestions' note). */
  profileName: string;
  /** Open the Import dialog: a profile file, or a saved canvas from the library. */
  onImport: (source?: { file: File } | { canvasId: string }) => void;
  /** Export a saved canvas (download) without placing it. */
  onExportCanvas: (item: LibraryItem) => void;
  copyLabel: (copy: LibraryCopy) => string;
  onJump: (copy: LibraryCopy) => void;
  /** The profile assets tab's studio side. */
  assets: Omit<ProfileAssetsProps, "onSaveToLibrary">;
}

type Tab = "mine" | "profile";

export default function LibraryPage(p: LibraryPageProps) {
  const toast = useToast();
  const lib = useMyLibrary(p.bridge.config);
  const [tab, setTab] = useState<Tab>("mine");
  const [view, setView] = useState<"grid" | "shelves">("grid");
  const [collection, setCollection] = useState<CollectionId>("all");
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [sort, setSort] = useState<SortId>("recent");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  useHoldZoneShortcuts();

  // Copies counted through the page's list, so the counts update in place.
  const bridge: StudioBridge = { ...p.bridge, addCopy: lib.addCopy };
  const [dragging, setDragging] = useState(false);
  const themeName = THEME_PRESETS.find((t) => t.tokens.accent === p.theme.accent && t.tokens.foreground === p.theme.foreground)?.label;
  const index = useMemo(() => {
    const suggested = suggestBackgrounds(lib.items, { foreground: p.theme.foreground, accent: p.theme.accent, name: themeName });
    return buildIndex(lib.items, suggested);
  }, [lib.items, p.theme.foreground, p.theme.accent, themeName]);
  const counts = useMemo(() => collectionCounts(index), [index]);

  const searching = query.trim().length > 0;
  const base = searching ? search(index.items, query) : collectionItems(collection, index);
  const tags = useMemo(() => topTags(base), [base]);
  const shown = sortItems(tag ? base.filter((i) => tagsOf(i).includes(tag)) : base, sort);
  const selected = lib.items.find((i) => i.id === selectedId) ?? null;

  const pickCollection = (id: CollectionId) => {
    setTab("mine");
    setCollection(id);
    setQuery("");
    setTag(null);
    if (id !== "all") setView("grid");
  };
  const addFiles = (files: File[]) => lib.addFiles(files, (file) => p.onImport({ file }));

  const open = (item: LibraryItem) => {
    setSelectedId(item.id);
    if (item.kind === "font") return pickCollection("fonts");
    const primary = primaryOf(item);
    if (primary && !primary.disabled) primary.run();
  };

  function primaryOf(item: LibraryItem): DetailAction | null {
    switch (item.kind) {
      case "image":
      case "video":
        return { label: "Set as background", icon: Wallpaper, run: () => setAsBackground(bridge, item) };
      case "gauge":
        return { label: "Open in editor", icon: Gauge, run: () => {}, disabled: true, title: "The gauge editor comes with the Gauges page" };
      case "canvas":
        return { label: "Open canvas", icon: MonitorPlay, run: () => p.onImport({ canvasId: item.id }) };
      case "style":
        return {
          label: "Apply to selection",
          icon: Paintbrush,
          run: () => void applyStyle(bridge, item),
          disabled: p.bridge.selection.length === 0,
          title: p.bridge.selection.length === 0 ? "Select a widget on the canvas first" : undefined,
        };
      case "panel":
        return { label: "Add to profile", icon: Plus, run: () => void addToProfile(bridge, item) };
      case "font":
        return { label: "Show font", icon: Type, run: () => pickCollection("fonts") };
      case "svg":
        return { label: "Add to canvas", icon: Plus, run: () => void addToProfile(bridge, item) };
      default:
        return null;
    }
  }

  function secondaryOf(item: LibraryItem): DetailAction[] {
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
    if (item.kind === "gauge") out.push({ label: "Export .gauge.json", icon: Download, run: () => {}, disabled: true, title: "Comes with the Gauges page" });
    if (item.kind === "canvas") {
      out.push({ label: "Export…", icon: Download, run: () => p.onExportCanvas(item) });
      out.push({ label: "Re-import…", icon: FolderInput, run: () => p.onImport({ canvasId: item.id }) });
    }
    return out;
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
    ...(c.unused ? [{ id: "unused", title: `${c.unused} unused`, text: "Not used by any profile", action: "Review", onAction: () => pickCollection("unused") }] : []),
    ...(c.large ? [{ id: "large", title: `${c.large} large file${c.large === 1 ? "" : "s"}`, text: `${formatBytes(c.largeBytes)} in all`, action: "Review", onAction: () => pickCollection("large") }] : []),
  ];
  const shelves = [
    { id: "suggested" as const, title: "Suggested backgrounds", note: `For the ${themeName ?? "current"} theme on ${p.profileName}`, items: index.suggested.map((s) => s.item) },
    { id: "recent" as const, title: "Recent", note: "Added or edited this week", items: sortItems(collectionItems("recent", index), "recent") },
    { id: "gauges" as const, title: "Gauges & bars", note: "Built here or imported", items: collectionItems("gauges", index) },
    { id: "videos" as const, title: "Videos", note: "Backgrounds that move", items: collectionItems("videos", index) },
    { id: "panels" as const, title: "Saved panels & styles", note: "Yours to reuse", items: [...collectionItems("panels", index), ...collectionItems("styles", index)] },
  ];

  const title = searching ? `Results for “${query.trim()}”` : (COLLECTIONS.find((x) => x.id === collection)?.label ?? "All items");
  const fonts = !searching && collection === "fonts" && tab === "mine";

  return (
    <div
      className="flex min-h-0 min-w-0 flex-1 flex-col bg-ui-app font-ui"
      {...fileDrop(addFiles)}
      onDragStart={(e) => setDragging(e.dataTransfer.types.includes(LIBRARY_MIME))}
      onDragEnd={() => {
        setDragging(false);
        setActiveLibraryDrag(null);
      }}
    >
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-ui-subtle bg-ui-chrome px-4">
        <h1 className="text-[15px] font-semibold text-ui-1">Library</h1>
        <div role="tablist" aria-label="Library" className="flex h-[34px] items-center gap-0.5 rounded-[9px] border border-ui-default p-0.5">
          {(
            [
              ["mine", "My library"],
              ["profile", `Profile assets · ${p.profileName}`],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn("h-full max-w-[260px] truncate rounded-[7px] px-3 text-[12.5px] text-ui-3 hover:text-ui-1", tab === id && "bg-ui-active text-ui-1")}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "mine" && (
          <label className="flex h-[34px] min-w-0 max-w-[520px] flex-1 items-center gap-2 rounded-[9px] border border-ui-default bg-ui-panel px-3 focus-within:border-ui-accent">
            <Search className="h-4 w-4 shrink-0 text-ui-4" />
            <input
              type="search"
              aria-label="Search everything"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setTag(null);
              }}
              placeholder="Search everything: names, tags, colours, sizes"
              className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ui-1 outline-none placeholder:text-ui-4"
            />
            {query && (
              <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="text-ui-4 hover:text-ui-1">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </label>
        )}
        {tab === "mine" && (
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
        <span className="flex-1" />
        <button
          type="button"
          onClick={() => p.onImport()}
          className="flex h-[34px] items-center gap-1.5 rounded-[8px] border border-ui-default px-3 text-[12.5px] text-ui-1 hover:bg-ui-hover"
        >
          <Download className="h-4 w-4" /> Import profile
        </button>
        <button
          type="button"
          onClick={() => uploadRef.current?.click()}
          className="flex h-[34px] items-center gap-1.5 rounded-[8px] bg-ui-inverse px-3 text-[12.5px] font-medium text-ui-inverse-fg hover:opacity-90"
        >
          <Upload className="h-4 w-4" /> Upload
        </button>
        <input
          ref={uploadRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (files.length) addFiles(files);
          }}
        />
      </header>
      <div className="relative flex min-h-0 flex-1">
        {tab === "profile" ? (
          <ProfileAssets {...p.assets} onSaveToLibrary={(files) => addFiles(files)} />
        ) : (
          <>
            <LibrarySidebar active={searching ? null : collection} counts={counts} onPick={pickCollection} />
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
                  {view === "shelves" && !searching ? (
                    <ShelvesView
                      index={index}
                      shelves={shelves}
                      attention={attention}
                      selectedId={selectedId}
                      onSelect={(i) => setSelectedId(i.id)}
                      onOpen={open}
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
                      onFiles={addFiles}
                      searching={searching}
                      empty={!lib.loading && lib.items.length === 0}
                    />
                  )}
                </div>
                {selected ? (
                  <LibraryDetail
                    key={selected.id}
                    item={selected}
                    index={index}
                    primary={primaryOf(selected)}
                    secondary={secondaryOf(selected)}
                    onRename={(name) => lib.rename(selected, name)}
                    onRemove={() => {
                      lib.remove(selected);
                      setSelectedId(null);
                    }}
                    onMerge={(group) => void lib.merge(group).then(() => toast(`Merged into ${group[0].name}`))}
                    onVideo={(patch) => void lib.update(selected, { meta: { ...selected.meta, ...patch } })}
                    copyLabel={p.copyLabel}
                    onJump={p.onJump}
                  />
                ) : (
                  <aside className="flex w-[320px] shrink-0 flex-col items-center justify-center gap-2 border-l border-ui-subtle bg-ui-panel p-6 text-center text-[12.5px] text-ui-4">
                    <Eye className="h-5 w-5" />
                    Select an item to see it here. Drag a card onto the canvas to place a copy.
                  </aside>
                )}
              </>
            )}
          </>
        )}
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

import type { HistorySetter } from "@/hooks/use-config-history";
import { useToast } from "@/components/ui/toast";
import {
  addPage,
  duplicatePage,
  movePage,
  onPage,
  pageOf,
  removePage,
  renamePage,
  setPageIcon,
} from "@/lib/pages";
import {
  BLANK_MODULE,
  PANEL_ID,
  newProfile,
  uid,
  type DashboardConfig,
  type MonitorProfile,
  type PageRotate,
  type ProfileView,
  type Placement,
} from "@/lib/layout";
import { findPanelPreset, type PanelPreset } from "@/lib/panelPresets";
import { sampleLayout } from "@/lib/sample-layout";
import type { ModuleSettings } from "@/modules/types";
import * as actions from "./studio-actions";
import { deletePanelPreset, renamePanelPreset, savePanelPreset } from "./panel-preset-actions";
import { pinAfterAdd } from "./pinned-profile";
import { withoutProfile, withProfile } from "./profile-actions";
import { moduleDropSize, type LibraryItem } from "./drop-ghost";
import { ALL_MODULES, moduleMinSize } from "./studio-modules";
import type { StudioSelection } from "./use-studio-selection";
import {
  enforceMinSize,
  firstFreeRect,
  fitZoneRect,
  moveZoneSet,
  resizeZone,
  type ZoneRect,
} from "./zone-geometry";

interface MutationDeps {
  config: DashboardConfig;
  /** The resolved (active) grid profile being edited. */
  profile: ProfileView;
  setConfig: HistorySetter;
  sel: StudioSelection;
  /** Close the panel inspector's preset name input. */
  onPresetSaved: () => void;
  /** The window size a new profile starts with. */
  windowSize: { width: number; height: number };
  /** Show another page of the profile on the canvas (view state). */
  onPageChange: (pageId: string) => void;
  /** The profile the studio is pinned to for editing, if any (studio-only, not in the config). */
  pinnedId: string | undefined;
  onPin: (id: string | undefined) => void;
}

/**
 * Every edit the studio makes to the config, through the undo history.
 * Same-`key` changes coalesce into one undo step (a drag, a key repeat).
 */
export function useStudioMutations({ config, profile, setConfig, sel, onPresetSaved, windowSize, onPageChange, pinnedId, onPin }: MutationDeps) {
  const { selected } = sel;
  const toast = useToast();

  /** Mutate the active profile; same-`key` changes coalesce in undo. */
  const updateProfile = (fn: (p: ProfileView) => ProfileView, key?: string) => {
    // The same config back when `fn` changes nothing: the history records no step.
    setConfig((c) => {
      const profiles = c.profiles.map((p) => (p.id === profile.id ? onPage(profile.pageId, fn)(p) : p));
      return profiles.every((p, i) => p === c.profiles[i]) ? c : { ...c, profiles };
    }, key);
  };

  /** Mutate the whole stored profile (pages, rotate); same no-op identity rule as `updateProfile`. */
  const updateStored = (fn: (p: MonitorProfile) => MonitorProfile, key?: string) => {
    setConfig((c) => {
      const profiles = c.profiles.map((p) => (p.id === profile.id ? fn(p) : p));
      return profiles.every((p, i) => p === c.profiles[i]) ? c : { ...c, profiles };
    }, key);
  };

  /** Generic placement mutation (settings, design, ...). */
  const updatePlacement = (id: string, fn: (p: Placement) => Placement, key?: string) =>
    updateProfile((p) => actions.updatePlacement(p, id, fn), key);

  /** Mutate the primary zone; keyed edits coalesce per zone. */
  const updateSelected = (fn: (p: Placement) => Placement, key?: string) => {
    if (selected) updatePlacement(selected.id, fn, key && `${selected.id}:${key}`);
  };

  /** A library item's name (toasts) and its footprint when placed on this grid. */
  const libraryInfo = (item: LibraryItem): { title: string; size: { cols: number; rows: number } } | null => {
    if (item.kind === "module") {
      const title = item.id === BLANK_MODULE ? "Blank zone" : ALL_MODULES.find((m) => m.id === item.id)?.title;
      return title ? { title, size: moduleDropSize(item.id, profile) } : null;
    }
    const preset = findPanelPreset(item.id, config.panelPresets);
    if (!preset) return null;
    return {
      title: preset.title,
      size: { cols: Math.min(profile.cols, preset.colSpan), rows: Math.min(profile.rows, preset.rowSpan) },
    };
  };

  /** The footprint a dragged library item would drop with (null = unknown item). */
  const dropSizeOf = (item: LibraryItem) => libraryInfo(item)?.size ?? null;

  /** Create a library item's zone in `rect` (already checked free) and select it. */
  const createAt = (item: LibraryItem, rect: ZoneRect) => {
    const preset = item.kind === "panel" ? findPanelPreset(item.id, config.panelPresets) : undefined;
    if (item.kind === "panel" && !preset) return null;
    const id = uid(item.kind === "panel" ? PANEL_ID : item.id);
    updateProfile((p) =>
      preset ? actions.addPresetAt(p, id, preset, rect) : actions.addModuleAt(p, id, item.id, rect)
    );
    sel.select(id);
    return id;
  };

  /** A library item dropped on the canvas at the ghost's box (null = the ghost said no room). */
  const dropItem = (item: LibraryItem, rect: ZoneRect | null) => {
    if (!rect) return void toast("No room there");
    const info = libraryInfo(item);
    if (info && createAt(item, rect)) toast(`Added ${info.title}`);
  };

  /** A click in the library: the first free spot, rows first. */
  const placeItem = (item: LibraryItem) => {
    const info = libraryInfo(item);
    if (!info) return;
    const pos = firstFreeRect(profile.cols, profile.rows, info.size, profile.placements);
    if (!pos) return void toast("No free space — resize or remove a widget first");
    createAt(item, pos);
    toast(`Placed ${info.title}`);
  };

  /**
   * A click in the library with a blank zone selected: the widget fills
   * it, growing it to the widget's minimum when there is room.
   */
  const fillBlank = (zoneId: string, item: LibraryItem) => {
    const zone = profile.placements.find((p) => p.id === zoneId);
    const info = libraryInfo(item);
    if (!zone || !info || item.id === BLANK_MODULE) return;
    if (item.kind === "module") {
      if (!actions.canGrowTo(profile, zoneId, moduleMinSize(item.id)))
        return void toast("Not enough room in this zone");
      updateProfile((p) => actions.assignModule(p, zoneId, item.id, moduleMinSize(item.id)));
    } else {
      const preset = findPanelPreset(item.id, config.panelPresets);
      if (!preset) return;
      if (!actions.canGrowTo(profile, zoneId, { cols: preset.colSpan, rows: preset.rowSpan }))
        return void toast("Not enough room in this zone");
      updateProfile((p) => actions.assignPreset(p, zoneId, preset));
    }
    toast(`Placed ${info.title}`);
  };

  const addPlacement = (module: string) => placeItem({ kind: "module", id: module });

  /** Add a pre-designed panel (a group of widgets) from a preset. */
  const addPanelPreset = (preset: PanelPreset) => placeItem({ kind: "panel", id: preset.id });

  /** Add a panel preset (built in, starter or saved) by id. */
  const addPanelPresetById = (presetId: string) => placeItem({ kind: "panel", id: presetId });

  /** Save the primary panel zone to My panels (one undo step). */
  const savePanelAsPreset = (name: string) => {
    if (selected?.panel) {
      setConfig((c) => savePanelPreset(c, selected, uid("panelpreset"), name));
      toast(`Saved '${name}' to My panels`);
    }
    onPresetSaved();
  };

  const renameSavedPanel = (id: string, name: string) => setConfig((c) => renamePanelPreset(c, id, name));
  const deleteSavedPanel = (id: string) => setConfig((c) => deletePanelPreset(c, id));

  /** A zone drawn on the canvas becomes a blank zone, then is selected. */
  const addDrawnZone = (rect: ZoneRect) => {
    const id = uid(BLANK_MODULE);
    updateProfile((p) => actions.addBlankZone(p, id, rect));
    sel.select(id);
  };

  /** Hide or show zones; showing is refused when their cells were taken meanwhile. */
  const toggleZones = (ids: readonly string[]) => {
    if (ids.length === 0) return;
    if (!actions.canToggleZonesVisible(profile, ids)) return void toast("No room to show — it overlaps another widget");
    updateProfile((p) => actions.toggleZonesVisible(p, ids));
  };
  const toggleVisible = (id: string) => toggleZones([id]);
  const removePlacement = (id: string) => {
    updateProfile((p) => actions.removePlacement(p, id));
    toast("Deleted 1 widget · ⌘Z to undo");
  };

  /** Copy zones to free spots (one undo step) and select the copies. */
  const duplicateZones = (ids: readonly string[]) => {
    let copies: string[] = [];
    updateProfile((p) => {
      const result = actions.duplicateZones(p, ids);
      copies = result.copies;
      return result.profile;
    });
    // The history setter runs the update synchronously.
    if (copies.length === 0) return void toast("No free space for a copy");
    sel.selectMany(copies);
    toast(copies.length > 1 ? `Duplicated ${copies.length} widgets` : "Duplicated");
  };

  /* The selection's hide / duplicate / remove (toolbar, keys, palette). */
  const toggleSelectionVisible = () => toggleZones(sel.selectedIds);
  const duplicateSelection = () => duplicateZones(sel.selectedIds);
  const removeSelection = () => {
    const n = sel.selectedIds.length;
    if (n === 0) return;
    updateProfile((p) => actions.removeZones(p, sel.selectedIds));
    toast(`Deleted ${n} widget${n === 1 ? "" : "s"} · ⌘Z to undo`);
  };

  /** Paste a copied style onto the selection (one undo step). */
  const pasteStyleSelection = (style: ModuleSettings) => {
    if (sel.selectedIds.length > 0) updateProfile((p) => actions.pasteStyleToZones(p, sel.selectedIds, style));
  };

  /** The selection follows the global style; their own look is cleared (one undo step). */
  const followGlobalSelection = () => {
    if (sel.selectedIds.length > 0) updateProfile((p) => actions.followGlobalStyle(p, sel.selectedIds));
  };

  /** The empty-layout card: the sample layout's grid and zones, one undo step. */
  const loadSampleLayout = () => {
    // Other pages share the grid: keep it when any of them holds zones.
    const page = currentPageId();
    const keepGrid = stored().pages.some((pg) => pg.id !== page && pg.placements.length > 0);
    updateProfile((p) => actions.withSampleZones(p, sampleLayout(), keepGrid));
    sel.select(null);
  };

  /**
   * Set a zone's box; `key` makes a drag or key repeat one undo step. Checked
   * against the newest profile (a drag's handler is a render behind), so a
   * move back to the start box is applied rather than skipped.
   */
  const setZoneRect = (id: string, rect: ZoneRect, key?: string) =>
    updateProfile((p) => actions.setZoneRect(p, id, rect), key);

  /** Set several zones' boxes as one step (a multi-zone drag or nudge). */
  const setZoneRects = (rects: Record<string, ZoneRect>, key?: string) =>
    updateProfile((p) => actions.setZoneRects(p, rects), key);

  /** Arrow keys: move the whole selection one cell (all or nothing). */
  const moveSelection = (delta: { cols: number; rows: number }) => {
    const ids = sel.selectedIds;
    const rects = moveZoneSet(profile.placements, ids, delta, profile.cols, profile.rows);
    if (rects) setZoneRects(rects, `zone-nudge:${ids.join()}`);
  };

  /** The primary zone at a new size (toolbar steps); null = blocked. */
  const resizeSelected = (size: { cols: number; rows: number }) =>
    selected
      ? resizeZone(selected, size, profile.placements, profile.cols, profile.rows, actions.zoneMinSize(selected))
      : null;

  /** Shift+arrows: resize the primary zone one cell. */
  const resizePrimary = (delta: { cols: number; rows: number }) => {
    if (!selected) return;
    const rect = resizeSelected({ cols: selected.colSpan + delta.cols, rows: selected.rowSpan + delta.rows });
    if (rect) setZoneRect(selected.id, rect, `zone-resize:${selected.id}`);
  };

  /**
   * Set the primary zone's box (inspector inputs), at least its minimum
   * size, clamped + no overlap; a box that can't be placed keeps the old one.
   */
  const setZoneBox = (patch: Partial<ZoneRect>) => {
    if (!selected) return;
    const next = enforceMinSize(
      { col: selected.colStart, row: selected.rowStart, cols: selected.colSpan, rows: selected.rowSpan, ...patch },
      selected,
      actions.zoneMinSize(selected)
    );
    const clamped = fitZoneRect(next, profile.placements, profile.cols, profile.rows, selected.id);
    if (clamped) setZoneRect(selected.id, clamped, `zone-box:${selected.id}`);
  };

  /** Assign a widget to a zone (blank, module, or preset panel). */
  const assignWidget = (id: string, value: string) => {
    if (value === "blank") {
      updateProfile((p) => actions.clearWidget(p, id));
    } else if (value.startsWith("module:")) {
      const module = value.slice("module:".length);
      if (!actions.canGrowTo(profile, id, moduleMinSize(module))) return void toast("Not enough room in this zone");
      updateProfile((p) => actions.assignModule(p, id, module, moduleMinSize(module)));
    } else if (value.startsWith("preset:")) {
      const preset = findPanelPreset(value.slice("preset:".length), config.panelPresets);
      if (!preset) return;
      if (!actions.canGrowTo(profile, id, { cols: preset.colSpan, rows: preset.rowSpan }))
        return void toast("Not enough room in this zone");
      updateProfile((p) => actions.assignPreset(p, id, preset));
    }
  };

  /** The stored profile behind the page on the canvas. */
  const stored = () => config.profiles.find((p) => p.id === profile.id) ?? config.profiles[0];
  const currentPageId = () => pageOf(stored(), profile.pageId).id;

  /** Page actions: each one undo step. Add and duplicate switch to the new page. */
  const addNewPage = () => {
    let pageId: string | undefined;
    updateStored((p) => {
      const result = addPage(p);
      pageId = result.pageId;
      return result.profile;
    });
    // The history setter runs the update synchronously.
    if (pageId) onPageChange(pageId);
  };
  const duplicateCurrentPage = (id: string) => {
    let pageId: string | undefined;
    updateStored((p) => {
      const result = duplicatePage(p, id);
      pageId = result.pageId;
      return result.profile;
    });
    if (pageId && pageId !== id) onPageChange(pageId);
  };
  /** Delete a page (never the last); when it is the one shown, the neighbour takes over. */
  const deletePage = (id: string) => {
    const pages = stored().pages;
    const at = pages.findIndex((p) => p.id === id);
    if (pages.length <= 1 || at < 0) return;
    if (id === currentPageId()) onPageChange((pages[at + 1] ?? pages[at - 1]).id);
    updateStored((p) => removePage(p, id));
  };
  const movePageTo = (id: string, toIndex: number) => updateStored((p) => movePage(p, id, toIndex));
  const renamePageTo = (id: string, name: string) => updateStored((p) => renamePage(p, id, name));
  const setIconOfPage = (id: string, icon: string | undefined) => updateStored((p) => setPageIcon(p, id, icon));

  /** Show the page `delta` steps from this one (wraps). */
  const stepPage = (delta: 1 | -1) => {
    const pages = stored().pages;
    const at = pages.findIndex((p) => p.id === currentPageId());
    onPageChange(pages[(at + delta + pages.length) % pages.length].id);
  };

  /** Move the selected zones to another page of the profile (one undo step). */
  const moveSelectionToPage = (to: string) => {
    const ids = sel.selectedIds;
    const target = stored().pages.find((p) => p.id === to);
    if (ids.length === 0 || !target) return;
    const from = currentPageId();
    let refused = false;
    updateStored((p) => {
      const next = actions.moveZonesToPage(p, ids, from, to, actions.zoneMinSize);
      refused = next === null;
      return next ?? p;
    });
    if (refused) return void toast(`No room on ${target.name}`);
    toast(`Moved ${ids.length} ${ids.length === 1 ? "widget" : "widgets"} to ${target.name}`);
  };

  /** Write the profile's auto-rotate option (created on the first change). */
  const setRotate = (patch: Partial<PageRotate>) =>
    updateStored((p) => ({ ...p, rotate: { enabled: false, seconds: 15, ...p.rotate, ...patch } }), "profile:rotate");

  /** Add a profile and edit it; displays switch to it unless the studio is pinned (the pin moves instead). */
  const addProfile = () => {
    const np = newProfile(`${windowSize.width}×${windowSize.height}`, windowSize.width, windowSize.height);
    setConfig((c) => withProfile(c, np, !pinnedId));
    onPin(pinAfterAdd(pinnedId, np.id));
  };

  /**
   * Delete a profile (never the last; one undo step); see `withoutProfile` for the pick afterwards.
   * Pinned, the edited profile is not what displays show, so only the displayed one resets them.
   */
  const removeProfile = (id: string) => {
    if (config.profiles.length <= 1) return;
    setConfig((c) => withoutProfile(c, id, pinnedId ? c.activeProfile : profile.id));
  };

  /** What displays show; the profile being edited follows it only while nothing is pinned. */
  const activateProfile = (id: string) => setConfig((c) => ({ ...c, activeProfile: id }));

  const saveStylePreset = (name: string, settings: ModuleSettings) =>
    setConfig((c) => ({
      ...c,
      stylePresets: [...(c.stylePresets ?? []), { id: uid("style"), name, settings }],
    }));

  const deleteStylePreset = (id: string) =>
    setConfig((c) => ({
      ...c,
      stylePresets: c.stylePresets?.filter((p) => p.id !== id),
    }));

  return {
    updateProfile,
    updateStored,
    updatePlacement,
    updateSelected,
    addPlacement,
    addPanelPreset,
    dropSizeOf,
    dropItem,
    fillBlank,
    pasteStyleSelection,
    followGlobalSelection,
    loadSampleLayout,
    addPanelPresetById,
    savePanelAsPreset,
    renameSavedPanel,
    deleteSavedPanel,
    addDrawnZone,
    toggleVisible,
    removePlacement,
    duplicateZones,
    toggleSelectionVisible,
    duplicateSelection,
    removeSelection,
    setZoneRect,
    setZoneRects,
    moveSelection,
    resizeSelected,
    resizePrimary,
    setZoneBox,
    assignWidget,
    addProfile,
    removeProfile,
    activateProfile,
    addNewPage,
    duplicateCurrentPage,
    deletePage,
    movePageTo,
    renamePageTo,
    setIconOfPage,
    stepPage,
    moveSelectionToPage,
    setRotate,
    saveStylePreset,
    deleteStylePreset,
  };
}

export type StudioMutations = ReturnType<typeof useStudioMutations>;

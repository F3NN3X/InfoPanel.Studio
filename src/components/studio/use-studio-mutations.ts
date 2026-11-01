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
  uid,
  type DashboardConfig,
  type MonitorProfile,
  type PageRotate,
  type ProfilePage,
  type ProfileView,
  type Placement,
} from "@/lib/layout";
import { findPanelPreset } from "@/lib/panelPresets";
import type { PageOp, PartNode } from "@/lib/page-model/model";
import type { StoredItem } from "@/lib/infopanel/import/stored";
import { applyPlacements } from "@/lib/page-model/placements-adapter";
import { sampleLayout } from "@/lib/sample-layout";
import { updateStylePreset } from "@/lib/style-presets";
import type { ModuleSettings } from "@/modules/types";
import * as actions from "./studio-actions";
import { arrangeZones, type ArrangeOp } from "./zone-arrange";
import { deletePanelPreset, renamePanelPreset, savePanelPreset } from "./panel-preset-actions";
import { duplicateProfile as duplicateInConfig, withoutProfile, withProfile } from "./profile-actions";
import { moduleDropSize, type LibraryItem } from "./drop-ghost";
import { ALL_MODULES, moduleMinSize } from "./studio-modules";
import type { StudioSelection } from "./use-studio-selection";
import { autoPlace } from "./add-place";
import { fitsIn, sizeText, type AddItem } from "./add-catalog";
import {
  enforceMinSize,
  firstFreeRect,
  fitZoneRect,
  moveZoneSet,
  resizeZone,
  type ZoneRect,
} from "./zone-geometry";

/** What an Add panel add did, for its toast. */
export type AddOutcome = { added: true; zoneId: string; message: string } | { added: false; message: string };

interface MutationDeps {
  config: DashboardConfig;
  /** The resolved (active) grid profile being edited. */
  profile: ProfileView;
  setConfig: HistorySetter;
  sel: StudioSelection;
  /** Close the panel inspector's preset name input. */
  onPresetSaved: () => void;
  /** Show another page of the profile on the canvas (view state). */
  onPageChange: (pageId: string) => void;
  /** Select a profile for editing (studio-only view state, not in the config). */
  onSelectProfile: (id: string) => void;
  /** The history's undo: a saved panel's delete toast offers it. */
  onUndo?: () => void;
}

/**
 * Every edit the studio makes to the config, through the undo history.
 * Same-`key` changes coalesce into one undo step (a drag, a key repeat).
 */
export function useStudioMutations({ config, profile, setConfig, sel, onPresetSaved, onPageChange, onSelectProfile, onUndo }: MutationDeps) {
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

  /** Page model ops on the page on the canvas (Edit v3 SPEC §3.4): its items and elements, through the model. */
  const applyPageOps = (ops: readonly PageOp[], key?: string) =>
    updateStored((p) => {
      const page = pageOf(p, profile.pageId);
      const next = applyPlacements(p, page, ops);
      return next === page ? p : { ...p, pages: p.pages.map((pg) => (pg === page ? next : pg)) };
    }, key);

  /**
   * A new InfoPanel item or element on the page on the canvas (Edit v3 SPEC §7.4): the part on top, inside `parentId`
   * when a group is selected, and the page's store (files, fonts) the item draws with; one undo step.
   */
  const addPagePart = (part: PartNode, parentId: string | null, store: ProfilePage["freeCanvas"]) =>
    updateStored((p) => {
      const page = pageOf(p, profile.pageId);
      const next = applyPlacements(p, { ...page, freeCanvas: store }, [{ type: "add", part, parentId }]);
      return { ...p, pages: p.pages.map((pg) => (pg === page ? next : pg)) };
    });

  /** An item placement's stored item replaced (a new part's sensor, once chosen). */
  const setPagePartItem = (id: string, item: StoredItem) =>
    updateStored((p) => {
      const page = pageOf(p, profile.pageId);
      if (!page.placements.some((x) => x.id === id)) return p;
      const next = { ...page, placements: page.placements.map((x) => (x.id === id ? { ...x, item } : x)) };
      return { ...p, pages: p.pages.map((pg) => (pg === page ? next : pg)) };
    });

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
      const title = item.id === BLANK_MODULE ? "Blank space" : ALL_MODULES.find((m) => m.id === item.id)?.title;
      return title ? { title, size: moduleDropSize(item.id, profile, item.settings) } : null;
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
      preset ? actions.addPresetAt(p, id, preset, rect) : actions.addModuleAt(p, id, item.id, rect, item.settings)
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
   * The Add panel's one add path (handoff SPEC §7), for a click, Enter, the empty state and a drop: fill a blank
   * zone (`zoneId`) at its box, place at a dropped box (`rect`, already checked free), or auto-place at the largest
   * size from the default down to the min that is free. One undo step; the message is the toast's. Null: a no-op
   * (Blank zone into a blank zone).
   */
  const addFromPanel = (item: AddItem, spot?: { zoneId: string } | { rect: ZoneRect }): AddOutcome | null => {
    if (spot && "zoneId" in spot) {
      const zone = profile.placements.find((p) => p.id === spot.zoneId);
      if (!zone || item.id === BLANK_MODULE) return null;
      if (!fitsIn(item, zone.colSpan, zone.rowSpan)) return { added: false, message: `${item.name} needs at least ${sizeText(item.mw, item.mh)}` };
      const preset = item.drop.kind === "panel" ? findPanelPreset(item.id, config.panelPresets) : undefined;
      if (item.drop.kind === "panel" && !preset) return null;
      updateProfile((p) =>
        preset ? actions.fillWithPreset(p, zone.id, preset) : actions.assignModule(p, zone.id, item.drop.id, { cols: item.mw, rows: item.mh }, item.drop.settings)
      );
      sel.select(zone.id);
      return { added: true, zoneId: zone.id, message: `${item.name} fills the blank zone · ${sizeText(zone.colSpan, zone.rowSpan)}` };
    }
    const rect = spot?.rect ?? autoPlace(profile, profile.placements, { cols: item.w, rows: item.h }, { cols: item.mw, rows: item.mh });
    if (!rect) return { added: false, message: `No room on this page for ${item.name}` };
    const id = createAt(item.drop, rect);
    if (!id) return null;
    const shrunk = rect.cols !== item.w || rect.rows !== item.h;
    return { added: true, zoneId: id, message: `Added ${item.name} · ${sizeText(rect.cols, rect.rows)}${shrunk ? " (shrunk to fit)" : ""}` };
  };

  const addPlacement = (module: string) => placeItem({ kind: "module", id: module });

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
  const deleteSavedPanel = (id: string) => {
    const name = config.panelPresets?.find((x) => x.id === id)?.name;
    setConfig((c) => deletePanelPreset(c, id));
    toast(name ? `Deleted ${name}` : "Deleted panel", onUndo ? { action: { label: "Undo", onClick: onUndo }, ms: 8000 } : undefined);
  };

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

  /** The boxes an arrangement would give the selection (null = it doesn't fit, or moves nothing). */
  const arrangement = (op: ArrangeOp) =>
    selected && sel.selectedIds.length > 1
      ? arrangeZones(op, profile.placements, sel.selectedIds, selected.id, profile.cols, profile.rows, actions.zoneMinSize)
      : null;

  /** Align, match or distribute the selection (one undo step). */
  const arrangeSelection = (op: ArrangeOp) => {
    if (sel.selectedIds.length < 2) return;
    const rects = arrangement(op);
    if (rects) setZoneRects(rects);
    else toast("Nothing to change, or no room for it");
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
  /** The selected zone's cells typed in (COL / ROW / W / H); false when it can't take them (another widget, the grid's edge). */
  const setZoneBox = (patch: Partial<ZoneRect>): boolean => {
    if (!selected) return false;
    const next = enforceMinSize(
      { col: selected.colStart, row: selected.rowStart, cols: selected.colSpan, rows: selected.rowSpan, ...patch },
      selected,
      actions.zoneMinSize(selected)
    );
    const clamped = fitZoneRect(next, profile.placements, profile.cols, profile.rows, selected.id);
    if (clamped) setZoneRect(selected.id, clamped, `zone-box:${selected.id}`);
    return clamped !== null && (["col", "row", "cols", "rows"] as const).every((k) => patch[k] === undefined || patch[k] === clamped[k]);
  };

  /** Assign a widget to a zone (blank, module, or preset panel). */
  const assignWidget = (id: string, value: string) => {
    if (value === "blank") {
      updateProfile((p) => actions.clearWidget(p, id));
    } else if (value.startsWith("module:")) {
      const module = value.slice("module:".length);
      if (!actions.canGrowTo(profile, id, moduleMinSize(module))) return void toast("Not enough room here");
      updateProfile((p) => actions.assignModule(p, id, module, moduleMinSize(module)));
    } else if (value.startsWith("preset:")) {
      const preset = findPanelPreset(value.slice("preset:".length), config.panelPresets);
      if (!preset) return;
      if (!actions.canGrowTo(profile, id, { cols: preset.colSpan, rows: preset.rowSpan }))
        return void toast("Not enough room here");
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

  /** Add a profile made elsewhere (an imported file, with fresh ids) and edit it. */
  const addImportedProfile = (np: MonitorProfile) => {
    setConfig((c) => withProfile(c, np, false));
    onSelectProfile(np.id);
  };

  /** Copy a profile directly below it and edit the copy (one undo step). */
  const duplicateProfile = (id: string) => {
    let copyId: string | undefined;
    setConfig((c) => {
      const r = duplicateInConfig(c, id);
      copyId = r?.profileId;
      return r?.config ?? c;
    });
    // The history setter runs the update synchronously.
    if (copyId) onSelectProfile(copyId);
  };

  /**
   * Delete a profile (never the last; one undo step); see `withoutProfile` for the pick afterwards.
   * When it is the one being edited, the first profile left is edited instead.
   */
  const removeProfile = (id: string) => {
    if (config.profiles.length <= 1) return;
    setConfig((c) => withoutProfile(c, id));
    if (id === profile.id) onSelectProfile(config.profiles.find((p) => p.id !== id)!.id);
  };

  /** What displays open on: a profile id, or "auto" for the one closest to the window. */
  const activateProfile = (id: string) => setConfig((c) => ({ ...c, activeProfile: id }));

  const saveStylePreset = (name: string, settings: ModuleSettings) =>
    setConfig((c) => ({
      ...c,
      stylePresets: [...(c.stylePresets ?? []), { id: uid("style"), name, settings }],
    }));

  /** A saved Style takes a widget's look in its place ("Update ‹name›"; one undo step). */
  const updateSavedStyle = (id: string, settings: ModuleSettings) => setConfig((c) => updateStylePreset(c, id, settings));

  return {
    updateProfile,
    updateStored,
    applyPageOps,
    addPagePart,
    setPagePartItem,
    updatePlacement,
    updateSelected,
    addPlacement,
    addFromPanel,
    dropSizeOf,
    dropItem,
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
    arrangement,
    arrangeSelection,
    moveSelection,
    resizeSelected,
    resizePrimary,
    setZoneBox,
    assignWidget,
    addImportedProfile,
    duplicateProfile,
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
    updateSavedStyle,
  };
}

export type StudioMutations = ReturnType<typeof useStudioMutations>;

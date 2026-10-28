import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type MutableRefObject, type ReactNode, type SetStateAction } from "react";
import { useConfigHistory, type AdoptChange } from "@/hooks/use-config-history";
import { ToastProvider } from "@/components/ui/toast";
import {
  BLANK_MODULE,
  CANVAS_ID,
  ITEM_ID,
  resolveProfile,
  uid,
  type DashboardConfig,
  type MadeFor,
  type MonitorProfile,
  type Placement,
  type ProfileView,
} from "@/lib/layout";
import { isFreePage } from "@/lib/free-pages";
import { resolveBackground } from "@/lib/appearance";
import { useSensorCatalog } from "@/lib/catalog";
import { buildDataModel } from "@/lib/data-points";
import { appearanceOf } from "@/lib/style-resolve";
import { resolveTheme, themeVars } from "@/lib/theme";
import { CommandPalette } from "./command-palette";
import { exportConfigFile } from "./config-file";
import { ownStyle } from "./studio-actions";
import { useStyleEdits } from "./use-style-edits";
import { ProfileShots } from "./profile-shots";
import { StudioCanvas } from "./studio-canvas";
import { StudioTopBar, type StudioMode } from "./studio-top-bar";
import { LeftRail, type RailItem } from "./left-rail";
import { PhoneTabBar } from "./phone-tab-bar";
import { applyFirstRun } from "./first-run-model";
import type { SetupOutcome } from "./first-run/first-run-page";
import { onSetupRequest, takeSetupRequest } from "@/lib/setup-request";
import { DesignLeftPanel } from "./design-left-panel";
import { AddToast } from "./add-toast";
import { useAddListDensity, useAddPreviewOnHover } from "./add-prefs";
import { useAddPanel } from "./use-add-panel";
import { fontStack, resolveFont } from "@/lib/general";
import { importedFromInfoPanel, madeForInfoPanel, screenKind } from "@/lib/screens/list";
import { MadeForControl } from "./made-for-control";
import { focusOnInfoPanel } from "./add-toast";
import { ELEMENT_TILES, ITEM_TILES, partKey } from "./add-tiles";
import { placeForAdd, placesFreely } from "@/lib/page-model/gesture";
import type { StoredItem } from "@/lib/infopanel/import/stored";
import { withScreenPerformance } from "./screens-model";
import { StatusBar } from "./status-bar";
import { useStatusBar } from "./use-status-bar";
import { StudioInspector } from "./studio-inspector";
import { StudioShell } from "./studio-shell";
import { QuickBar } from "./quick-bar";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { useInfoPanelIo } from "./infopanel-io";
import { ExportSheet } from "./export-sheet";
import { onFileDoor, openConvertDialog, openExportSheet, openImportDoor, openNewInfoPanel, type ExportRequest } from "./file-doors";
import { canvasPlaces } from "@/components/infopanel/edit/canvas-places";
import type { NewChoice, NewProfile, NewScreen } from "@/components/templates/new-page";
import type { WizardKind } from "@/components/templates/recent-templates";
import { uniqueProfileName } from "./profile-actions";
import { canvasZoneOf, importAsProfile } from "./import-actions";
import { useImportDoor } from "./use-import-door";
import { helpZoneKind } from "./help-zone";
import { useStudioCommands } from "./use-studio-commands";
import { isPhone, railWidth } from "./use-studio-layout";
import { useStudioMutations } from "./use-studio-mutations";
import { useStudioSelection } from "./use-studio-selection";
import { useItemSelection } from "./use-item-selection";
import { usePageLayers } from "./use-page-layers";
import { LayerSection } from "./layer-section";
import { findNode, walk, type GroupNode } from "@/lib/page-model/model";
import { useInspectorFollowsSelection, useStudioUi } from "./use-studio-ui";
import { SelectionChip } from "./selection-chip";
import { StudioContextMenu, useContextMenu, zoneMenuExtras } from "./zone-context-menu";
import type { ArrangeOp } from "./zone-arrange";
import { widgetName } from "./widget-kinds";
import { WidgetPickerDialog } from "./widget-picker-dialog";
import { kiosksOf, postControl, useControl, type ControlDisplay } from "@/lib/control";
import { onRunSetup, openHelp } from "@/lib/desktop";
import { DEFAULT_API_BASE } from "@/lib/data-api";
import { dialogArticle, focusedSection, studioHelpTarget } from "@/help/context";
import { useHelpKey } from "@/help/use-help-key";
import { isIslandAlert } from "@/lib/island/from-alerts";
import { visibleAlerts } from "@/components/alerts/alert-model";
import { cycleLabel, PageTabs } from "./page-tabs";
import { PageIconDialog } from "./page-icon-dialog";
import { islandSectionId } from "./island-panel-model";
import { ISLAND_SETTING } from "@/lib/island/sources";
import { modules } from "@/modules";
import { ZoomToolbar } from "./zoom-toolbar";
import { PreviewDataProvider, usePreviewData } from "@/hooks/use-preview-data";
import { FLOAT_INSET, sheetHeight } from "./studio-layout";
import { zoneName } from "./inspector/zone-meta";
import { dataOf, setAsBackground, type StudioBridge } from "@/components/library/library-actions";
import type { GaugeSource } from "@/lib/gauge-studio/model";
import { dropLibraryItem, librarySizeOf } from "@/components/library/library-drop";
import { recordCopy } from "@/lib/my-library/copies";
import { useToast } from "@/components/ui/toast";
import { createLibraryItem, type LibraryCopy, type LibraryItem } from "@/lib/library";
import { canvasItem } from "@/lib/my-library/canvas-link";
import { findCanvasUse } from "@/lib/my-library/canvas-use";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import type { FixtureStart } from "@/dev/fixtures/types";

/** The Export sheet's request while it is closed (a stable object, so its rows keep their state). */
const NO_REQUEST: ExportRequest = {};

/** A grid page's Export check and On InfoPanel lines: the export model loads only for a screen made for InfoPanel. */
const GridCheckPill = lazy(() => import("@/components/infopanel/grid-export").then((m) => ({ default: m.GridCheckPill })));
const GridCheckPanel = lazy(() => import("@/components/infopanel/grid-export").then((m) => ({ default: m.GridCheckPanel })));
const GridOnInfoPanel = lazy(() => import("@/components/infopanel/grid-export").then((m) => ({ default: m.GridOnInfoPanel })));
const GridBadge = lazy(() => import("@/components/infopanel/grid-export").then((m) => ({ default: m.GridBadge })));
const GridItemBadge = lazy(() => import("@/components/infopanel/grid-export").then((m) => ({ default: m.GridItemBadge })));
const GroupInspector = lazy(() => import("./group-inspector").then((m) => ({ default: m.GroupInspector })));
/** One InfoPanel item or element selected on a screen's page: its inspector (Edit v3 SPEC §10.2), with the item model. */
const PageItemInspector = lazy(() => import("@/components/infopanel/edit/page-item-inspector"));
const LayerMenu = lazy(() => import("./layer-menu").then((m) => ({ default: m.LayerMenu })));
/** The Export check and its status icon, loaded on a screen made for InfoPanel (Layers' row statuses). */
interface CheckKit {
  exportCheck: typeof import("@/lib/infopanel/export-check").exportCheck;
  StatusIcon: typeof import("@/components/infopanel/export-check-panel").StatusIcon;
}
const loadCheckKit = (): Promise<CheckKit> =>
  Promise.all([import("@/lib/infopanel/export-check"), import("@/components/infopanel/export-check-panel")]).then(([c, p]) => ({ exportCheck: c.exportCheck, StatusIcon: p.StatusIcon }));
/** A new part's sensor picker on a screen page, loaded with the first item that asks for one. */
const SensorPicker = lazy(() => import("@/components/infopanel/edit/sensor-picker").then((m) => ({ default: m.SensorPicker })));
/** Add's Export check statuses, loaded on a screen made for InfoPanel. */
type AddStatusModule = typeof import("@/components/infopanel/edit/add-status");

/** The canvas editor (A5): Edit on an imported profile's page (one canvas filling the screen), loaded when one is first opened. */
const CanvasEditorView = lazy(() => import("@/components/infopanel/edit/canvas-editor"));
/** The New page loads when it opens, and its templates after it (`wizard-kit.ts`). */
const NewPage = lazy(() => import("@/components/templates/new-page"));
/** The first-run setup comes in its own chunk, with the templates its Start step shows. */
const FirstRunPage = lazy(() => import("./first-run/first-run-page"));
/** The Data, Alerts and Screens views load when the rail first opens them. */
const SourcesPanel = lazy(() => import("./sources-panel").then((m) => ({ default: m.SourcesPanel })));
const AlertsView = lazy(() => import("./alerts-view").then((m) => ({ default: m.AlertsView })));
const NO_DISPLAYS: readonly ControlDisplay[] = [];
const ScreensView = lazy(() => import("./screens-view").then((m) => ({ default: m.ScreensView })));
/** The Library page (A6), loaded when the rail first opens it. */
const LibraryPage = lazy(() => import("@/components/library/library-page"));
/** Theme, its own chunk (the theme card, the pickers and the apply rule). */
const ThemeEditor = lazy(() => import("./theme-editor").then((m) => ({ default: m.ThemeEditor })));
/** The Gauges view (A7), loaded when the rail first opens it. */
const GaugesPage = lazy(() => import("@/components/gauges/gauges-page"));

interface StudioViewProps {
  config: DashboardConfig;
  /** The grid profile being edited (the one selected in the Profiles panel), on the page the studio shows. */
  profile: ProfileView;
  /** Select a profile for editing (view state, never in the config). */
  onSelectProfile: (id: string) => void;
  /** Show another page of the profile on the canvas (view state, not undoable). */
  onPageChange: (pageId: string) => void;
  setConfig: Dispatch<SetStateAction<DashboardConfig>>;
  windowWidth: number;
  windowHeight: number;
  onExitStudio: () => void;
  /** Flush the config to the server and force the kiosk view to refresh. */
  /** Push now; resolves to whether the server took it. */
  onSave: (config: DashboardConfig) => Promise<boolean>;
  /** Edits the server does not have yet (the dot on Save). */
  pushPending: boolean;
  /** The last push could not reach the server (the top bar says so). */
  offline: boolean;
  /** No config anywhere (a fresh install): the first-run setup opens. */
  firstRun: boolean;
  /** Filled with the history's `adopt` while the view is open: how a Settings change gets in without ending the undo history. */
  adoptRef: MutableRefObject<AdoptChange | null>;
  /** A dev fixture's start (src/dev/fixtures): Edit opens on it with its selection and left tab. */
  fixture?: FixtureStart;
}

/**
 * The studio: a title bar (screen / page switcher, command entry, undo/redo,
 * Import, Export, Live, save, "⋯"), the labelled rail (every item a full view),
 * Design's left panel (Layers | Add widget), a center grid canvas where zones
 * are drawn, selected (Shift / Ctrl-click for several), moved and resized
 * (biome-style, no overlap) with a toolbar on the primary zone, a right panel
 * (zone inspector, or the theme editor) and the status bar. Every edit goes through the undo history; keyboard
 * shortcuts and the Ctrl+K command palette reach the same actions as the
 * mouse. The state lives in the `use-studio-*` hooks; this composes them.
 */
export function StudioView(props: StudioViewProps) {
  // The toast host wraps the view so the hooks below can raise toasts.
  return (
    <ToastProvider>
      <StudioViewBody {...props} />
    </ToastProvider>
  );
}

function StudioViewBody({
  config,
  profile,
  onSelectProfile,
  onPageChange,
  setConfig: setConfigState,
  windowWidth,
  windowHeight,
  onExitStudio,
  onSave,
  pushPending,
  offline,
  firstRun,
  adoptRef,
  fixture,
}: StudioViewProps) {
  const history = useConfigHistory(config, setConfigState);
  useEffect(() => {
    adoptRef.current = history.adopt;
    return () => {
      adoptRef.current = null;
    };
  }, [adoptRef, history.adopt]);
  const toast = useToast();
  // First-run setup: a fresh install, or run again (Help › Run setup again, Settings › General › Run setup).
  const [setup, setSetup] = useState<{ rerun: boolean } | null>(null);
  useEffect(() => {
    if (firstRun) setSetup({ rerun: false });
  }, [firstRun]);
  useEffect(() => {
    if (takeSetupRequest()) setSetup({ rerun: true });
    const offRequest = onSetupRequest(() => setSetup({ rerun: true }));
    const offShell = onRunSetup(() => setSetup({ rerun: true }));
    return () => {
      offRequest();
      void offShell.then((off) => off());
    };
  }, []);
  // Runtime state of the kiosks (page shown, rotating): not config, never in the undo history. The stream marks this
  // page as a studio (the app's "already open" check for a browser studio).
  const control = useControl(undefined, true, undefined, true);
  // The canvas island plays only test alerts (Test in the rule editor); live ones show on kiosks.
  const islandTestAlerts = useMemo(
    () => visibleAlerts(control?.alerts ?? [], profile.id).filter((a) => a.test && isIslandAlert(a)),
    [control?.alerts, profile.id]
  );
  const setConfig = history.set;
  // The stored profile behind the page on the canvas (profile list, summary, JSON copy).
  const storedProfile = config.profiles.find((p) => p.id === profile.id) ?? config.profiles[0];
  const ui = useStudioUi(config, profile, onSave, windowWidth);
  /**
   * Edit a profile: the canvas, page tabs and inspector follow it, and the zoom returns to fit.
   * What displays open on is not touched; only "When the app opens" sets that.
   */
  const selectProfile = (id: string) => {
    onSelectProfile(id);
    if (id !== profile.id) ui.fitZoom();
  };
  const sel = useStudioSelection(profile);
  const { selected, selectedWidget, selectedWidgetId } = sel;
  // A fixture opens Edit on its tab and selection, once (the Studio otherwise opens on Screens).
  const fixtureStart = useRef(fixture);
  useEffect(() => {
    const start = fixtureStart.current;
    if (!start) return;
    ui.setMode("design");
    ui.setLeftTab(start.leftTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useInspectorFollowsSelection(ui, sel.primaryId, selectedWidgetId);
  const edit = useStudioMutations({
    config,
    profile,
    setConfig,
    sel,
    onPresetSaved: () => ui.setPresetNaming(false),
    onPageChange,
    onSelectProfile: selectProfile,
  });
  const { setScopeStyle, appearancePresets } = useStyleEdits(config, profile, setConfig);
  /** The global style the zones render under. */
  const appearance = appearanceOf(config, profile);
  const menus = useContextMenu(sel);
  const { runCommand, commands, focusZone } = useStudioCommands({
    config,
    profile,
    setConfig,
    history,
    ui,
    sel,
    edit,
    appearance,
    appearancePresets,
    setScopeStyle,
    onPageChange,
    onSelectProfile: selectProfile,
    onHelp: () => void openHelp(helpTarget()).catch(() => {}),
    onExportCheck: () => openExportCheck(),
  });
  /** Sensor names for widget names (toolbar crumb, palette). */
  const catalog = useSensorCatalog();
  const dataPoints = useMemo(() => buildDataModel(catalog.sources, catalog.sensors).points, [catalog.sources, catalog.sensors]);
  const { studioLayout, showSources, showLibrary, showGauges, showTheme, showAlerts, showScreens, fullPage } = ui;
  const phone = isPhone(windowWidth);
  const narrowRail = !phone && railWidth(windowWidth) < 72;
  const railActive: RailItem = showSources
    ? "data"
    : showLibrary
      ? "library"
      : showGauges
        ? "gauges"
        : showTheme
          ? "theme"
          : showAlerts
            ? "alerts"
            : showScreens
              ? "screens"
              : "design";
  const openHelpWindow = () => void openHelp(helpTarget()).catch(() => {});
  // F1 and the rail's Help: the article for what the user is on (an open dialog, the view, the selected zone).
  const helpTarget = () =>
    studioHelpTarget({
      dialog: dialogArticle(),
      section: focusedSection(),
      view: ui.mode === "design" && activeCanvas ? "infopanel" : ui.mode,
      zone: helpZoneKind(selected),
    });
  useHelpKey(helpTarget, (target) => void openHelp(target).catch(() => {}));
  /** The data point the inspector's Bound data row opened in Sources mode. */
  const [focusPointKey, setFocusPointKey] = useState<string>();
  useEffect(() => {
    if (!showSources) setFocusPointKey(undefined);
  }, [showSources]);

  // A link to Screens that names a screen selects it (the Screens view shows the one being edited).
  useEffect(() => {
    if (ui.screenRequest) selectProfile(ui.screenRequest.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.screenRequest?.seq]);
  /**
   * Alerts & Island's "Open widget ↗": select the zone and scroll the inspector to "Send to island". A zone
   * on another screen or page waits for the switch (it clears the selection) before it is selected.
   */
  const [pendingZone, setPendingZone] = useState<string | null>(null);
  /** The zone an import just made: it opens in the canvas editor once it is on the page. */
  const openOnLand = useRef<string | null>(null);
  const openZone = (profileId: string, pageId: string, zoneId: string) => {
    ui.setMode("design");
    if (profileId !== storedProfile.id) selectProfile(profileId);
    if (profileId !== storedProfile.id || pageId !== (profile.pageId ?? storedProfile.pages[0].id)) onPageChange(pageId);
    setPendingZone(zoneId);
  };
  useEffect(() => {
    if (!pendingZone || !profile.placements.some((p) => p.id === pendingZone)) return;
    setPendingZone(null);
    focusZone(pendingZone);
    if (openOnLand.current === pendingZone) {
      // A fresh import, or a new profile, opens in Edit (spec §4).
      openOnLand.current = null;
      ui.setMode("design");
      setCanvasSelection(undefined);
    }
    const zone = profile.placements.find((p) => p.id === pendingZone);
    const section = islandSectionId(modules.find((m) => m.id === zone?.module));
    if (section) requestAnimationFrame(() => ui.jumpInspector(section, ISLAND_SETTING));
  }, [pendingZone, profile.placements]);
  const io = useInfoPanelIo({
    config,
    profile,
    setConfig,
    selectedId: sel.primaryId ?? undefined,
    onLanded: (zoneId, newProfile) => {
      // An import onto this page lands as a group of its items: selected in Layers.
      if (!newProfile) return setPendingGroup(zoneId);
      ui.fitZoom();
      openOnLand.current = zoneId;
      setPendingZone(zoneId);
    },
    onSelectProfile: selectProfile,
  });
  const onRail = (item: RailItem) => {
    setNewPage(null);
    ui.onRail(item);
  };
  /** Items the editor opens with selected (the Library's "uses"). */
  const [canvasSelection, setCanvasSelection] = useState<string[] | undefined>(fixture?.canvasSelection);
  /** The stored page on the canvas. */
  const storedPage = storedProfile.pages.find((p) => p.id === profile.pageId) ?? storedProfile.pages[0];
  /** The page's InfoPanel items and elements selected on the canvas (selecting one clears the zones, and back). */
  const items = useItemSelection({ profileId: storedProfile.id, page: storedPage, zoneId: sel.primaryId, clearZones: () => sel.select(null) });
  // The Export check's statuses for Layers' rows, loaded with the check on a screen made for InfoPanel.
  const [checkKit, setCheckKit] = useState<CheckKit | null>(null);
  const checkOnScreen = madeForInfoPanel(storedProfile);
  useEffect(() => {
    if (checkOnScreen && !checkKit) void loadCheckKit().then(setCheckKit);
  }, [checkOnScreen, checkKit]);
  const rowStatus = useMemo(
    () => (checkOnScreen && checkKit ? new Map(checkKit.exportCheck(storedProfile, storedPage, zoneName).rows.map((r) => [r.path, r.status])) : null),
    [checkOnScreen, checkKit, storedProfile, storedPage],
  );
  /** `Studio | InfoPanel` in the zoom bar (decision Q10): the page drawn as it exports, on a screen made for InfoPanel too. */
  const [infoPanelView, setInfoPanelView] = useState(false);
  const exportView = checkOnScreen ? { infoPanel: infoPanelView, onChange: setInfoPanelView } : undefined;
  const leftOut = useMemo(
    () => (checkOnScreen && infoPanelView && rowStatus ? new Set([...rowStatus].flatMap(([id, status]) => (status === "out" ? [id] : []))) : undefined),
    [checkOnScreen, infoPanelView, rowStatus],
  );
  /** Layers on a screen's page: one selection of widgets, items and groups, and every layer action. */
  const layers = usePageLayers({
    profile: storedProfile,
    page: storedPage,
    zones: sel,
    items,
    focusZone,
    applyPageOps: edit.applyPageOps,
    dragging: history.dragging,
    statusIcon:
      rowStatus && checkKit
        ? (id) => {
            const status = rowStatus.get(id);
            return status ? <checkKit.StatusIcon status={status} /> : null;
          }
        : undefined,
    showLayers: () => ui.setLeftTab("layers"),
    toast,
  });
  // The fixture's selection, through Layers so a page group or an item placement is selected as a click on its row
  // would; after Layers' own effects, which clear its group selection on mount.
  useEffect(() => {
    for (const id of fixtureStart.current?.selection ?? []) layers.host.select(id, "toggle", []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /** The layer menu, opened on a part or a group's box on the canvas (Layers opens its own); on a widget, `zone`. */
  const [layerMenu, setLayerMenu] = useState<{ x: number; y: number; zone?: boolean } | null>(null);
  /** Right-click on a widget on the canvas: the layer menu, the zone menu's other rows under it (DECISIONS after phase 4). */
  const openPartMenu = (id: string, x: number, y: number) => {
    if (!layers.selection.includes(id)) {
      items.clear();
      layers.clearGroups();
      sel.select(id);
    }
    setLayerMenu({ x, y, zone: true });
  };
  /** What the zone menu's rows need (the canvas's empty-space menu, and a widget's rows under the layer menu). */
  const zoneMenuDeps = {
    canPasteStyle: ui.styleClipboard !== null,
    canStep: (cols: number, rows: number) => selected !== null && edit.resizeSelected({ cols: selected.colSpan + cols, rows: selected.rowSpan + rows }) !== null,
    canArrange: (op: ArrangeOp) => edit.arrangement(op) !== null,
    otherPages: storedProfile.pages.filter((p) => p.id !== profile.pageId),
    onRun: runCommand,
  };
  /** A Free page (its layout, one canvas filling the screen, as every InfoPanel profile's) is edited in the canvas editor. */
  const freeZone = isFreePage(profile, storedPage) ? profile.placements[0] : null;
  /** What Edit's canvas editor shows: the page's canvas, when it is one filling the screen (an imported profile's). */
  const activeCanvas = freeZone?.canvas ? (freeZone as typeof freeZone & { canvas: NonNullable<typeof freeZone.canvas> }) : undefined;
  /**
   * The New page (New screen, New InfoPanel profile): a page over Screens, for either kind. "New InfoPanel profile…"
   * makes a new screen (not made active) opened in Edit, a template's sensors not found on this machine listed there
   * with Remap; the choice it starts on, and the view Cancel goes back to.
   */
  const [newPage, setNewPage] = useState<{ kind: WizardKind; initial?: NewChoice; back: StudioMode; size?: { width: number; height: number } } | null>(null);
  const [unboundNote, setUnboundNote] = useState<{ zoneId: string; labels: string[] } | null>(null);
  const modeNow = useRef(ui.mode);
  modeNow.current = ui.mode;
  const openNewProfile = (initial?: NewChoice) => {
    setNewPage({ kind: "ip", initial, back: modeNow.current });
    ui.setMode("screens");
  };
  const openNewScreen = () => setNewPage({ kind: "screen", back: "screens" });
  /** A screen template's "New screen from this" in the Library: the New page on that template, back to the Library. */
  const openNewScreenFrom = (template: string, variant: string) => {
    setNewPage({ kind: "screen", initial: { template, variant }, back: "library" });
    ui.setMode("screens");
  };
  const switchNewKind = (kind: WizardKind) => setNewPage((p) => p && { ...p, kind, initial: undefined });
  useEffect(() => onFileDoor((e) => e.type === "new-infopanel" && openNewProfile()), []);
  // Leaving the page's view (the rail, a link) drops the page.
  useEffect(() => {
    if (newPage && ui.mode !== "screens") setNewPage(null);
  }, [ui.mode, newPage]);
  const createScreen = ({ profile: made, unbound }: NewScreen) => {
    setNewPage(null);
    const name = uniqueProfileName(config.profiles, made.name);
    edit.addImportedProfile({ ...made, name });
    toast(unbound.length > 0 ? `${name} created. Not found on this PC: ${unbound.join(", ")}` : `${name} created`);
  };
  const createInfoPanel = ({ name, width, height, stored, unbound, toLibrary }: NewProfile) => {
    setNewPage(null);
    const r = importAsProfile(config, stored, name, { width, height }, false);
    setConfig(r.config);
    selectProfile(r.profileId);
    ui.fitZoom();
    openOnLand.current = r.zoneId;
    setPendingZone(r.zoneId);
    setUnboundNote(unbound.length ? { zoneId: r.zoneId, labels: unbound } : null);
    toast(`New InfoPanel profile ${name} · ${width} × ${height} · 1 undo step`);
    if (toLibrary)
      createLibraryItem(canvasItem(stored, name)).then(
        () => toast(`Saved ${name} to the Library`),
        (e: Error) => toast(`Not saved to the Library: ${e.message}`),
      );
  };
  /** Bumped to reopen the editor with new initial selection (the Library's "uses" while it is mounted). */
  const [editorEpoch, setEditorEpoch] = useState(0);

  /** The gauge the Gauges view opens in its editor ("Edit gauge…" from a zone, a canvas item or the Library). */
  const [gaugeToOpen, setGaugeToOpen] = useState<GaugeSource | null>(null);
  const openGauge = (source: GaugeSource) => {
    setGaugeToOpen(source);
    ui.setMode("gauges");
  };

  /** The Library's way into the studio: placing a card copies it into this profile (one undo step). */
  const libraryBridge: StudioBridge = {
    config,
    profile,
    profileId: storedProfile.id,
    setConfig,
    updateProfile: edit.updateProfile,
    selection: sel.selection,
    select: (id) => sel.select(id),
    toast,
    addCopy: (item, copy) => void recordCopy(item, copy),
  };

  /** The Library page reloads (a new key) when the Import door added items. */
  const [libraryEpoch, setLibraryEpoch] = useState(0);
  const currentPageId = profile.pageId ?? storedProfile.pages[0].id;
  const importDoor = useImportDoor({
    config,
    setConfig,
    addScreen: edit.addImportedProfile,
    backup: (c) => exportConfigFile(c, toast),
    useAsBackground: (item) => setAsBackground(libraryBridge, item),
    current: { screen: storedProfile.name, page: storedProfile.pages.find((p) => p.id === currentPageId)?.name ?? "" },
    toast,
    onGo: (go) => {
      if (go.to === "screens") ui.navigateTo({ view: "screens", profileId: storedProfile.id });
      else if (go.to === "gauge") openGauge({ kind: "library", itemId: go.itemId });
      else ui.openLibrary(go.collection);
    },
    onWizard: (file, dest) => io.openImport(dest, { file }, true),
    onInstalled: () => io.openImport("new", { installed: true }),
    onLibraryChanged: () => setLibraryEpoch((n) => n + 1),
  });
  /** The Export & back up sheet: open with the row a request names (the title bar, a Screens card, the gauge editor). */
  const [exportRequest, setExportRequest] = useState<ExportRequest | null>(null);
  useEffect(() => onFileDoor((e) => e.type === "export" && setExportRequest(e)), []);

  /** The one selected zone, when it is blank: the Add panel's click fills it. */
  const blankZoneId = selected && sel.selection.length === 1 && selected.module === BLANK_MODULE ? selected.id : undefined;

  /** The screen's theme, scoped to the canvas (the chrome has its own ui-* tokens). */
  const canvasTheme = resolveTheme(profile);
  const themeScope = themeVars(canvasTheme.tokens, canvasTheme.radius) as CSSProperties;

  /** Add's statuses on a screen made for InfoPanel (the module loads with the first such screen). */
  const [addStatus, setAddStatus] = useState<AddStatusModule | null>(null);
  useEffect(() => {
    if (checkOnScreen && !addStatus) void import("@/components/infopanel/edit/add-status").then(setAddStatus);
  }, [checkOnScreen, addStatus]);
  const kitFor = useMemo(
    () => (checkOnScreen && addStatus ? (widgets: Parameters<AddStatusModule["addStatusKit"]>[0]) => addStatus.addStatusKit(widgets, config.panelPresets) : undefined),
    [checkOnScreen, addStatus, config.panelPresets],
  );
  /** The Add panel (Edit v3 SPEC §9): its catalog, Recently used, toast and flash; a click fills the selected blank zone. */
  const addPanel = useAddPanel({ config, addFromPanel: edit.addFromPanel, targetZoneId: blankZoneId, undo: history.undo, kitFor });
  const [addDensity] = useAddListDensity();
  const [addPreviewOnHover] = useAddPreviewOnHover();
  const pageFont = fontStack(resolveFont(profile));
  const addTarget = blankZoneId && selected ? { id: blankZoneId, cols: selected.colSpan, rows: selected.rowSpan } : undefined;

  /** The screen is made for InfoPanel (SPEC §5.1): the Export check, the badges and the On InfoPanel lines show. */
  const checkOn = madeForInfoPanel(storedProfile);
  const setMadeFor = (madeFor: MadeFor) =>
    setConfig((c) => ({ ...c, profiles: c.profiles.map((p) => (p.id === storedProfile.id ? { ...p, madeFor } : p)) }));

  /** The page inspector's GRID and screen rows (Edit v3 SPEC §10.1): each one undo step; a grid widgets don't fit in is refused (Q5). */
  const pageSettings = {
    onSnapItems: (on: boolean) => edit.applyPageOps([{ type: "setSnapItems", snapItems: on }]),
    onSize: (width: number, height: number) => edit.updateStored((p) => ({ ...p, width, height }), "profile:size"),
    // Loaded on use: its canvas adapter and widget-item model stay out of the studio's first download.
    onGrid: (cols: number, rows: number) =>
      void import("@/lib/page-model/regrid").then(({ regrid }) => {
        const r = regrid(storedProfile, cols, rows, zoneName);
        if ("refused" in r) return toast(r.refused);
        edit.updateStored(() => r.profile);
      }),
    onGap: (gap: number) => edit.updateStored((p) => ({ ...p, gap }), "profile:gap"),
  };
  /** An import onto this page: its group, selected in Layers once it is on the page. */
  const [pendingGroup, setPendingGroup] = useState<string | null>(null);
  useEffect(() => {
    if (!pendingGroup || !(storedPage.groups ?? []).some((g) => g.id === pendingGroup)) return;
    setPendingGroup(null);
    ui.setMode("design");
    ui.setLeftTab("layers");
    layers.selectMany([pendingGroup]);
  }, [pendingGroup, storedPage.groups]);
  /** A page added to an imported profile is one canvas filling the screen too. */
  const addPage = () => {
    if (!freeZone) return edit.addNewPage();
    void import("@/lib/page-layout").then(({ newFreePage }) => {
      const page = newFreePage(storedProfile, storedPage, `Page ${storedProfile.pages.length + 1}`);
      edit.updateStored((p) => ({ ...p, pages: [...p.pages, page] }));
      onPageChange(page.id);
    });
  };

  /** The grid page's Export check in the inspector: the header pill opens it; selecting anything or Esc closes it. */
  const [gridCheckOpen, setGridCheckOpen] = useState(false);
  const gridCheckShown = gridCheckOpen && checkOn && !freeZone;
  useEffect(() => {
    if (sel.primaryId) setGridCheckOpen(false);
  }, [sel.primaryId]);
  const toggleGridCheck = () => {
    sel.select(null);
    setGridCheckOpen((o) => !o);
    studioLayout.showInspector();
  };
  /** The palette's Export check: opens the canvas editor's check when it is showing, else the grid page's. */
  const [checkRequest, setCheckRequest] = useState(0);
  const openExportCheck = () => {
    if (!checkOn) return;
    if (editorShown) return setCheckRequest((n) => n + 1);
    ui.setMode("design");
    sel.select(null);
    setGridCheckOpen(true);
    studioLayout.showInspector();
  };

  /** The middle of the part of the board in view, in page px (where a clicked item goes). */
  const boardCentre = (): { x: number; y: number } | null => {
    const page = ui.scrollRef.current?.querySelector<HTMLElement>("[data-studio-page]");
    const view = ui.scrollRef.current;
    if (!page || !view || profile.width <= 0) return null;
    const p = page.getBoundingClientRect();
    const v = view.getBoundingClientRect();
    const [l, r, t, b] = [Math.max(p.left, v.left), Math.min(p.right, v.right), Math.max(p.top, v.top), Math.min(p.bottom, v.bottom)];
    if (r <= l || b <= t) return null;
    const k = p.width / profile.width;
    return { x: ((l + r) / 2 - p.left) / k, y: ((t + b) / 2 - p.top) / k };
  };
  /** A new part asking for its sensor (the picker binds it, one more undo step). */
  const [pickSensor, setPickSensor] = useState<{ id: string; label: string; pluginOnly: boolean; item: StoredItem } | null>(null);
  /** A new Image or Sensor image asking for its file in its inspector, and the sensor a Sensor image asks for after it. */
  const [askFile, setAskFile] = useState<{ id: string; sensorNext: NonNullable<typeof pickSensor> | null } | null>(null);
  /**
   * An InfoPanel item or element from Add on a screen page (Edit v3 SPEC §7.4, DECISIONS after phase 3): an item
   * placement, never a free area. A click puts it in the middle of the board in view, a drop where it lands; snapped
   * to the cells nearest it, or placed freely with Alt (the page's Snap items off: the other way round). On top, or on
   * top inside the selected group; selected; one undo step. A sensor kind then asks for its sensor.
   */
  const addPart = (data: string, drop?: { at: { x: number; y: number }; alt: boolean }) => {
    const tile = [...ITEM_TILES, ...ELEMENT_TILES].find((t) => t.data === data);
    if (!tile) return;
    // A page group has no item of its own: the Group tile groups the selection (Ctrl+G).
    if (data === "Group") return layers.run("group");
    const { model, groups: selectedGroups } = layers;
    const grid = model.grid;
    const at = drop?.at ?? boardCentre() ?? { x: grid.width / 2, y: grid.height / 2 };
    const free = placesFreely(model.snapItems, drop?.alt ?? false);
    const parentId = selectedGroups.length === 1 ? selectedGroups[0] : null;
    void import("@/components/infopanel/edit/grid-item-add").then(({ newPagePart, partOf }) => {
      const made = newPagePart(data, storedPage, { width: profile.width, height: profile.height });
      const entry = partOf(data);
      if (!made || !entry) return;
      const id = uid("item");
      const name = typeof made.item.Name === "string" && made.item.Name ? made.item.Name : entry.label;
      edit.addPagePart({ type: "part", id, kind: tile.kind === "element" ? "element" : "item", name, place: placeForAdd(grid, at, made, free), ref: { backing: "item", item: made.item } }, parentId, made.store);
      layers.clearGroups();
      items.select(id, false);
      addPanel.pushRecent(partKey(data));
      if (addPanel.status) addPanel.show(addPanel.status.added(tile), true);
      const sensor = entry.sensor ? { id, label: entry.label, pluginOnly: entry.pluginOnly, item: made.item } : null;
      if (entry.file) setAskFile({ id, sensorNext: sensor });
      else if (sensor) setPickSensor(sensor);
    });
  };

  /** A grid widget's On InfoPanel section, on a screen made for InfoPanel. */
  const onInfoPanelOf = checkOn
    ? (zone: Placement) =>
        zone.module === CANVAS_ID || zone.module === BLANK_MODULE ? null : (
          <Suspense fallback={null}>
            <GridOnInfoPanel zone={zone} name={zoneName(zone)} onSettings={(settings) => edit.updatePlacement(zone.id, (p) => ({ ...p, settings }))} />
          </Suspense>
        )
    : undefined;

  /** The one page group selected alone: the Group inspector (SPEC §10.3). */
  const groupNode = layers.selection.length === 1 && layers.groups.length === 1 ? (findNode(layers.model.root, layers.groups[0])?.node as GroupNode | undefined) : undefined;
  /** The groups a node can go into: every group but itself and the ones inside it. */
  const groupsFor = (id: string) => {
    const inside = new Set<string>([id]);
    const node = findNode(layers.model.root, id)?.node;
    if (node?.type === "group") walk(node.children, (n) => inside.add(n.id));
    return layers.groupList.filter((g) => !inside.has(g.id));
  };
  /** The one InfoPanel item or element selected on the page: its inspector (SPEC §10.2). */
  const itemId = layers.selection.length === 1 && items.ids.length === 1 ? items.ids[0] : null;
  const itemPlacement = itemId ? storedPage.placements.find((p): p is Placement & { item: StoredItem } => p.id === itemId && p.module === ITEM_ID && p.item !== undefined) : undefined;
  const itemNode = itemPlacement ? findNode(layers.model.root, itemPlacement.id)?.node : undefined;
  const inspectorAside = gridCheckShown ? (
    <aside aria-label="Export check" className={studioLayout.mode !== "docked" ? "flex h-full w-full flex-col overflow-y-auto bg-ui-panel font-ui" : "flex w-[320px] shrink-0 flex-col overflow-y-auto border-l border-ui-subtle bg-ui-panel font-ui"}>
      <Suspense fallback={null}>
        <GridCheckPanel
          profile={profile}
          page={storedPage}
          nameOf={zoneName}
          onSelect={(id) => {
            setGridCheckOpen(false);
            // An item's row selects the item on the canvas.
            if (storedPage.placements.some((p) => p.id === id && p.module === ITEM_ID)) items.select(id, false);
            else focusZone(id);
          }}
          onConvert={() => openConvertDialog("screen")}
          onClose={() => setGridCheckOpen(false)}
        />
      </Suspense>
    </aside>
  ) : groupNode ? (
    <aside aria-label="Inspector" className={studioLayout.mode !== "docked" ? "flex h-full w-full flex-col overflow-y-auto bg-ui-panel font-ui" : "flex w-[320px] shrink-0 flex-col overflow-y-auto border-l border-ui-subtle bg-ui-panel font-ui"}>
      <Suspense fallback={null}>
        <GroupInspector
          model={layers.model}
          group={groupNode}
          inGroup={findNode(layers.model.root, groupNode.id)?.parentId ?? null}
          groups={groupsFor(groupNode.id)}
          onAction={layers.run}
          onInGroup={layers.moveInto}
          onSelectContents={() => layers.selectMany(groupNode.children.map((c) => c.id))}
          onSaveToLibrary={() => layers.saveToLibrary?.()}
        />
      </Suspense>
    </aside>
  ) : itemPlacement && itemNode?.type === "part" ? (
    <aside aria-label="Inspector" className={studioLayout.mode !== "docked" ? "flex h-full w-full flex-col overflow-hidden bg-ui-panel font-ui" : "flex w-[320px] shrink-0 flex-col overflow-hidden border-l border-ui-subtle bg-ui-panel font-ui"}>
      <Suspense fallback={null}>
        <PageItemInspector
          key={itemPlacement.id}
          profile={storedProfile}
          page={storedPage}
          placement={itemPlacement}
          place={itemNode.place}
          setConfig={setConfig}
          onOps={edit.applyPageOps}
          checkOn={checkOn}
          layer={<LayerSection onAction={layers.run} groups={groupsFor(itemPlacement.id)} inGroup={itemPlacement.groupId ?? null} onInGroup={layers.moveInto} />}
          onDuplicate={() => layers.run("duplicate")}
          onDelete={() => layers.run("delete")}
          askFile={askFile?.id === itemPlacement.id}
          onFileDone={(picked) => {
            const next = askFile?.sensorNext;
            setAskFile(null);
            if (picked && next) setPickSensor(next);
          }}
        />
      </Suspense>
    </aside>
  ) : (
    <StudioInspector
      config={config}
      profile={profile}
      appearance={appearance}
      ui={ui}
      sel={sel}
      edit={edit}
      setConfig={setConfig}
      onHelp={() => void openHelp(helpTarget()).catch(() => {})}
      onShowOnKiosks={(pageId) => void postControl("page", { profile: storedProfile.id, page: pageId })}
      onOpenPoint={(key) => {
        setFocusPointKey(key);
        ui.setMode("sources");
      }}
      onEditGauge={(zoneId) => openGauge({ kind: "widget", zoneId })}
      pageSettings={pageSettings}
      onInfoPanelOf={onInfoPanelOf}
      layerOf={(zone) => <LayerSection onAction={layers.run} groups={layers.groupList} inGroup={zone.groupId ?? null} onInGroup={layers.moveInto} />}
    />
  );

  const leftPanelEl = (
    <PreviewDataProvider>
    <DesignLeftPanel
      tab={ui.leftTab}
      onTab={ui.setLeftTab}
      width={ui.leftWidth}
      add={{
        catalog: addPanel.catalog,
        recent: fixture?.recent ?? addPanel.recent,
        target: addTarget,
        onClearTarget: () => sel.select(null),
        onAdd: addPanel.add,
        onAddPart: (data) => addPart(data),
        onRenamePreset: edit.renameSavedPanel,
        onDeletePreset: edit.deleteSavedPanel,
        onImportCanvas: () => openImportDoor({ prefer: "canvas-zone" }),
        onNewInfoPanel: openNewInfoPanel,
        density: addDensity,
        previewOnHover: addPreviewOnHover,
        appearance,
        pageStyle: { ...themeScope, fontFamily: pageFont },
        infoPanel: checkOn,
        status: addPanel.status,
        start: fixture && { segment: fixture.addSegment, hoverTile: fixture.hoverTile, added: fixture.added },
      }}
      layers={layers.host}
    />
    </PreviewDataProvider>
  );

  const alertsEl = showAlerts && (
    <Suspense fallback={<div className="flex-1 bg-ui-app" />}>
    <AlertsView
      tab={ui.alertsTab}
      onTab={ui.setAlertsTab}
      config={config}
      setConfig={setConfig}
      active={control?.alerts ?? []}
      points={dataPoints}
      screen={storedProfile}
      page={profile.pageId ?? storedProfile.pages[0].id}
      pushPending={pushPending}
      editingId={ui.alertRule}
      onEdit={ui.setAlertRule}
      onOpenSources={() => ui.setMode("sources")}
      onOpenZone={openZone}
      navigateTo={ui.navigateTo}
    />
    </Suspense>
  );

  /** A Screens card's Open: a screen that is one InfoPanel profile opens in the InfoPanel editor, any other in Design. */
  const openScreen = (id: string) => {
    const place = canvasPlaces(config).find((c) => c.profileId === id);
    const target = config.profiles.find((p) => p.id === id);
    if (place && target && screenKind(target) === "infopanel") {
      openOnLand.current = place.zoneId;
      openZone(place.profileId, place.pageId, place.zoneId);
      return;
    }
    selectProfile(id);
    ui.setMode("design");
  };
  // A link to the old InfoPanel view that names a profile opens it in Edit, as Screens' Open does.
  useEffect(() => {
    if (ui.editRequest && config.profiles.some((p) => p.id === ui.editRequest?.id)) openScreen(ui.editRequest.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ui.editRequest?.seq]);

  const screensEl = showScreens && (
    <Suspense fallback={<div className="flex-1 bg-ui-app" />}>
    <ScreensView
      config={config}
      profile={profile}
      windowSize={{ width: windowWidth, height: windowHeight }}
      autoProfileId={resolveProfile({ ...config, activeProfile: "auto" }, windowWidth, windowHeight).id}
      onSelectProfile={selectProfile}
      updateProfile={edit.updateProfile}
      setConfig={setConfig}
      onRotate={edit.setRotate}
      onPerformance={(patch) => setConfig((c) => withScreenPerformance(c, storedProfile.id, patch), "profile:performance")}
      onMovePage={edit.movePageTo}
      onAddPage={edit.addNewPage}
      onOpenPage={(pageId) => {
        ui.setMode("design");
        onPageChange(pageId);
      }}
      onOpenLive={() => ui.setLiveOpen(true)}
      navigateTo={ui.navigateTo}
      kiosks={kiosksOf(control)}
      displays={control?.displays ?? NO_DISPLAYS}
      onOpenScreen={openScreen}
      onDuplicateProfile={edit.duplicateProfile}
      onRemoveProfile={edit.removeProfile}
      onUndo={history.undo}
      onOpenSaved={(item) => void editCanvas(item)}
      onNew={openNewScreen}
      filterRequest={ui.screensFilter}
    />
    </Suspense>
  );

  const statusBar = useStatusBar(control, offline ? "offline" : pushPending ? "unsaved" : "saved");

  const canvasEl = showSources ? (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background/40">
      <Suspense fallback={null}>
      <SourcesPanel
        config={config}
        setConfig={setConfig}
        profile={profile}
        focusPointKey={focusPointKey}
        selectedZoneId={sel.primaryId}
        dataApi={statusBar.dataApi}
        onOpenZone={(id, opts) => {
          ui.setMode("design");
          focusZone(id);
          if (opts?.widgetId) sel.selectWidget(id, opts.widgetId);
          if (opts?.dataTab) ui.requestInspectorTab("data");
        }}
      />
      </Suspense>
    </div>
  ) : (
    <PreviewDataProvider>
    <StudioCanvas
      profile={profile}
      page={storedPage}
      background={resolveBackground(profile)}
      appearance={appearance}
      themeScope={themeScope}
      radius={resolveTheme(profile).radius}
      zoom={ui.zoom}
      pan={ui.pan}
      showGrid={ui.showGrid}
      showRulers={ui.showRulers}
      scrollRef={ui.scrollRef}
      attachScroll={ui.attachScroll}
      selectedIds={sel.selectedIds}
      onSelect={(id, how) => {
        // An empty-canvas click also puts the inspector away when nothing was selected (the dashboard's).
        if (id === null) {
          studioLayout.dismissInspector();
          ui.setInspectorQuery("");
        }
        // Shift / Ctrl adds a zone to a mixed selection; a plain click selects it alone.
        if (how === "toggle") items.keep();
        else {
          items.clear();
          layers.clearGroups();
        }
        sel.select(id, how);
        // A blank zone picked on the canvas is the Add panel's target: the panel shows, its search takes the cursor.
        if (how !== "toggle" && profile.placements.find((p) => p.id === id)?.module === BLANK_MODULE) ui.setLeftTab("add");
      }}
      onOpenSettings={() => studioLayout.showInspector()}
      inset={studioLayout.layout.inset}
      selectedWidgetId={selectedWidgetId}
      onSelectWidget={sel.selectWidget}
      onDrawZone={edit.addDrawnZone}
      onSelectMany={sel.selectMany}
      onZoneRect={(id, rect) => edit.setZoneRect(id, rect, `zone-drag:${id}`)}
      onZoneRects={(id, rects) => edit.setZoneRects(rects, `zone-drag:${id}`)}
      onPickWidget={(id) => {
        sel.select(id);
        ui.setPickerFor(id);
      }}
      onDragBegin={history.begin}
      onDragCommit={history.commit}
      onDragCancel={history.cancel}
      dropSizeOf={(d) => (d.kind === "mylib" ? librarySizeOf(d.item, profile) : edit.dropSizeOf(d))}
      onDropItem={(d, rect, cell, inCanvas) => (d.kind === "mylib" ? void dropLibraryItem(libraryBridge, d, rect, cell, inCanvas) : edit.dropItem(d, rect))}
      onPartDrop={(data, at, alt) => addPart(data, { at, alt })}
      addItemOf={addPanel.itemOf}
      onAddDrop={addPanel.drop}
      targetZoneId={blankZoneId}
      onClearTarget={() => sel.select(null)}
      flash={addPanel.flash}
      toast={
        addPanel.toast && (
          <AddToast
            toast={addPanel.toast}
            onUndo={addPanel.undoAdd}
            onChange={() => {
              studioLayout.showInspector();
              focusOnInfoPanel();
            }}
          />
        )
      }
      onContextMenu={(id, x, y) => (id === null ? menus.open(null, x, y) : openPartMenu(id, x, y))}
      onOpenAdd={() => ui.openDrawer("add")}
      leftOut={leftOut}
      infoPanelView={checkOnScreen && infoPanelView ? { screen: storedProfile, page: storedPage } : undefined}
      onImport={() => openImportDoor({ prefer: "canvas-zone" })}
      onNoRoom={() => toast("No free cells here.")}
      onUseSample={() => runCommand({ type: "sample-layout" })}
      islandAlerts={islandTestAlerts}
      badgeOf={
        checkOn
          ? (zone) =>
              zone.module === CANVAS_ID || zone.module === BLANK_MODULE || !zone.visible ? null : (
                <Suspense fallback={null}>
                  <GridBadge zone={zone} name={zoneName(zone)} />
                </Suspense>
              )
          : undefined
      }
      items={{
        selectedIds: items.ids,
        onSelect: (id, toggle) => {
          setGridCheckOpen(false);
          if (!toggle) layers.clearGroups();
          items.select(id, toggle);
        },
        onContextMenu: (_id, x, y) => setLayerMenu({ x, y }),
        groups: {
          selected: layers.groups,
          onMove: layers.moveGroups,
          onRefused: layers.refuseGroupMove,
          onPick: (id) => layers.host.select(id, "only", []),
          onSelectGroup: (id, toggle) => {
            setGridCheckOpen(false);
            layers.host.select(id, toggle ? "toggle" : "only", []);
          },
          onContextMenu: (x, y) => setLayerMenu({ x, y }),
        },
        onOps: edit.applyPageOps,
        badgeOf: checkOn
          ? (p) => (
              <Suspense fallback={null}>
                <GridItemBadge placement={p} />
              </Suspense>
            )
          : undefined,
      }}
      selectionChip={
        selected && (
          <SelectionChip
            placement={selected}
            count={sel.selection.length}
            anyVisible={sel.selection.some((p) => p.visible)}
            widgetLabel={selectedWidget ? widgetName(selectedWidget, catalog) : undefined}
            onPickWidget={() => ui.setPickerFor(selected.id)}
            onToggleVisible={edit.toggleSelectionVisible}
            onMore={(x, y) => menus.open(selected.id, x, y)}
            moreOpen={menus.menu !== null}
          />
        )
      }
    />
    </PreviewDataProvider>
  );

  const { mode: inspectorMode, floatOpen } = studioLayout;
  // The quick bar: the selection's pinned settings; with nothing selected (floating) the dashboard's "All settings".
  const quickBar = !showSources && ui.quickBar && inspectorMode !== "sheet" && (sel.selection.length > 0 || inspectorMode === "floating") && (
    <QuickBar
      zones={sel.selection}
      appearance={appearance}
      updateProfile={edit.updateProfile}
      onToggleVisible={() => (sel.selection.length === 1 ? edit.toggleVisible(sel.selection[0].id) : edit.toggleSelectionVisible())}
      allSettings={inspectorMode === "floating" ? { open: floatOpen, onToggle: () => studioLayout.setFloatOpen(!floatOpen) } : undefined}
      insetRight={inspectorMode === "floating" && floatOpen ? FLOAT_INSET - 4 : 0}
      onOpenSection={(section, key) => {
        studioLayout.showInspector();
        ui.jumpInspector(section, key);
      }}
    />
  );

  // The kiosks' rotation as the page tabs' chip and Live's toggle read it: the runtime state, else the saved setting.
  const rotateEntry = control?.profiles[storedProfile.id];
  const rotating = (rotateEntry?.rotating ?? storedProfile.rotate?.enabled === true) && storedProfile.pages.length >= 2;

  // The page tabs sit above the canvas in Edit, a grid page's or a Free page's. The pill is the Export check of what
  // the canvas shows: the grid page's, or the canvas editor's (a Free page, an opened free area).
  const kioskPageId = control?.profiles[storedProfile.id]?.page;
  const kioskChip = kioskPageId
    ? `Kiosks show ${storedProfile.pages.find((p) => p.id === kioskPageId)?.name ?? "a page"} · rotation ${rotating ? `every ${cycleLabel(storedProfile.rotate?.seconds ?? 0)}` : "paused"}`
    : "No kiosk shows this screen";
  const pageTabsFor = (pill: ReactNode) => (
      <PageTabs
        leftOpen={ui.leftOpen}
        onToggleLeft={ui.toggleLeft}
        pages={storedProfile.pages}
        current={profile.pageId ?? storedProfile.pages[0].id}
        onSelect={onPageChange}
        onAdd={addPage}
        onRename={edit.renamePageTo}
        onMove={edit.movePageTo}
        onDuplicate={edit.duplicateCurrentPage}
        onDelete={edit.deletePage}
        onIcon={ui.setIconPage}
        onPageSettings={(pageId) => {
          // Show the page and deselect, so the Page inspector shows (SPEC §6.2).
          if (pageId !== (profile.pageId ?? storedProfile.pages[0].id)) onPageChange(pageId);
          sel.select(null);
          studioLayout.showInspector();
        }}
        renamingId={ui.renamingPage}
        onRenamingChange={ui.setRenamingPage}
        deletingId={ui.deletingPage}
        onDeletingChange={ui.setDeletingPage}
        kioskPage={control?.profiles[storedProfile.id]?.page}
        imported={importedFromInfoPanel(storedProfile)}
        extra={
          <>
            <MadeForControl value={storedProfile.madeFor} onChange={setMadeFor} />
            {checkOn ? pill : <span className="whitespace-nowrap text-[11.5px] text-ui-5">Studio panels only · no export check</span>}
          </>
        }
      />
  );
  const gridPill = checkOn && !freeZone && (
    <Suspense fallback={null}>
      <GridCheckPill profile={profile} page={storedPage} nameOf={zoneName} open={gridCheckShown} onClick={toggleGridCheck} />
    </Suspense>
  );
  const pageTabsEl = pageTabsFor(gridPill);
  const mainEl = showSources ? (
    canvasEl
  ) : (
    <>
      {pageTabsEl}
      {/* The quick bar floats over the canvas only, below the page tabs. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {canvasEl}
        {quickBar}
      </div>
    </>
  );

  /** Edit shows the canvas editor in the studio's shell on an imported profile's page. */
  const editorShown = !fullPage && activeCanvas !== undefined;
  // Mounted in Edit, and kept (drawing nothing) while the Library covers it, so a Library drag can land in it and the selection survives.
  const canvasEditor = activeCanvas && (editorShown || showLibrary) && (
    <Suspense fallback={editorShown ? <div className="flex-1 bg-ui-app" /> : null}>
      <CanvasEditorView
        key={`${activeCanvas.id}:${editorEpoch}`}
        hidden={!editorShown}
        profileId={storedProfile.id}
        zone={activeCanvas}
        setConfig={setConfig}
        history={history}
        shell={{
          layout: studioLayout,
          rail: phone ? null : <LeftRail active={railActive} onSelect={onRail} onHelp={openHelpWindow} narrow={narrowRail} />,
          railWidth: railWidth(windowWidth),
          leftOpen: ui.leftOpen,
          leftTab: ui.leftTab,
          onLeftTab: ui.setLeftTab,
          leftWidth: ui.leftWidth,
          pageTabs: pageTabsFor,
        }}
        checkOn={checkOn}
        exportView={exportView}
        checkRequest={checkRequest}
        addStart={fixture && { segment: fixture.addSegment, hoverTile: fixture.hoverTile, recent: fixture.recent, toast: fixture.toast, added: fixture.added }}
        onExport={() => io.openExport(activeCanvas)}
        initialSelection={canvasSelection}
        unbound={unboundNote?.zoneId === activeCanvas.id ? unboundNote.labels : undefined}
        onDismissUnbound={() => setUnboundNote(null)}
        onEditGauge={(path) => openGauge({ kind: "canvas", zoneId: activeCanvas.id, path })}
        widgetHost={{
          config,
          profile,
          appearance,
          scope: themeScope,
          setConfig,
          navigateTo: ui.navigateTo,
          onHelp: () => void openHelp(helpTarget()).catch(() => {}),
          onSaveStyle: edit.saveStylePreset,
          onUpdateStyle: edit.updateSavedStyle,
        }}
      />
    </Suspense>
  );

  /** The page holding a library copy: its own, else the one with its zone or (a component added onto a page) its group. */
  const copyPage = (p: MonitorProfile, c: LibraryCopy) =>
    p.pages.find((pg) => pg.id === c.pageId) ??
    p.pages.find((pg) => pg.placements.some((z) => z.id === c.zoneId) || (pg.groups ?? []).some((g) => g.id === c.zoneId));
  /** Where a library copy went: "ARCv2 › Page 1 › Background". */
  const copyLabel = (c: LibraryCopy) => {
    const p = config.profiles.find((x) => x.id === c.profileId);
    if (!p) return c.label ?? "A removed screen";
    const page = copyPage(p, c);
    const zone = page?.placements.find((z) => z.id === c.zoneId);
    const group = page?.groups?.find((g) => g.id === c.zoneId);
    return [p.name, p.pages.length > 1 ? page?.name : null, zone ? zoneName(zone) : (group?.name ?? c.label)].filter(Boolean).join(" › ");
  };
  /** Jump to a copy: its profile and page, then its zone selected (a background opens Theme › Background for the screen). */
  const jumpToCopy = (c: LibraryCopy) => {
    ui.setMode("design");
    const p = config.profiles.find((x) => x.id === c.profileId);
    if (!p) return;
    if (p.id !== storedProfile.id) selectProfile(p.id);
    const page = copyPage(p, c);
    if (page && page.id !== (profile.pageId ?? storedProfile.pages[0].id)) onPageChange(page.id);
    // A component added onto a page is a group of its items (importIntoProfile returns the group's id).
    if (c.zoneId && page?.groups?.some((g) => g.id === c.zoneId)) setPendingGroup(c.zoneId);
    else if (c.zoneId) setPendingZone(c.zoneId);
    else ui.navigateTo({ view: "theme", themeScope: { kind: "profile" }, profileId: p.id, section: "background" });
  };
  const canvasZones = profile.placements.filter(
    (z): z is typeof z & { canvas: NonNullable<typeof z.canvas> } => z.module === CANVAS_ID && !!z.canvas,
  );
  /** A Library profile's "Edit profile": the InfoPanel editor on the first zone made from it, else it comes in as a new screen (no import dialog, it is already stored) that opens in the editor. */
  const editCanvas = async (item: LibraryItem) => {
    const stored = await dataOf<StoredCanvas>(item);
    if (!stored) return;
    const use = findCanvasUse(config, stored);
    if (use) {
      openOnLand.current = use.zoneId;
      return openZone(use.profileId, use.pageId, use.zoneId);
    }
    const size = { width: Number(stored.profile.Width) || 1, height: Number(stored.profile.Height) || 1 };
    const r = importAsProfile(config, stored, item.name, size, false);
    setConfig(r.config);
    selectProfile(r.profileId);
    ui.fitZoom();
    openOnLand.current = r.zoneId;
    setPendingZone(r.zoneId);
    void recordCopy(item, { profileId: r.profileId, zoneId: r.zoneId, label: item.name });
  };
  const libraryEl = showLibrary && (
    <Suspense fallback={<div className="flex-1 bg-ui-app" />}>
      <LibraryPage
        key={libraryEpoch}
        bridge={libraryBridge}
        request={ui.libraryRequest}
        selectionStyle={selected ? ownStyle(selected, appearance) : null}
        onOpenTheme={() => ui.navigateTo({ view: "theme" })}
        onEditCanvas={(item) => void editCanvas(item)}
        onShowCanvas={() => {
          // Edit: the canvas editor when one is open, where a component dragged out of the Library lands.
          ui.setMode("design");
        }}
        theme={resolveTheme(profile).tokens}
        profileName={storedProfile.name}
        onImport={(source, dest) => io.openImport(dest, source, true)}
        onOpenGauge={(itemId) => openGauge({ kind: "library", itemId })}
        onNewScreen={openNewScreenFrom}
        onNewProfile={(template, variant) => openNewProfile({ template, variant })}
        onAddScreen={createScreen}
        onExportCanvas={(item) =>
          void dataOf<StoredCanvas>(item).then((canvas) =>
            canvas
              ? io.openExport({ id: item.id, module: CANVAS_ID, colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true, canvas })
              : undefined,
          )
        }
        copyLabel={copyLabel}
        onJump={jumpToCopy}
        assets={{
          zones: canvasZones,
          setConfig,
          // The page's canvas (an imported profile's) reopens with those items selected.
          onSelectUses: (_zoneId, paths) => {
            ui.setMode("design");
            setCanvasSelection(paths);
            setEditorEpoch((n) => n + 1);
          },
        }}
      />
    </Suspense>
  );

  // The New page, over Screens, for a screen or an InfoPanel profile.
  const newPageEl = newPage && showScreens && (
    <Suspense fallback={<div className="flex-1 bg-ui-app" />}>
      <NewPage
        kind={newPage.kind}
        onKind={switchNewKind}
        screen={newPage.size ?? storedProfile}
        initial={newPage.initial}
        onCreateScreen={createScreen}
        onCreateProfile={createInfoPanel}
        onCancel={() => {
          setNewPage(null);
          ui.setMode(newPage.back);
        }}
        onSample={() => {
          setNewPage(null);
          void import("@/lib/screens/create").then(({ sampleScreen }) => {
            edit.addImportedProfile(sampleScreen(uniqueProfileName(config.profiles, "Sample layout")));
            toast("Screen created from the sample layout");
          });
        }}
        onImport={(kind) => {
          setNewPage(null);
          openImportDoor(kind === "ip" ? { prefer: "canvas-zone" } : undefined);
        }}
      />
    </Suspense>
  );

  const gaugesEl = showGauges && (
    <Suspense fallback={<div className="flex-1 bg-ui-app" />}>
      <GaugesPage
        bridge={libraryBridge}
        profileName={storedProfile.name}
        theme={resolveTheme(profile).tokens}
        initial={gaugeToOpen}
        onOpened={() => setGaugeToOpen(null)}
        onShowCanvas={() => ui.setMode("design")}
      />
    </Suspense>
  );

  // Theme's screen and page: the ones its scope bar picked, else the Design selection (SPEC §7.1).
  const themeProfile = config.profiles.find((p) => p.id === ui.themeProfileId) ?? storedProfile;
  const themePage = ui.themeScope.kind === "page" ? ui.themeScope.pageId : ui.themePageId;
  const themePageId = themeProfile.pages.some((pg) => pg.id === themePage)
    ? themePage!
    : themeProfile.id === storedProfile.id
      ? (profile.pageId ?? storedProfile.pages[0].id)
      : themeProfile.pages[0].id;
  const themeEl = showTheme && (
    <Suspense fallback={<div className="flex-1 bg-ui-app" />}>
      <ThemeEditor
      config={config}
      scope={ui.themeScope}
      profileId={themeProfile.id}
      pageId={themePageId}
      onPick={ui.openTheme}
      setConfig={setConfig}
      navigateTo={ui.navigateTo}
      navRequest={ui.navRequest}
      jumpTo={ui.inspectorJump}
      presets={appearancePresets}
      onUndo={history.undo}
      onOpenZone={openZone}
    />
    </Suspense>
  );

  const preview = usePreviewData();
  const bar = fullPage ? null : (
    <ZoomToolbar
      zoom={ui.zoom}
      fitting={ui.fitting}
      showGrid={ui.showGrid}
      onToggleGrid={() => ui.setShowGrid((s) => !s)}
      showRulers={ui.showRulers}
      onToggleRulers={() => ui.setShowRulers((s) => !s)}
      onZoomStep={ui.zoomStep}
      onFit={ui.fitZoom}
      profile={profile}
      onOpenProfile={() => ui.navigateTo({ view: "screens", profileId: storedProfile.id })}
      preview={showSources ? undefined : preview}
      snapItems={showSources ? undefined : storedPage.snapItems !== false}
      exportView={showSources ? undefined : exportView}
      bottom={
        inspectorMode === "sheet"
          ? Math.min(studioLayout.sheet.height, sheetHeight("half", studioLayout.sheet.area, true)) + 8
          : undefined
      }
    />
  );

  return (
    <div className="studio-root flex h-screen flex-col overflow-hidden bg-ui-app font-ui text-ui-1">
      {/* The offscreen thumbnails need no live data: frozen with the canvas. */}
      <PreviewDataProvider>
        <ProfileShots
          profiles={config.profiles}
          dashboard={config}
          editedId={storedProfile.id}
          canvasIsFirstPage={(profile.pageId ?? storedProfile.pages[0].id) === storedProfile.pages[0].id}
          scrollRef={ui.scrollRef}
          zoom={ui.zoom}
          pushPending={pushPending}
        />
      </PreviewDataProvider>
      <StudioTopBar
        profiles={config.profiles}
        profile={storedProfile}
        pageId={profile.pageId ?? storedProfile.pages[0].id}
        onSelectScreen={(profileId, pageId) => {
          selectProfile(profileId);
          onPageChange(pageId);
        }}
        onManageScreens={() => ui.navigateTo({ view: "screens" })}
        onScreenSettings={() => ui.navigateTo({ view: "screens", profileId: storedProfile.id })}
        liveOpen={ui.liveOpen}
        onLiveOpenChange={ui.setLiveOpen}
        kiosks={kiosksOf(control)}
        control={control}
        onExitStudio={onExitStudio}
        saved={ui.saved}
        unsaved={pushPending}
        onSave={ui.handleSave}
        onExport={() => openExportSheet()}
        onImport={() => openImportDoor()}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={history.undo}
        onRedo={history.redo}
        onPalette={() => ui.setPaletteOpen(true)}
      />
      {/* The canvas editor brings its own shell (same slots and widths): in Edit on a Free page or a free area. */}
      {canvasEditor}
      {!editorShown && (
        <StudioShell
          layout={studioLayout}
          rail={phone ? null : <LeftRail active={railActive} onSelect={onRail} onHelp={openHelpWindow} narrow={narrowRail} />}
          railWidth={railWidth(windowWidth)}
          drawer={!fullPage && ui.leftOpen && leftPanelEl}
          main={newPageEl || alertsEl || screensEl || gaugesEl || themeEl || libraryEl || mainEl}
          bar={bar}
          inspector={fullPage ? null : inspectorAside}
        />
      )}
      <StatusBar {...statusBar} kioskChip={kioskChip} onNavigate={ui.navigateTo} onOpenLive={() => ui.setLiveOpen(true)} />
      {phone && <PhoneTabBar active={railActive} onSelect={onRail} onHelp={openHelpWindow} />}

      <WidgetPickerDialog
        placement={profile.placements.find((p) => p.id === ui.pickerFor) ?? null}
        savedPanels={config.panelPresets}
        onRenamePreset={edit.renameSavedPanel}
        onDeletePreset={edit.deleteSavedPanel}
        onPick={(value) => {
          if (ui.pickerFor) edit.assignWidget(ui.pickerFor, value);
          ui.setPickerFor(null);
        }}
        onClose={() => ui.setPickerFor(null)}
      />
      <CommandPalette
        open={ui.paletteOpen}
        onOpenChange={ui.setPaletteOpen}
        commands={commands}
        onRun={(command) => runCommand(command.action)}
      />
      {pickSensor && (
        <Suspense fallback={null}>
          <SensorPicker
            open
            onOpenChange={(open) => !open && setPickSensor(null)}
            title={`Choose a sensor for ${pickSensor.label}`}
            pluginOnly={pickSensor.pluginOnly}
            current={null}
            onPick={(sensor) => {
              // The item as the page holds it now (at its box), else as it was made.
              const id = pickSensor.id;
              const item = storedPage.placements.find((p) => p.id === id)?.item ?? pickSensor.item;
              void import("@/components/infopanel/edit/grid-item-add").then(({ boundPagePart }) =>
                edit.setPagePartItem(id, boundPagePart(storedPage, item, sensor, { width: profile.width, height: profile.height })),
              );
            }}
          />
        </Suspense>
      )}
      {layers.saveDialog}
      {layerMenu && (
        <Suspense fallback={null}>
          <LayerMenu
            x={layerMenu.x}
            y={layerMenu.y}
            host={{ ...layers.host.menu, rename: layers.selection.length === 1 ? layers.requestRename : undefined }}
            extra={layerMenu.zone && sel.selected ? zoneMenuExtras({ sel, ...zoneMenuDeps }) : undefined}
            onClose={() => setLayerMenu(null)}
          />
        </Suspense>
      )}
      {menus.menu && (
        <StudioContextMenu
          menu={menus.menu}
          sel={sel}
          {...zoneMenuDeps}
          onClose={menus.close}
        />
      )}
      <PageIconDialog
        page={storedProfile.pages.find((p) => p.id === ui.iconPage)}
        onPick={(icon) => ui.iconPage && edit.setIconOfPage(ui.iconPage, icon)}
        onClose={() => ui.setIconPage(null)}
      />
      <ShortcutsDialog open={ui.shortcutsOpen} onOpenChange={ui.setShortcutsOpen} />
      {io.dialogs}
      {importDoor}
      {setup && (
        <Suspense fallback={<div className="fixed inset-0 z-50 bg-ui-app" />}>
          <FirstRunPage
            rerun={setup.rerun}
            dataApiUrl={config.dataApiUrl}
            windowSize={{ width: windowWidth, height: windowHeight }}
            onSkip={(dataApiUrl) => {
              const rerun = setup.rerun;
              setSetup(null);
              // Skipping a first run still marks it done: the config is saved with the Data API address.
              if (!rerun) setConfig((c) => ({ ...c, dataApiUrl: dataApiUrl ?? c.dataApiUrl ?? DEFAULT_API_BASE }), "first-run");
            }}
            onFinish={(outcome: SetupOutcome) => {
              const rerun = setup.rerun;
              setSetup(null);
              const made = applyFirstRun(config, outcome.choices);
              const dataApiUrl = outcome.dataApiUrl ?? (rerun ? config.dataApiUrl : (config.dataApiUrl ?? DEFAULT_API_BASE));
              const next = dataApiUrl === config.dataApiUrl ? made.config : { ...made.config, dataApiUrl };
              if (next !== config) setConfig(() => next, "first-run");
              if (outcome.next === "screen") {
                selectProfile(made.profileId);
                ui.setMode("design");
                ui.fitZoom();
              } else if (outcome.next === "import-installed") io.openImport("new", { installed: true });
              else if (outcome.next === "import-file") openImportDoor();
              if (outcome.openKiosk) window.open(outcome.openKiosk, "_blank", "noopener,noreferrer");
            }}
          />
        </Suspense>
      )}
      <ExportSheet
        open={exportRequest !== null}
        request={exportRequest ?? NO_REQUEST}
        config={config}
        screen={storedProfile}
        pageName={storedProfile.pages.find((p) => p.id === currentPageId)?.name ?? ""}
        pageCanvas={canvasZoneOf(profile, sel.primaryId ?? undefined)}
        onExportPage={() => io.openExport()}
        onClose={() => setExportRequest(null)}
        toast={toast}
      />
    </div>
  );
}

import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type MutableRefObject, type ReactNode, type SetStateAction } from "react";
import { useConfigHistory, type AdoptChange } from "@/hooks/use-config-history";
import { ToastProvider } from "@/components/ui/toast";
import { ThemeEditor } from "./theme-editor";
import {
  BLANK_MODULE,
  CANVAS_ID,
  resolveProfile,
  type DashboardConfig,
  type MadeFor,
  type PageLayout,
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
import { useGeneral } from "@/hooks/use-general";
import { fontStack, resolveFont } from "@/lib/general";
import { madeForInfoPanel, screenKind } from "@/lib/screens/list";
import { MadeForControl } from "./made-for-control";
import { ToGridDialog } from "./layout-control";
import { useStoredFlag } from "./use-stored-flag";
import { useAddFilter } from "./add-prefs";
import { ADD_TOAST_MS } from "./use-add-panel";
import type { CanvasPoint } from "./drop-ghost";
import { firstFreeRect } from "./zone-geometry";
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
import { useInspectorFollowsSelection, useStudioUi } from "./use-studio-ui";
import { SelectionChip } from "./selection-chip";
import { StudioContextMenu, useContextMenu } from "./zone-context-menu";
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
import { applyThemeAt } from "@/lib/appearance-preset-apply";
import type { AppearancePreset } from "@/lib/appearance-presets";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import type { FixtureStart } from "@/dev/fixtures/types";

/** The Export sheet's request while it is closed (a stable object, so its rows keep their state). */
const NO_REQUEST: ExportRequest = {};

/** A grid page's Export check and On InfoPanel lines: the export model loads only for a screen made for InfoPanel. */
const GridCheckPill = lazy(() => import("@/components/infopanel/grid-export").then((m) => ({ default: m.GridCheckPill })));
const GridCheckPanel = lazy(() => import("@/components/infopanel/grid-export").then((m) => ({ default: m.GridCheckPanel })));
const GridOnInfoPanel = lazy(() => import("@/components/infopanel/grid-export").then((m) => ({ default: m.GridOnInfoPanel })));
const GridBadge = lazy(() => import("@/components/infopanel/grid-export").then((m) => ({ default: m.GridBadge })));
/** A grid page's InfoPanel items in Add, loaded when the panel first lists them. */
const GridPalette = lazy(() => import("@/components/infopanel/edit/grid-palette"));
/** How many InfoPanel item kinds Add offers (`PALETTE.length` in editor/create.ts; kept here so the palette stays lazy). */
export const INFOPANEL_ITEM_KINDS = 14;

/** The canvas editor (A5): Edit on a Free page or a free area, loaded when one is first opened. */
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
    for (const id of start.selection) sel.select(id, "toggle");
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
      // A fresh import, or a new profile, opens its canvas zone in Edit (spec §4).
      openOnLand.current = null;
      ui.setMode("design");
      setCanvasSelection(undefined);
      setEditingCanvas(pendingZone);
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
      if (newProfile) ui.fitZoom();
      openOnLand.current = zoneId;
      setPendingZone(zoneId);
    },
    onSelectProfile: selectProfile,
  });
  /**
   * A free area opened from a grid page (double-click, the inspector's Edit): one canvas zone on the screen and page
   * Edit shows. Its stored form in the config is the one source of truth, so the studio's history undoes every edit.
   * It closes when the zone goes (an undo past its import, another screen or page).
   */
  const [editingCanvas, setEditingCanvas] = useState<string | null>(null);
  const onRail = (item: RailItem) => {
    setNewPage(null);
    ui.onRail(item);
  };
  /** Edit a canvas zone of the page Edit shows: the canvas editor opens on it. */
  const editCanvasZone = (zoneId: string) => {
    setCanvasSelection(undefined);
    setEditingCanvas(zoneId);
    ui.setMode("design");
  };
  /** Items the editor opens with selected (the Library's "uses"). */
  const [canvasSelection, setCanvasSelection] = useState<string[] | undefined>(fixture?.canvasSelection);
  const canvasZone = editingCanvas ? profile.placements.find((p) => p.id === editingCanvas && p.module === CANVAS_ID && p.canvas) : undefined;
  useEffect(() => {
    // Leaving the page keeps the area open (the rail brings it back); the zone going closes it. Only if it is
    // still the open one: an import onto another screen opens its own zone in the same commit.
    if (editingCanvas && !canvasZone) setEditingCanvas((open) => (open === editingCanvas ? null : open));
  }, [editingCanvas, canvasZone]);
  /** The stored page on the canvas. */
  const storedPage = storedProfile.pages.find((p) => p.id === profile.pageId) ?? storedProfile.pages[0];
  /** A Free page (its layout, one canvas filling the screen, as every InfoPanel profile's) is edited in the canvas editor. */
  const freeZone = isFreePage(profile, storedPage) ? profile.placements[0] : null;
  /** What Edit's canvas editor shows: the Free page's canvas, else the free area opened from the grid. */
  const activeCanvas = freeZone?.canvas ? (freeZone as typeof freeZone & { canvas: NonNullable<typeof freeZone.canvas> }) : canvasZone?.canvas ? (canvasZone as typeof canvasZone & { canvas: NonNullable<typeof canvasZone.canvas> }) : undefined;
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
  const isCanvasZone = (id: string) => profile.placements.some((p) => p.id === id && p.module === CANVAS_ID && p.canvas);

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

  /** The profile's own theme, scoped to the canvas (the chrome keeps the dashboard's). */
  const ownTheme = profile.theme !== undefined || profile.radius !== undefined;
  const canvasTheme = ownTheme ? resolveTheme(config, profile) : null;
  const themeScope = canvasTheme ? (themeVars(canvasTheme.tokens, canvasTheme.radius) as CSSProperties) : undefined;

  /** The Add panel (handoff SPEC): its catalog, Recent, toast and flash; a click fills the selected blank zone. */
  const addPanel = useAddPanel({ config, addFromPanel: edit.addFromPanel, targetZoneId: blankZoneId, undo: history.undo });
  const [addDensity] = useAddListDensity();
  const [addPreviewOnHover] = useAddPreviewOnHover();
  const pageFont = fontStack(resolveFont(useGeneral(), profile));
  const addTarget = blankZoneId && selected ? { id: blankZoneId, cols: selected.colSpan, rows: selected.rowSpan } : undefined;

  /** The screen is made for InfoPanel (SPEC §5.1): the Export check, the badges and the On InfoPanel lines show. */
  const checkOn = madeForInfoPanel(storedProfile);
  const setMadeFor = (madeFor: MadeFor) =>
    setConfig((c) => ({ ...c, profiles: c.profiles.map((p) => (p.id === storedProfile.id ? { ...p, madeFor } : p)) }));

  /** Grid ↔ Free (SPEC §6): one undo step, the selection cleared, a toast with Undo. Free → Grid asks first when it makes a free area. */
  const [confirmToGrid, setConfirmToGrid] = useStoredFlag("studio.confirmToGrid", true);
  const [toGridAsk, setToGridAsk] = useState<{ pageId: string; parts: number } | null>(null);
  const commitLayout = (pageId: string, to: PageLayout) =>
    void import("@/lib/page-layout").then(({ switchLayout }) => {
      let message = "";
      let refused = "";
      setConfig((c) => {
        const r = switchLayout(c, storedProfile.id, pageId, to, zoneName);
        if ("refused" in r) {
          refused = r.refused;
          return c;
        }
        message = r.result.message;
        return r.config;
      });
      if (refused) return toast(refused);
      setEditingCanvas(null);
      setCanvasSelection(undefined);
      sel.select(null);
      if (pageId !== currentPageId) onPageChange(pageId);
      toast(message, { action: { label: "Undo", onClick: history.undo }, ms: ADD_TOAST_MS });
    });
  const switchPageLayout = (pageId: string, to: PageLayout) => {
    if (to === "free" || !confirmToGrid) return commitLayout(pageId, to);
    void import("@/lib/page-layout").then(({ switchLayout }) => {
      const r = switchLayout(config, storedProfile.id, pageId, to, zoneName);
      if ("refused" in r) return toast(r.refused);
      if (r.result.kept > 0) setToGridAsk({ pageId, parts: r.result.kept });
      else commitLayout(pageId, to);
    });
  };
  /** Switching waits for a page's canvases to load (SPEC §11). */
  const layoutDisabled = storedPage.placements.some((p) => p.module === CANVAS_ID && !p.canvas) ? "This page's content isn't loaded yet." : undefined;
  /** A page added from a Free page is Free too (SPEC §9). */
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

  /**
   * An InfoPanel item or element on a grid page (SPEC §5.3): into the free area it was dropped on (or the selected
   * one, for a click), else into a new free area on the cell it was dropped on (or the first free cell). The canvas
   * editor opens on the area and adds it there.
   */
  const [pendingAdd, setPendingAdd] = useState<{ zoneId: string; data: string; at?: { x: number; y: number } } | null>(null);
  useEffect(() => {
    if (pendingAdd && editingCanvas !== pendingAdd.zoneId) setPendingAdd(null);
  }, [editingCanvas]);
  const addPaletteItem = (data: string, cell?: { col: number; row: number }, inCanvas?: CanvasPoint | null) => {
    const areaId = inCanvas?.zoneId ?? (!cell && selected?.module === CANVAS_ID ? selected.id : undefined);
    const area = areaId ? profile.placements.find((p) => p.id === areaId && p.module === CANVAS_ID && p.canvas) : undefined;
    if (area?.canvas) {
      const at = inCanvas ? { x: inCanvas.fx * Number(area.canvas.profile.Width), y: inCanvas.fy * Number(area.canvas.profile.Height) } : undefined;
      setPendingAdd({ zoneId: area.id, data, at });
      editCanvasZone(area.id);
      return;
    }
    const covered = (c: { col: number; row: number }) =>
      profile.placements.some((p) => c.col >= p.colStart && c.col < p.colStart + p.colSpan && c.row >= p.rowStart && c.row < p.rowStart + p.rowSpan);
    const rect = cell ? (covered(cell) ? null : { col: cell.col, row: cell.row, cols: 1, rows: 1 }) : firstFreeRect(profile.cols, profile.rows, { cols: 1, rows: 1 }, profile.placements);
    if (!rect) return toast(cell ? "No room there" : "No free cell on this page for a free area");
    void import("@/lib/page-layout").then(({ freeArea }) => {
      const zone = freeArea(profile, { colStart: rect.col, rowStart: rect.row, colSpan: rect.cols, rowSpan: rect.rows });
      edit.updateProfile((v) => ({ ...v, placements: [...v.placements, zone] }));
      setPendingAdd({ zoneId: zone.id, data });
      editCanvasZone(zone.id);
      toast("Made a free area for it. Done goes back to the grid.");
    });
  };
  const [addFilter, setAddFilter] = useAddFilter();

  /** A grid widget's On InfoPanel section, on a screen made for InfoPanel. */
  const onInfoPanelOf = checkOn
    ? (zone: Placement) =>
        zone.module === CANVAS_ID || zone.module === BLANK_MODULE ? null : (
          <Suspense fallback={null}>
            <GridOnInfoPanel zone={zone} name={zoneName(zone)} onSettings={(settings) => edit.updatePlacement(zone.id, (p) => ({ ...p, settings }))} />
          </Suspense>
        )
    : undefined;

  const inspectorAside = gridCheckShown ? (
    <aside aria-label="Export check" className={studioLayout.mode !== "docked" ? "flex h-full w-full flex-col overflow-y-auto bg-ui-panel font-ui" : "flex w-[320px] shrink-0 flex-col overflow-y-auto border-l border-ui-subtle bg-ui-panel font-ui"}>
      <Suspense fallback={null}>
        <GridCheckPanel
          profile={profile}
          nameOf={zoneName}
          onSelect={(id) => {
            setGridCheckOpen(false);
            focusZone(id);
          }}
          onConvert={() => openConvertDialog("screen")}
          onClose={() => setGridCheckOpen(false)}
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
      onEditCanvas={editCanvasZone}
      onEditGauge={(zoneId) => openGauge({ kind: "widget", zoneId })}
      onLayout={switchPageLayout}
      layoutDisabled={layoutDisabled}
      onInfoPanelOf={onInfoPanelOf}
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
        recent: addPanel.recent,
        target: addTarget,
        onClearTarget: () => sel.select(null),
        onAdd: addPanel.add,
        onRenamePreset: edit.renameSavedPanel,
        onDeletePreset: edit.deleteSavedPanel,
        onImportCanvas: () => openImportDoor({ prefer: "canvas-zone" }),
        onNewInfoPanel: openNewInfoPanel,
        density: addDensity,
        previewOnHover: addPreviewOnHover,
        appearance,
        pageStyle: { ...themeScope, fontFamily: pageFont },
        free: {
          filter: addFilter,
          onFilter: setAddFilter,
          itemCount: INFOPANEL_ITEM_KINDS,
          grid: true,
          items: (query) => (
            <Suspense fallback={null}>
              <GridPalette query={query} onAdd={(data) => addPaletteItem(data)} />
            </Suspense>
          ),
        },
      }}
      layers={{
        placements: profile.placements,
        selectedIds: sel.selectedIds,
        onSelect: (id, toggle) => (toggle ? sel.select(id, "toggle") : focusZone(id)),
        onToggle: edit.toggleVisible,
        onRemove: edit.removePlacement,
        onContextMenu: menus.open,
      }}
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
      background={resolveBackground(config, profile)}
      appearance={appearance}
      themeScope={themeScope}
      radius={resolveTheme(config, profile).radius}
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
        sel.select(id, how);
        // A blank zone picked on the canvas is the Add panel's target: the panel shows, its search takes the cursor.
        if (how !== "toggle" && profile.placements.find((p) => p.id === id)?.module === BLANK_MODULE) ui.setLeftTab("add");
      }}
      onOpenSettings={(id) => (isCanvasZone(id) ? editCanvasZone(id) : studioLayout.showInspector())}
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
      onPaletteDrop={addPaletteItem}
      addItemOf={addPanel.itemOf}
      onAddDrop={addPanel.drop}
      targetZoneId={blankZoneId}
      onClearTarget={() => sel.select(null)}
      flash={addPanel.flash}
      toast={addPanel.toast && <AddToast toast={addPanel.toast} onUndo={addPanel.undoAdd} />}
      onContextMenu={menus.open}
      onOpenAdd={() => ui.openDrawer("add")}
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
        rotation={rotating ? `every ${cycleLabel(storedProfile.rotate?.seconds ?? 0)}` : "paused"}
        onOpenLive={() => ui.setLiveOpen(true)}
        onLayout={switchPageLayout}
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
      <GridCheckPill profile={profile} nameOf={zoneName} open={gridCheckShown} onClick={toggleGridCheck} />
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

  /** Edit shows the canvas editor in the studio's shell on a Free page or an opened free area. */
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
        onLayout={freeZone ? () => switchPageLayout(currentPageId, "grid") : undefined}
        initialAdd={pendingAdd?.zoneId === activeCanvas.id ? pendingAdd : undefined}
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
        onDone={
          freeZone
            ? undefined
            : () => {
                const id = activeCanvas.id;
                setEditingCanvas(null);
                setCanvasSelection(undefined);
                focusZone(id);
              }
        }
      />
    </Suspense>
  );

  /** Where a library copy went: "ARCv2 › Page 1 › Background". */
  const copyLabel = (c: LibraryCopy) => {
    const p = config.profiles.find((x) => x.id === c.profileId);
    if (!p) return c.label ?? "A removed screen";
    const page = p.pages.find((pg) => pg.id === c.pageId) ?? p.pages.find((pg) => pg.placements.some((z) => z.id === c.zoneId));
    const zone = page?.placements.find((z) => z.id === c.zoneId);
    return [p.name, p.pages.length > 1 ? page?.name : null, zone ? zoneName(zone) : c.label].filter(Boolean).join(" › ");
  };
  /** Jump to a copy: its profile and page, then its zone selected (a background opens Theme › Background for the screen). */
  const jumpToCopy = (c: LibraryCopy) => {
    ui.setMode("design");
    const p = config.profiles.find((x) => x.id === c.profileId);
    if (!p) return;
    if (p.id !== storedProfile.id) selectProfile(p.id);
    const page = p.pages.find((pg) => pg.id === c.pageId) ?? p.pages.find((pg) => pg.placements.some((z) => z.id === c.zoneId));
    if (page && page.id !== (profile.pageId ?? storedProfile.pages[0].id)) onPageChange(page.id);
    if (c.zoneId) setPendingZone(c.zoneId);
    else ui.navigateTo({ view: "theme", themeScope: { kind: "profile" }, profileId: p.id, section: "background" });
  };
  const canvasZones = profile.placements.filter(
    (z): z is typeof z & { canvas: NonNullable<typeof z.canvas> } => z.module === CANVAS_ID && !!z.canvas,
  );
  /** A saved Theme's "Edit in Theme": applied to All screens (one undo step), then Theme opens there in its Editing state. */
  const editInTheme = (preset: AppearancePreset) => {
    setConfig((c) => applyThemeAt(c, preset, { kind: "all" }, { includeBackground: true }));
    ui.openTheme({ kind: "base" });
    ui.setThemeEditing(preset.id);
  };
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
        pageId={currentPageId}
        selectionStyle={selected ? ownStyle(selected, appearance) : null}
        onEditInTheme={editInTheme}
        onEditCanvas={(item) => void editCanvas(item)}
        onShowCanvas={() => {
          // Edit: the canvas editor when one is open, where a component dragged out of the Library lands.
          ui.setMode("design");
        }}
        theme={resolveTheme(config, profile).tokens}
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
          onSelectUses: (zoneId, paths) => {
            ui.setMode("design");
            setCanvasSelection(paths);
            setEditorEpoch((n) => n + 1);
            setEditingCanvas(zoneId);
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
        theme={resolveTheme(config, profile).tokens}
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
      editingId={ui.themeEditing}
      onStopEditing={() => ui.setThemeEditing(undefined)}
    />
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
      <StatusBar {...statusBar} onNavigate={ui.navigateTo} onOpenLive={() => ui.setLiveOpen(true)} />
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
      {menus.menu && (
        <StudioContextMenu
          menu={menus.menu}
          sel={sel}
          canPasteStyle={ui.styleClipboard !== null}
          canStep={(cols, rows) =>
            selected !== null &&
            edit.resizeSelected({ cols: selected.colSpan + cols, rows: selected.rowSpan + rows }) !== null
          }
          canArrange={(op) => edit.arrangement(op) !== null}
          otherPages={storedProfile.pages.filter((p) => p.id !== profile.pageId)}
          onRun={runCommand}
          onClose={menus.close}
        />
      )}
      <PageIconDialog
        page={storedProfile.pages.find((p) => p.id === ui.iconPage)}
        onPick={(icon) => ui.iconPage && edit.setIconOfPage(ui.iconPage, icon)}
        onClose={() => ui.setIconPage(null)}
      />
      <ShortcutsDialog open={ui.shortcutsOpen} onOpenChange={ui.setShortcutsOpen} />
      <ToGridDialog
        key={toGridAsk?.pageId ?? "none"}
        parts={toGridAsk?.parts ?? null}
        onCancel={() => setToGridAsk(null)}
        onConfirm={(askAgain) => {
          const ask = toGridAsk;
          setToGridAsk(null);
          if (!askAgain) setConfirmToGrid(false);
          if (ask) commitLayout(ask.pageId, "grid");
        }}
      />
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

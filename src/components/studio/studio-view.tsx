import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { useConfigHistory } from "@/hooks/use-config-history";
import { ToastProvider } from "@/components/ui/toast";
import { SourcesPanel } from "./sources-panel";
import { ThemeEditor } from "./theme-editor";
import {
  BLANK_MODULE,
  CANVAS_ID,
  defaultConfig,
  resolveProfile,
  type DashboardConfig,
  type ProfileView,
} from "@/lib/layout";
import { resolveBackground } from "@/lib/appearance";
import { useSensorCatalog } from "@/lib/catalog";
import { buildDataModel } from "@/lib/data-points";
import { appearanceOf } from "@/lib/style-resolve";
import { resolveTheme, themeVars } from "@/lib/theme";
import { CommandPalette } from "./command-palette";
import { exportConfigFile, importConfigFile, startConfigImport } from "./config-file";
import { useStyleEdits } from "./use-style-edits";
import { cn } from "@/lib/utils";
import { ProfileShots } from "./profile-shots";
import { StudioCanvas } from "./studio-canvas";
import { StudioTopBar } from "./studio-top-bar";
import { LeftRail } from "./left-rail";
import { DesignLeftPanel } from "./design-left-panel";
import { AlertsView } from "./alerts-view";
import { ScreensView } from "./screens-view";
import { withScreenPerformance } from "./screens-model";
import { SettingsView } from "./settings-view";
import { StatusBar } from "./status-bar";
import { useStatusBar } from "./use-status-bar";
import { StudioInspector } from "./studio-inspector";
import { StudioShell } from "./studio-shell";
import { QuickBar } from "./quick-bar";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { useInfoPanelIo } from "./infopanel-io";
import { helpZoneKind } from "./help-zone";
import { useStudioCommands } from "./use-studio-commands";
import { railWidth } from "./use-studio-layout";
import { useStudioMutations } from "./use-studio-mutations";
import { useStudioSelection } from "./use-studio-selection";
import { useInspectorFollowsSelection, useStudioUi } from "./use-studio-ui";
import { SelectionChip } from "./selection-chip";
import { StudioContextMenu, useContextMenu } from "./zone-context-menu";
import { widgetName } from "./widget-kinds";
import { WidgetPickerDialog } from "./widget-picker-dialog";
import { kiosksOf, postControl, useControl } from "@/lib/control";
import { openHelp } from "@/lib/desktop";
import { dialogArticle, studioHelpTarget } from "@/help/context";
import { useHelpKey } from "@/help/use-help-key";
import { isIslandAlert } from "@/lib/island/from-alerts";
import { visibleAlerts } from "@/components/alerts/alert-model";
import { cycleLabel, PageTabs } from "./page-tabs";
import { PageIconDialog } from "./page-icon-dialog";
import { islandSectionId } from "./island-panel-model";
import { ISLAND_SETTING } from "@/lib/island/sources";
import { modules } from "@/modules";
import { ZoomToolbar } from "./zoom-toolbar";
import { sheetHeight } from "./studio-layout";
import { zoneName } from "./inspector/zone-meta";
import { dataOf, type StudioBridge } from "@/components/library/library-actions";
import type { GaugeSource } from "@/lib/gauge-studio/model";
import { dropLibraryItem, librarySizeOf } from "@/components/library/library-drop";
import { recordCopy } from "@/lib/my-library/copies";
import { useToast } from "@/components/ui/toast";
import type { LibraryCopy } from "@/lib/library";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";

/** The canvas zone editor (A5), loaded when a canvas zone's items are first edited. */
const CanvasEditorView = lazy(() => import("@/components/infopanel/edit/canvas-editor"));
/** The Library page (A6, with the Gauges collection), loaded when the rail first opens it. */
const LibraryPage = lazy(() => import("@/components/library/library-page"));

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
}: StudioViewProps) {
  const history = useConfigHistory(config, setConfigState);
  const toast = useToast();
  // Runtime state of the kiosks (page shown, rotating): not config, never in the undo history.
  const control = useControl();
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
  useInspectorFollowsSelection(ui, sel.primaryId, selectedWidgetId);
  const edit = useStudioMutations({
    config,
    profile,
    setConfig,
    sel,
    onPresetSaved: () => ui.setPresetNaming(false),
    windowSize: { width: windowWidth, height: windowHeight },
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
  });
  /** Sensor names for widget names (toolbar crumb, palette). */
  const catalog = useSensorCatalog();
  const dataPoints = useMemo(() => buildDataModel(catalog.sources, catalog.sensors).points, [catalog.sources, catalog.sensors]);
  const { studioLayout, showSources, showLibrary, showTheme, showAlerts, showScreens, showSettings, fullPage } = ui;
  const narrowRail = railWidth(windowWidth) < 72;
  // F1 and the rail's Help: the article for what the user is on (an open dialog, the selected zone, the Screens view).
  const helpTarget = () =>
    studioHelpTarget({ dialog: dialogArticle(), zone: helpZoneKind(selected), drawer: showScreens ? "profiles" : null });
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
      // A fresh import opens its canvas zone in the editor (spec §4).
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
   * The canvas zone whose items are being edited: the editor takes the canvas, drawer and
   * inspector's place. It closes when the zone goes (an undo past its import, another page).
   */
  const [editingCanvas, setEditingCanvas] = useState<string | null>(null);
  /** Items the editor opens with selected (the Library's "uses"). */
  const [canvasSelection, setCanvasSelection] = useState<string[] | undefined>(undefined);
  const canvasZone = editingCanvas ? profile.placements.find((p) => p.id === editingCanvas && p.module === CANVAS_ID && p.canvas) : undefined;
  useEffect(() => {
    // The Library page covers the editor without closing it, so a Library drag can land in it.
    if (editingCanvas && (!canvasZone || (fullPage && !showLibrary))) setEditingCanvas(null);
  }, [editingCanvas, canvasZone, fullPage, showLibrary]);
  /** Bumped to reopen the editor with new initial selection (the Library's "uses" while it is mounted). */
  const [editorEpoch, setEditorEpoch] = useState(0);
  const isCanvasZone = (id: string) => profile.placements.some((p) => p.id === id && p.module === CANVAS_ID && p.canvas);

  /** The gauge the Library's Gauges collection opens in its editor ("Edit gauge…" from a zone or a canvas item). */
  const [gaugeToOpen, setGaugeToOpen] = useState<GaugeSource | null>(null);
  const openGauge = (source: GaugeSource) => {
    setGaugeToOpen(source);
    ui.openLibrary("gauges");
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

  /** The one selected zone, when it is blank: the Add panel's click fills it. */
  const blankZoneId = selected && sel.selection.length === 1 && selected.module === BLANK_MODULE ? selected.id : undefined;

  /** The profile's own theme, scoped to the canvas (the chrome keeps the dashboard's). */
  const ownTheme = profile.theme !== undefined || profile.radius !== undefined;
  const canvasTheme = ownTheme ? resolveTheme(config, profile) : null;
  const themeScope = canvasTheme ? (themeVars(canvasTheme.tokens, canvasTheme.radius) as CSSProperties) : undefined;

  const inspectorAside = (
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
      onEditCanvas={setEditingCanvas}
      onEditGauge={(zoneId) => openGauge({ kind: "widget", zoneId })}
    />
  );

  const leftPanelEl = (
    <DesignLeftPanel
      tab={ui.leftTab}
      onTab={ui.setLeftTab}
      width={ui.leftWidth}
      onResize={ui.setLeftWidth}
      insert={{
        grid: profile,
        savedPanels: config.panelPresets,
        onAddModule: edit.addPlacement,
        onAddPreset: edit.addPanelPreset,
        onRenamePreset: edit.renameSavedPanel,
        onDeletePreset: edit.deleteSavedPanel,
        blankZoneId,
        onFillBlank: edit.fillBlank,
        onImportCanvas: () => io.openImport("zone"),
        profileName: profile.name,
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
  );

  const alertsEl = showAlerts && (
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
  );

  const screensEl = showScreens && (
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
      onAddProfile={edit.addProfile}
      onImportProfile={edit.addImportedProfile}
      onDuplicateProfile={edit.duplicateProfile}
      onRemoveProfile={edit.removeProfile}
    />
  );

  const settingsEl = showSettings && (
    <SettingsView
      tab={ui.settingsTab}
      onTab={ui.setSettingsTab}
      appSection={ui.settingsSection}
      seq={ui.navRequest?.seq ?? 0}
      dashboard={{
        config,
        screen: storedProfile,
        setConfig,
        onExport: () => exportConfigFile(config, toast),
        onReset: () => setConfig(defaultConfig()),
        navigateTo: ui.navigateTo,
      }}
      studio={{
        fitting: ui.fitting,
        zoom: ui.zoom,
        onFit: ui.fitZoom,
        onZoom: ui.setZoom,
        showGrid: ui.showGrid,
        onShowGrid: ui.setShowGrid,
        showRulers: ui.showRulers,
        onShowRulers: ui.setShowRulers,
        leftWidth: ui.leftWidth,
        onLeftWidth: ui.setLeftWidth,
      }}
    />
  );

  const statusBar = useStatusBar(control, offline ? "offline" : pushPending ? "unsaved" : "saved");

  const canvasEl = showSources ? (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background/40">
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
    </div>
  ) : (
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
      }}
      onOpenSettings={(id) => (isCanvasZone(id) ? setEditingCanvas(id) : studioLayout.showInspector())}
      inset={studioLayout.layout.inset}
      selectedWidgetId={selectedWidgetId}
      onSelectWidget={sel.selectWidget}
      onDrawZone={edit.addDrawnZone}
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
      onContextMenu={menus.open}
      onOpenAdd={() => ui.openDrawer("add")}
      onUseSample={() => runCommand({ type: "sample-layout" })}
      islandAlerts={islandTestAlerts}
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
      insetRight={inspectorMode === "floating" && floatOpen ? 344 : 0}
      onOpenSection={(section, key) => {
        studioLayout.showInspector();
        ui.jumpInspector(section, key);
      }}
    />
  );

  // The kiosks' rotation as the page tabs' chip and Live's toggle read it: the runtime state, else the saved setting.
  const rotateEntry = control?.profiles[storedProfile.id];
  const rotating = (rotateEntry?.rotating ?? storedProfile.rotate?.enabled === true) && storedProfile.pages.length >= 2;

  // The page tabs sit above the canvas in Design mode.
  const mainEl = showSources ? (
    canvasEl
  ) : (
    <>
      <PageTabs
        leftOpen={ui.leftOpen}
        onToggleLeft={ui.toggleLeft}
        pages={storedProfile.pages}
        current={profile.pageId ?? storedProfile.pages[0].id}
        onSelect={onPageChange}
        onAdd={edit.addNewPage}
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
      />
      {/* The quick bar floats over the canvas only, below the page tabs. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {canvasEl}
        {quickBar}
      </div>
    </>
  );

  const canvasEditor = canvasZone?.canvas && (
    <Suspense fallback={<div className="flex-1 bg-ui-app" />}>
      <CanvasEditorView
        key={`${canvasZone.id}:${editorEpoch}`}
        hidden={showLibrary}
        profileId={storedProfile.id}
        zone={{ ...canvasZone, canvas: canvasZone.canvas }}
        setConfig={setConfig}
        history={history}
        initialSelection={canvasSelection}
        onEditGauge={(path) => openGauge({ kind: "canvas", zoneId: canvasZone.id, path })}
        onDone={() => {
          setEditingCanvas(null);
          setCanvasSelection(undefined);
        }}
      />
    </Suspense>
  );

  /** Where a library copy went: "ARCv2 › Page 1 › Background". */
  const copyLabel = (c: LibraryCopy) => {
    const p = config.profiles.find((x) => x.id === c.profileId);
    if (!p) return c.label ?? "A removed profile";
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
  const libraryEl = showLibrary && (
    <Suspense fallback={<div className="flex-1 bg-ui-app" />}>
      <LibraryPage
        bridge={libraryBridge}
        request={ui.libraryRequest}
        gaugeInitial={gaugeToOpen}
        onGaugeOpened={() => setGaugeToOpen(null)}
        onOpenTheme={() => ui.navigateTo({ view: "theme" })}
        onShowCanvas={() => ui.setMode("design")}
        theme={resolveTheme(config, profile).tokens}
        profileName={storedProfile.name}
        onImport={(source) => io.openImport("new", source)}
        onOpenGauge={(itemId) => openGauge({ kind: "library", itemId })}
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
    />
  );

  const bar = fullPage || canvasEditor ? null : (
    <>
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
      bottom={
        inspectorMode === "sheet"
          ? Math.min(studioLayout.sheet.height, sheetHeight("half", studioLayout.sheet.area, true)) + 8
          : undefined
      }
    />
    </>
  );

  return (
    <div className="studio-root flex h-screen flex-col overflow-hidden bg-ui-app font-ui text-ui-1">
      <ProfileShots
        profiles={config.profiles}
        dashboard={config}
        editedId={storedProfile.id}
        canvasIsFirstPage={(profile.pageId ?? storedProfile.pages[0].id) === storedProfile.pages[0].id}
        scrollRef={ui.scrollRef}
        zoom={ui.zoom}
        pushPending={pushPending}
      />
      <StudioTopBar
        profiles={config.profiles}
        profile={storedProfile}
        pageId={profile.pageId ?? storedProfile.pages[0].id}
        onSelectScreen={(profileId, pageId) => {
          selectProfile(profileId);
          onPageChange(pageId);
        }}
        onManageScreens={() => ui.navigateTo({ view: "screens" })}
        liveOpen={ui.liveOpen}
        onLiveOpenChange={ui.setLiveOpen}
        kiosks={kiosksOf(control)}
        rotate={{
          entry: rotateEntry,
          saved: storedProfile.rotate?.enabled === true,
          canRotate: storedProfile.pages.length >= 2,
          onToggle: () => void postControl("rotate", { profile: storedProfile.id, state: "toggle" }),
          onSaved: () => void postControl("rotate", { profile: storedProfile.id, state: "saved" }),
        }}
        onExitStudio={onExitStudio}
        saved={ui.saved}
        unsaved={pushPending}
        onSave={ui.handleSave}
        onExport={() => exportConfigFile(config, toast)}
        onImport={() => startConfigImport(ui.importRef.current, setConfig, toast)}
        onImportInfoPanel={() => io.openImport("new")}
        onExportInfoPanel={io.openExport}
        canExportInfoPanel={io.canExport}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        onUndo={history.undo}
        onRedo={history.redo}
        onPalette={() => ui.setPaletteOpen(true)}
        onShortcuts={() => ui.setShortcutsOpen(true)}
      />
      <StudioShell
        layout={studioLayout}
        rail={
          <LeftRail
            active={
              showSources
                ? "data"
                : showLibrary
                  ? "library"
                  : showTheme
                    ? "theme"
                    : showAlerts
                      ? "alerts"
                      : showSettings
                        ? "settings"
                        : showScreens
                          ? null
                          : "design"
            }
            onSelect={ui.onRail}
            onHelp={() => void openHelp(helpTarget()).catch(() => {})}
            narrow={narrowRail}
          />
        }
        railWidth={railWidth(windowWidth)}
        drawer={!fullPage && !canvasEditor && ui.leftOpen && leftPanelEl}
        main={alertsEl || screensEl || settingsEl || themeEl || (
          <>
            {libraryEl}
            {canvasEditor ? (
              // Mounted but hidden while the Library shows, so its selection and undo survive the visit.
              <div hidden={showLibrary} inert={showLibrary} className={cn("min-h-0 min-w-0 flex-1 flex-col", showLibrary ? "hidden" : "flex")}>
                {canvasEditor}
              </div>
            ) : (
              !libraryEl && mainEl
            )}
          </>
        )}
        bar={bar}
        inspector={fullPage || canvasEditor ? null : inspectorAside}
      />
      <StatusBar {...statusBar} onNavigate={ui.navigateTo} onOpenLive={() => ui.setLiveOpen(true)} />

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
      {io.dialogs}
      <input
        ref={ui.importRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) importConfigFile(file, setConfig, toast);
          e.target.value = "";
        }}
      />
    </div>
  );
}

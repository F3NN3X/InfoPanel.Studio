import { useEffect, useMemo, useState, type CSSProperties, type Dispatch, type SetStateAction } from "react";
import { useConfigHistory } from "@/hooks/use-config-history";
import { ToastProvider } from "@/components/ui/toast";
import { SourcesPanel } from "./sources-panel";
import {
  BLANK_MODULE,
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
import { useDocumentProps } from "./use-document-props";
import { StudioCanvas } from "./studio-canvas";
import { StudioTopBar } from "./studio-top-bar";
import { LeftRail } from "./left-rail";
import { StudioDrawer } from "./studio-drawers";
import { StudioInspector } from "./studio-inspector";
import { StudioShell } from "./studio-shell";
import { QuickBar } from "./quick-bar";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { useInfoPanelIo } from "./infopanel-io";
import { useStudioCommands } from "./use-studio-commands";
import { useStudioMutations } from "./use-studio-mutations";
import { useStudioSelection } from "./use-studio-selection";
import { useInspectorFollowsSelection, useStudioUi } from "./use-studio-ui";
import { SelectionChip } from "./selection-chip";
import { StudioContextMenu, useContextMenu } from "./zone-context-menu";
import { widgetName } from "./widget-kinds";
import { WidgetPickerDialog } from "./widget-picker-dialog";
import { postControl, useControl } from "@/lib/control";
import { isIslandAlert } from "@/lib/island/from-alerts";
import { visibleAlerts } from "@/components/alerts/alert-model";
import { PageTabs } from "./page-tabs";
import { islandSectionId } from "./island-panel-model";
import { ISLAND_SETTING } from "@/lib/island/sources";
import { modules } from "@/modules";
import { ZoomToolbar } from "./zoom-toolbar";
import { sheetHeight } from "./studio-layout";

interface StudioViewProps {
  config: DashboardConfig;
  /** The resolved (active) grid profile being edited, on the page the studio shows. */
  profile: ProfileView;
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
}

/**
 * The studio: a top bar (profile, Design | Sources, undo/redo, save, "⋯"
 * config actions), left icon rail + drawer (add, layers, profiles), a
 * center grid canvas where zones are drawn, selected (Shift / Ctrl-click
 * for several), moved and resized (biome-style, no overlap) with a
 * toolbar on the primary zone, and a right panel (zone inspector, or the
 * theme editor). Every edit goes through the undo history; keyboard
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
  onPageChange,
  setConfig: setConfigState,
  windowWidth,
  windowHeight,
  onExitStudio,
  onSave,
  pushPending,
}: StudioViewProps) {
  const history = useConfigHistory(config, setConfigState);
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
  const ui = useStudioUi(config, profile, onSave);
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
  });
  const { props: documentProps, setScopeStyle, appearancePresets } = useDocumentProps(
    config,
    profile,
    setConfig,
    edit.updateProfile
  );
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
  });
  /** Sensor names for widget names (toolbar crumb, palette). */
  const catalog = useSensorCatalog();
  const dataPoints = useMemo(() => buildDataModel(catalog.sources, catalog.sensors).points, [catalog.sources, catalog.sensors]);
  const { studioLayout, showSources, drawer } = ui;
  /** The data point the inspector's Bound data row opened in Sources mode. */
  const [focusPointKey, setFocusPointKey] = useState<string>();
  useEffect(() => {
    if (!showSources) setFocusPointKey(undefined);
  }, [showSources]);

  /** Switch profile (or Auto): the selection resets with the profile; the zoom returns to fit. */
  const activateProfile = (id: string) => {
    edit.activateProfile(id);
    ui.fitZoom();
  };
  /** The zoom bar's resolution button and a profile's "Size, grid and spacing…": Dashboard › Profile. */
  const openProfileSettings = () => {
    ui.setMode("design");
    sel.select(null);
    ui.openDocumentTab("profile");
  };
  /**
   * The island drawer's widget rows: select the zone and scroll the inspector to "Send to island". A zone
   * on another page waits for the page switch (it clears the selection) before it is selected.
   */
  const [pendingZone, setPendingZone] = useState<string | null>(null);
  const openZone = (pageId: string, zoneId: string) => {
    if (pageId !== (profile.pageId ?? storedProfile.pages[0].id)) onPageChange(pageId);
    setPendingZone(zoneId);
  };
  useEffect(() => {
    if (!pendingZone || !profile.placements.some((p) => p.id === pendingZone)) return;
    setPendingZone(null);
    focusZone(pendingZone);
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
      setPendingZone(zoneId);
    },
  });
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
      documentProps={documentProps}
      setScopeStyle={setScopeStyle}
      onOpenPoint={(key) => {
        setFocusPointKey(key);
        ui.setMode("sources");
      }}
    />
  );

  const drawerEl = drawer && (
    <StudioDrawer
      drawer={drawer}
      width={ui.drawerWidth}
      onResize={ui.setDrawerWidth}
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
        onAdd: () => ui.setDrawer("add"),
      }}
      profiles={{
        profiles: config.profiles,
        activeProfile: config.activeProfile,
        profile: storedProfile,
        autoProfileId: resolveProfile({ ...config, activeProfile: "auto" }, windowWidth, windowHeight).id,
        onActivate: activateProfile,
        onAddProfile: edit.addProfile,
        onRemoveProfile: edit.removeProfile,
        onProfileChange: (patch) =>
          edit.updateProfile((p) => ({ ...p, ...patch }), `profile:${Object.keys(patch).join()}`),
        onOpenSettings: openProfileSettings,
      }}
      alerts={{
        config,
        setConfig,
        active: control?.alerts ?? [],
        points: dataPoints,
        current: { profile: storedProfile.id, page: profile.pageId ?? storedProfile.pages[0].id },
        pushPending,
        editingId: ui.alertRule,
        onEdit: ui.setAlertRule,
        onOpenSources: () => ui.setMode("sources"),
      }}
      island={{
        config,
        setConfig,
        profile: storedProfile,
        onOpenZone: openZone,
        onOpenRule: (id) => {
          ui.setAlertRule(id);
          ui.setDrawer("alerts");
        },
        onOpenExplorer: () => ui.setMode("sources"),
      }}
    />
  );

  const canvasEl = showSources ? (
    <div className="min-h-0 flex-1 overflow-hidden bg-background/40">
      <SourcesPanel
        config={config}
        setConfig={setConfig}
        profile={profile}
        focusPointKey={focusPointKey}
        selectedZoneId={sel.primaryId}
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
          ui.setInspectorChanged(false);
        }
        sel.select(id, how);
      }}
      onOpenSettings={studioLayout.showInspector}
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
      dropSizeOf={edit.dropSizeOf}
      onDropItem={edit.dropItem}
      onContextMenu={menus.open}
      onOpenAdd={() => ui.setDrawer("add")}
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
    />
  );

  // The page tabs sit above the canvas in Design mode.
  const mainEl = showSources ? (
    canvasEl
  ) : (
    <>
      <PageTabs
        pages={storedProfile.pages}
        current={profile.pageId ?? storedProfile.pages[0].id}
        onSelect={onPageChange}
        onAdd={edit.addNewPage}
        onRename={edit.renamePageTo}
        onMove={edit.movePageTo}
        onDuplicate={edit.duplicateCurrentPage}
        onDelete={edit.deletePage}
        onIcon={edit.setIconOfPage}
        renamingId={ui.renamingPage}
        onRenamingChange={ui.setRenamingPage}
        deletingId={ui.deletingPage}
        onDeletingChange={ui.setDeletingPage}
        kioskPage={control?.profiles[storedProfile.id]?.page}
        onShowOnKiosk={(page) => void postControl("page", { profile: storedProfile.id, page })}
        rotate={{
          entry: control?.profiles[storedProfile.id],
          saved: storedProfile.rotate?.enabled === true,
          onToggle: () => void postControl("rotate", { profile: storedProfile.id, state: "toggle" }),
          onSaved: () => void postControl("rotate", { profile: storedProfile.id, state: "saved" }),
        }}
      />
      {/* The quick bar floats over the canvas only, below the page tabs. */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {canvasEl}
        {quickBar}
      </div>
    </>
  );

  const bar = showSources ? null : (
    <>
    <ZoomToolbar
      zoom={ui.zoom}
      fitting={ui.fitting}
      onToggleLeft={ui.toggleLeft}
      showGrid={ui.showGrid}
      onToggleGrid={() => ui.setShowGrid((s) => !s)}
      showRulers={ui.showRulers}
      onToggleRulers={() => ui.setShowRulers((s) => !s)}
      onZoomStep={ui.zoomStep}
      onFit={ui.fitZoom}
      profile={profile}
      onOpenProfile={openProfileSettings}
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
      <StudioTopBar
        profiles={config.profiles}
        activeProfile={config.activeProfile}
        profile={storedProfile}
        onActivate={activateProfile}
        onOpenProfiles={() => {
          ui.setMode("design");
          ui.setDrawer("profiles");
        }}
        mode={ui.mode}
        onMode={ui.setMode}
        saved={ui.saved}
        unsaved={pushPending}
        onSave={ui.handleSave}
        onExitStudio={onExitStudio}
        onExport={() => exportConfigFile(config)}
        onImport={() => startConfigImport(ui.importRef.current, setConfig)}
        onImportInfoPanel={() => io.openImport("new")}
        onExportInfoPanel={io.openExport}
        canExportInfoPanel={io.canExport}
        onReset={() => setConfig(defaultConfig())}
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
            active={showSources ? "sources" : drawer}
            onSelect={ui.onRail}
            onShortcuts={() => ui.setShortcutsOpen(true)}
          />
        }
        drawer={!showSources && drawer && drawerEl}
        main={mainEl}
        bar={bar}
        inspector={showSources ? null : inspectorAside}
      />

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
      <ShortcutsDialog open={ui.shortcutsOpen} onOpenChange={ui.setShortcutsOpen} />
      {io.dialogs}
      <input
        ref={ui.importRef}
        type="file"
        accept="application/json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) importConfigFile(file, setConfig);
          e.target.value = "";
        }}
      />
    </div>
  );
}

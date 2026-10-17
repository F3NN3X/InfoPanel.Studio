import { useEffect, useRef, useState } from "react";
import type { DashboardConfig, ProfileView, Widget } from "@/lib/layout";
import type { InspectorTab, ModuleSettings } from "@/modules/types";
import { useToast } from "@/components/ui/toast";
import { useStoredDrawer, useStoredDrawerWidth, type Drawer, type RailItem } from "./left-rail";
import { revealWidgetEditor, scrollInspectorToTop } from "./inspector-scroll";
import { useCanvasZoom } from "./use-canvas-zoom";
import { useQuickBarPref } from "./inspector/inspector-prefs";
import { useStoredFlag } from "./use-stored-flag";
import type { StudioMode } from "./studio-top-bar";
import { RAIL_WIDTH, pageSize, useStudioLayout } from "./use-studio-layout";

/**
 * The studio's view state, apart from the selection: Design | Sources,
 * the rail drawer, the dock layout and zoom, toggles (grid and rulers are
 * remembered), open dialogs, the
 * inspector's search and jump target, and the session clipboards.
 */
export function useStudioUi(config: DashboardConfig, profile: ProfileView, onSave: (config: DashboardConfig) => Promise<boolean>) {
  const toast = useToast();
  const [mode, setMode] = useState<StudioMode>("design");
  const showSources = mode === "sources";
  const showLibrary = mode === "library";
  /** Sources or Library: a full page in place of the canvas, drawer and inspector. */
  const fullPage = mode !== "design";
  const toggleSources = () => setMode((m) => (m === "sources" ? "design" : "sources"));
  const [drawer, setDrawer] = useStoredDrawer();
  const [drawerWidth, setDrawerWidth] = useStoredDrawerWidth();
  const [showGrid, setShowGrid] = useStoredFlag("studio.grid", true);
  const [showRulers, setShowRulers] = useStoredFlag("studio.rulers", true);
  /** The panel the rail last had open, for the zoom bar's left-panel toggle. */
  const lastDrawer = useRef<Drawer>(drawer ?? "add");
  if (drawer) lastDrawer.current = drawer;

  /** A request to scroll the zone inspector to a card (`seq` makes repeats count). */
  const [inspectorJump, setInspectorJump] = useState<{ id: string; key?: string; seq: number }>();
  const jumpInspector = (id: string, key?: string) => {
    expandDock();
    setInspectorJump((j) => ({ id, key, seq: (j?.seq ?? 0) + 1 }));
  };
  /**
   * A request to show a zone inspector tab. `picker` also opens the Data tab's bind picker;
   * `seq` makes repeats count.
   */
  const [inspectorRequest, setInspectorRequest] = useState<{
    tab: InspectorTab;
    picker: boolean;
    seq: number;
  }>();
  const requestInspectorTab = (tab: InspectorTab, picker = false) => {
    expandDock();
    setInspectorRequest((r) => ({ tab, picker, seq: (r?.seq ?? 0) + 1 }));
  };
  /** A request for a Dashboard inspector tab (`seq` makes repeats count): the inspector shows it while nothing is selected. */
  const [documentTabRequest, setDocumentTabRequest] = useState<{ tab: string; seq: number }>();
  const openDocumentTab = (tab: string) => {
    expandDock();
    setDocumentTabRequest((r) => ({ tab, seq: (r?.seq ?? 0) + 1 }));
  };
  /** A request for an inspector tab or section brings a collapsed inspector (dock or side column) back first. */
  function expandDock() {
    studioLayout.showInspector();
  }
  /** The zone inspector's settings search ("Go to setting" fills it). */
  const [inspectorQuery, setInspectorQuery] = useState("");
  /** The inspector's Changed filter (only values set here). */
  const [inspectorChanged, setInspectorChanged] = useState(false);
  const inspectorRef = useRef<HTMLElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  /** The zone the widget picker dialog is open for. */
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  /** The page tab being renamed inline, and the page its delete confirm is open for. */
  const [renamingPage, setRenamingPage] = useState<string | null>(null);
  const [deletingPage, setDeletingPage] = useState<string | null>(null);
  /** The panel inspector's "Save as panel preset" name input is open. */
  const [presetNaming, setPresetNaming] = useState(false);
  /** The alert rule open in the Alerts drawer's editor (null = the rules list). */
  const [alertRule, setAlertRule] = useState<string | null>(null);

  /** The style copied with "Copy" in the inspector (session only). */
  const [styleClipboard, setStyleClipboard] = useState<ModuleSettings | null>(null);
  /** The panel widget copied with "Copy" in the layers list (session only). */
  const [widgetClipboard, setWidgetClipboard] = useState<Widget | null>(null);

  const page = pageSize(profile);
  const [quickBar] = useQuickBarPref();
  const studioLayout = useStudioLayout({
    page,
    rail: RAIL_WIDTH,
    drawer: !fullPage && drawer ? drawerWidth : 0,
    quickBar: quickBar && !fullPage,
  });
  const zoom = useCanvasZoom(page, studioLayout.layout.inset);

  const [saved, setSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    []
  );
  /** Flush to the server; "Saved" shows only when it took the config, else the dot stays and a toast says so. */
  const handleSave = () => {
    void onSave(config).then((ok) => {
      if (!mounted.current) return;
      if (!ok) return toast("Couldn't save to the server — try again");
      setSaved(true);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => setSaved(false), 1500);
    });
  };

  /**
   * Rail click: Sources toggles the full-width sources mode (the panel
   * stays remembered underneath); a panel icon opens that panel, or
   * collapses it when it is already open.
   */
  const onRail = (item: RailItem) => {
    if (item === "sources") {
      toggleSources();
      return;
    }
    if (item === "library") {
      setMode((m) => (m === "library" ? "design" : "library"));
      return;
    }
    if (fullPage) {
      setMode("design");
      setDrawer(item);
      return;
    }
    setDrawer(drawer === item ? null : item);
  };

  /** The zoom bar's left-panel toggle: close the panel, or reopen the last one. */
  const toggleLeft = () => {
    if (fullPage) setMode("design");
    setDrawer(drawer && !fullPage ? null : lastDrawer.current);
  };

  const revealEditor = () => revealWidgetEditor(inspectorRef.current);

  return {
    mode,
    setMode,
    showSources,
    showLibrary,
    fullPage,
    toggleSources,
    drawer,
    setDrawer,
    drawerWidth,
    setDrawerWidth,
    onRail,
    toggleLeft,
    showGrid,
    setShowGrid,
    showRulers,
    setShowRulers,
    documentTabRequest,
    openDocumentTab,
    inspectorJump,
    jumpInspector,
    inspectorRequest,
    requestInspectorTab,
    inspectorQuery,
    setInspectorQuery,
    inspectorChanged,
    setInspectorChanged,
    inspectorRef,
    importRef,
    revealEditor,
    pickerFor,
    setPickerFor,
    paletteOpen,
    setPaletteOpen,
    shortcutsOpen,
    setShortcutsOpen,
    renamingPage,
    setRenamingPage,
    deletingPage,
    setDeletingPage,
    presetNaming,
    setPresetNaming,
    alertRule,
    setAlertRule,
    styleClipboard,
    setStyleClipboard,
    widgetClipboard,
    setWidgetClipboard,
    ...zoom,
    studioLayout,
    quickBar,
    saved,
    handleSave,
  };
}

export type StudioUi = ReturnType<typeof useStudioUi>;

/**
 * The inspector follows the selection: a new primary zone starts it at
 * the top (no preset name input) and brings a collapsed docked inspector back
 * (clearing it closes the floating one); a
 * newly selected panel widget brings its editor into view.
 */
export function useInspectorFollowsSelection(
  ui: StudioUi,
  primaryId: string | null,
  selectedWidgetId: string | null
) {
  useEffect(() => {
    scrollInspectorToTop(ui.inspectorRef.current);
    ui.setPresetNaming(false);
  }, [primaryId]);

  // A selection brings a collapsed docked inspector back; clearing it puts the floating one or the sheet away.
  const lastPrimary = useRef(primaryId);
  useEffect(() => {
    ui.studioLayout.setHasSelection(primaryId !== null);
    if (primaryId !== null && ui.studioLayout.mode === "docked") ui.studioLayout.showInspector();
    // Clearing the selection closes the floating inspector, returns the sheet to its peek and drops the search and the Changed filter.
    if (primaryId === null && lastPrimary.current !== null) {
      ui.studioLayout.dismissInspector();
      ui.setInspectorQuery("");
      ui.setInspectorChanged(false);
    }
    lastPrimary.current = primaryId;
  }, [primaryId]);

  useEffect(() => {
    if (selectedWidgetId !== null) ui.revealEditor();
  }, [selectedWidgetId]);
}

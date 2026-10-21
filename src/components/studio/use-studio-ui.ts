import { useEffect, useRef, useState } from "react";
import { openSettings } from "@/lib/desktop";
import { onStudioMessage } from "@/lib/studio-channel";
import type { DashboardConfig, ProfileView, Widget } from "@/lib/layout";
import type { InspectorTab, ModuleSettings } from "@/modules/types";
import { useToast } from "@/components/ui/toast";
import type { Drawer } from "./commands";
import { useStoredLeftWidth, type LeftTab } from "./design-left-panel";
import { COLLECTIONS, type CollectionId } from "@/lib/my-library/model";
import type { AlertsTab } from "./alerts-view";
import type { RailItem } from "./left-rail";
import { revealWidgetEditor, scrollInspectorToTop } from "./inspector-scroll";
import { useCanvasZoom } from "./use-canvas-zoom";
import { useQuickBarPref } from "./inspector/inspector-prefs";
import { GRID_KEY, RULERS_KEY, useStoredFlag } from "./use-stored-flag";
import type { StudioMode } from "./studio-top-bar";
import { settingsPageOf, useNavFocus, type NavRequest, type NavTarget } from "./studio-nav";
import type { ThemeScope } from "./theme-editor-model";
import { pageSize, railWidth, useStudioLayout } from "./use-studio-layout";

const ALERTS_TABS: readonly AlertsTab[] = ["rules", "island", "defaults", "history"];

/**
 * The studio's view state, apart from the selection: the open view (the
 * rail's, plus Screens), Design's left panel, the dock layout and zoom,
 * toggles (grid and rulers are remembered), open dialogs, the Live popover,
 * the inspector's search and jump target, and the session clipboards.
 */
export function useStudioUi(
  config: DashboardConfig,
  profile: ProfileView,
  onSave: (config: DashboardConfig) => Promise<boolean>,
  windowWidth: number
) {
  const toast = useToast();
  const [mode, setMode] = useState<StudioMode>("design");
  const showSources = mode === "sources";
  const showLibrary = mode === "library";
  const showGauges = mode === "gauges";
  const showTheme = mode === "theme";
  const showAlerts = mode === "alerts";
  const showScreens = mode === "screens";
  /** Theme's scope (Screen until the scope bar or a link picks another). */
  const [themeScope, setThemeScope] = useState<ThemeScope>({ kind: "profile" });
  /**
   * The screen and page Theme's scope bar shows, when picked there or by a link; unset = the Design selection
   * (SPEC §7.1). A page scope names its own page.
   */
  const [themeProfileId, setThemeProfileId] = useState<string>();
  const [themePageId, setThemePageId] = useState<string>();
  /** The saved Theme Theme is editing in place (the Library's "Edit in Theme"); it ends when Theme is left. */
  const [themeEditing, setThemeEditing] = useState<string>();
  useEffect(() => {
    if (mode !== "theme") setThemeEditing(undefined);
  }, [mode]);
  /** Open Theme at a scope, of a screen and page (unset = the ones in Design; a page scope names its page). */
  const openTheme = (scope: ThemeScope, profileId?: string, pageId?: string) => {
    setThemeScope(scope);
    setThemeProfileId(profileId);
    setThemePageId(scope.kind === "page" ? scope.pageId : pageId);
    setMode("theme");
  };
  /** The rail's Theme: the scope kind it was left at, on the screen and page selected in Design. */
  const openThemeView = () =>
    openTheme(themeScope.kind === "page" ? (profile.pageId ? { kind: "page", pageId: profile.pageId } : { kind: "profile" }) : themeScope);
  /** Every view but Design: a full page in place of the canvas, left panel and inspector. */
  const fullPage = mode !== "design";
  /** Design's left panel: open from 1280 px (SPEC §3.5), and its tab. */
  const [leftOpen, setLeftOpen] = useState(() => windowWidth >= 1280);
  const [leftTab, setLeftTab] = useState<LeftTab>("add");
  const [leftWidth, setLeftWidth] = useStoredLeftWidth();
  /** Alerts & Island's tab. */
  const [alertsTab, setAlertsTab] = useState<AlertsTab>("rules");
  /** A link to a Library collection (`seq` makes a repeat count); the Library page reads it when it mounts or it changes. */
  const [libraryRequest, setLibraryRequest] = useState<{ collection: CollectionId; seq: number }>();
  const openLibrary = (collection: CollectionId) => {
    setLibraryRequest((r) => ({ collection, seq: (r?.seq ?? 0) + 1 }));
    setMode("library");
  };
  /** A link to Screens named a screen to select (the studio selects it: `selectProfile` needs the fit zoom). */
  const [screenRequest, setScreenRequest] = useState<{ id: string; seq: number }>();
  /** The Live popover (the title bar's button and the status bar's Kiosks item). */
  const [liveOpen, setLiveOpen] = useState(false);
  const [showGrid, setShowGrid] = useStoredFlag(GRID_KEY, true);
  const [showRulers, setShowRulers] = useStoredFlag(RULERS_KEY, true);
  /** A request to scroll the zone inspector to a card (`seq` makes repeats count). */
  const [inspectorJump, setInspectorJump] = useState<{ id: string; key?: string; seq: number }>();
  const jumpInspector = (id: string, key?: string) => {
    expandDock();
    jumpTheme(id, key);
  };
  /** The same jump for Studio › Theme, which has its own inspector: the Design dock is left as it is. */
  const jumpTheme = (id: string, key?: string) => setInspectorJump((j) => ({ id, key, seq: (j?.seq ?? 0) + 1 }));
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
  /** The page whose icon picker is open (the page tabs' menu and the Page inspector). */
  const [iconPage, setIconPage] = useState<string | null>(null);
  /** A request for an inspector tab or section brings a collapsed inspector (dock or side column) back first. */
  function expandDock() {
    studioLayout.showInspector();
  }
  /** The zone inspector's settings search ("Go to setting" fills it). */
  const [inspectorQuery, setInspectorQuery] = useState("");
  const inspectorRef = useRef<HTMLElement>(null);

  /** The zone the widget picker dialog is open for. */
  const [pickerFor, setPickerFor] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  /** The page tab being renamed inline, and the page its delete confirm is open for. */
  const [renamingPage, setRenamingPage] = useState<string | null>(null);
  const [deletingPage, setDeletingPage] = useState<string | null>(null);
  /** The panel inspector's "Save as Panel" name input is open. */
  const [presetNaming, setPresetNaming] = useState(false);
  /** The alert rule open in the Alerts view's editor (null = the rules list). */
  const [alertRule, setAlertRule] = useState<string | null>(null);

  /** The style copied with "Copy" in the inspector (session only). */
  const [styleClipboard, setStyleClipboard] = useState<ModuleSettings | null>(null);
  /** The panel widget copied with "Copy" in the layers list (session only). */
  const [widgetClipboard, setWidgetClipboard] = useState<Widget | null>(null);

  const page = pageSize(profile);
  const [quickBar] = useQuickBarPref();
  const studioLayout = useStudioLayout({
    page,
    rail: railWidth(windowWidth),
    windowWidth,
    drawer: !fullPage && leftOpen ? leftWidth : 0,
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

  /** A rail item opens its view; Data is the Sources view, and Settings its own window. */
  const onRail = (item: RailItem) =>
    item === "theme" ? openThemeView() : item === "settings" ? navigateTo({ view: "settings" }) : setMode(item === "data" ? "sources" : item);

  /** A palette entry or link for the Design left panel: Add widget or Layers. */
  const openDrawer = (target: Drawer) => {
    setMode("design");
    setLeftTab(target);
    setLeftOpen(true);
  };

  /** The page-tab row's left-panel toggle. */
  const toggleLeft = () => setLeftOpen((open) => !open);

  const revealEditor = () => revealWidgetEditor(inspectorRef.current);

  /** The last `navigateTo` (its section and control get focus once they render). */
  const [navRequest, setNavRequest] = useState<NavRequest>();
  useNavFocus(navRequest);
  /** Open a link's home (SPEC §4.1): the view, and for Screens the screen; Settings opens its window at the page. */
  const navigateTo = (target: NavTarget) => {
    if (target.view === "settings") {
      void openSettings(settingsPageOf(target)).catch(() => {});
      return;
    }
    switch (target.view) {
      case "theme":
        if (target.themeScope) openTheme(target.themeScope, target.profileId);
        else openThemeView();
        break;
      case "library": {
        const collection = COLLECTIONS.find((c) => c.id === target.tab)?.id;
        if (collection) openLibrary(collection);
        else setMode("library");
        break;
      }
      case "gauges":
        setMode("gauges");
        break;
      case "data":
        setMode("sources");
        break;
      case "alerts":
        setAlertsTab(ALERTS_TABS.find((t) => t === target.tab) ?? "rules");
        setMode("alerts");
        break;
      case "screens":
        if (target.profileId) setScreenRequest((r) => ({ id: target.profileId!, seq: (r?.seq ?? 0) + 1 }));
        setMode("screens");
        break;
      case "design":
        setMode("design");
        break;
    }
    setNavRequest((r) => ({ target, seq: (r?.seq ?? 0) + 1 }));
  };

  // A Settings window link into the Studio ("‹screen› uses its own … Screens ↗").
  const open = useRef(navigateTo);
  open.current = navigateTo;
  useEffect(() => onStudioMessage((message) => message.type === "open" && open.current(message.target)), []);

  return {
    mode,
    setMode,
    showSources,
    showLibrary,
    showGauges,
    showTheme,
    showAlerts,
    showScreens,
    themeScope,
    themeEditing,
    setThemeEditing,
    themeProfileId,
    themePageId,
    openTheme,
    fullPage,
    leftOpen,
    leftTab,
    setLeftTab,
    leftWidth,
    setLeftWidth,
    alertsTab,
    setAlertsTab,
    libraryRequest,
    openLibrary,
    screenRequest,
    liveOpen,
    setLiveOpen,
    onRail,
    openDrawer,
    toggleLeft,
    showGrid,
    setShowGrid,
    showRulers,
    setShowRulers,
    iconPage,
    setIconPage,
    inspectorJump,
    jumpInspector,
    jumpTheme,
    inspectorRequest,
    requestInspectorTab,
    inspectorQuery,
    setInspectorQuery,
    inspectorRef,
    revealEditor,
    navigateTo,
    navRequest,
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
    // Clearing the selection closes the floating inspector, returns the sheet to its peek and drops the search.
    if (primaryId === null && lastPrimary.current !== null) {
      ui.studioLayout.dismissInspector();
      ui.setInspectorQuery("");
    }
    lastPrimary.current = primaryId;
  }, [primaryId]);

  useEffect(() => {
    if (selectedWidgetId !== null) ui.revealEditor();
  }, [selectedWidgetId]);
}

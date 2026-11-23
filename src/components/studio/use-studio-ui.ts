import { useEffect, useRef, useState } from "react";
import { openSettings } from "@/lib/desktop";
import { onStudioMessage } from "@/lib/studio-channel";
import type { DashboardConfig, ProfileView, Widget } from "@/lib/layout";
import type { InspectorTab, ModuleSettings } from "@/modules/types";
import { useToast } from "@/components/ui/toast";
import type { Drawer } from "./commands";
import type { LeftTab } from "./design-left-panel";
import { LEFT_OPEN_KEY, LEFT_PANEL_PX, LEFT_STRIP_PX, useLeftPanelWidth } from "./add-prefs";
import { COLLECTIONS, type CollectionId } from "@/lib/my-library/model";
import type { AlertsTab } from "./alerts-view";
import { revealWidgetEditor, scrollInspectorToTop } from "./inspector-scroll";
import { useCanvasZoom } from "./use-canvas-zoom";
import { GRID_KEY, RULERS_KEY, useStoredFlag } from "./use-stored-flag";
import type { StudioMode } from "./studio-top-bar";
import { settingsPageOf, useNavFocus, type NavRequest, type NavTarget, type RailItem } from "./studio-nav";
import type { ThemeScope } from "./theme-editor-model";
import { DOCKED_MIN_WIDTH } from "./studio-layout";
import { pageSize, useStudioLayout } from "./use-studio-layout";

const ALERTS_TABS: readonly AlertsTab[] = ["rules", "island", "defaults", "history"];

/** `?fixture=widgets/<state>` (dev and fixtures builds: the Widgets page's trust states, src/dev/fixtures/widgets.ts) opens on Widgets. */
const FIXTURE_VIEW: StudioMode =
  (import.meta.env.DEV || import.meta.env.VITE_DEV_FIXTURES === "1") && typeof window !== "undefined" && /^widgets\//.test(new URLSearchParams(window.location.search).get("fixture") ?? "") ? "widgets" : "screens";

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
  // The Studio opens on Screens: pick the screen and page, then design it (a Widgets dev fixture opens on Widgets).
  const [mode, setMode] = useState<StudioMode>(FIXTURE_VIEW);
  const showSources = mode === "sources";
  const showLibrary = mode === "library";
  const showWidgets = mode === "widgets";
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
  /** Whether Theme has been opened: until then the command palette applies themes to the screen in Design. */
  const [themeOpened, setThemeOpened] = useState(false);
  /** Open Theme at a scope, of a screen and page (unset = the ones in Design; a page scope names its page). */
  const openTheme = (scope: ThemeScope, profileId?: string, pageId?: string) => {
    setThemeScope(scope);
    setThemeProfileId(profileId);
    setThemePageId(scope.kind === "page" ? scope.pageId : pageId);
    setThemeOpened(true);
    setMode("theme");
  };
  /** The rail's Theme: the scope kind it was left at, on the screen and page selected in Design. */
  const openThemeView = () =>
    openTheme(themeScope.kind === "page" ? (profile.pageId ? { kind: "page", pageId: profile.pageId } : { kind: "profile" }) : themeScope);
  /** Every view but Design: a full page in place of the canvas, left panel and inspector. */
  const fullPage = mode !== "design";
  /** Design's left panel: collapsed on first open, then remembered (Phase 5), and its tab. */
  const [storedOpen, setStoredOpen] = useStoredFlag(LEFT_OPEN_KEY, false);
  // "/", Add widget, the palette and the strip's tabs open the panel for now; only its toggle changes what later sessions open with.
  const [openNow, setOpenNow] = useState(false);
  const leftOpen = storedOpen || openNow;
  const [leftTab, setLeftTab] = useState<LeftTab>("add");
  const [leftPanelWidth] = useLeftPanelWidth();
  const leftWidth = LEFT_PANEL_PX[leftPanelWidth];
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
  /** A link that lands on Screens' InfoPanel filter (the old InfoPanel view, with no profile named). */
  const [screensFilter, setScreensFilter] = useState<{ filter: "infopanel"; seq: number }>();
  /** A link that opens a screen in Edit (the old InfoPanel view naming a profile): the studio opens it as Screens' Open does. */
  const [editRequest, setEditRequest] = useState<{ id: string; seq: number }>();
  /** The Live popover (the sidebar's row, a phone's top bar, the status bar's Kiosks item). */
  const [liveOpen, setLiveOpen] = useState(false);
  /** The sidebar's Data API popover (the palette's Data › Connection opens it). */
  const [dataApiOpen, setDataApiOpen] = useState(false);
  const [showGrid, setShowGrid] = useStoredFlag(GRID_KEY, true);
  const [showRulers, setShowRulers] = useStoredFlag(RULERS_KEY, false);
  /** A request to scroll the zone inspector to a card (`seq` makes repeats count); `quiet` lights the row instead of focusing it (an undo's). */
  const [inspectorJump, setInspectorJump] = useState<{ id: string; key?: string; seq: number; quiet?: boolean }>();
  const jumpInspector = (id: string, key?: string, quiet = false) => {
    expandDock();
    jumpTheme(id, key, quiet);
  };
  /** The same jump for Studio › Theme, which has its own inspector: the Design dock is left as it is. */
  const jumpTheme = (id: string, key?: string, quiet = false) => setInspectorJump((j) => ({ id, key, quiet, seq: (j?.seq ?? 0) + 1 }));
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
  const leftStrip = windowWidth >= DOCKED_MIN_WIDTH ? LEFT_STRIP_PX : 0;
  const studioLayout = useStudioLayout({
    page,
    windowWidth,
    drawer: fullPage ? 0 : leftOpen ? leftWidth : leftStrip,
  });
  const zoom = useCanvasZoom(page, studioLayout.layout.inset);

  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );
  /** Flush to the server now (Ctrl+S, the saved state's chip); a toast says when it did not take the config. */
  const handleSave = () => {
    void onSave(config).then((ok) => {
      if (mounted.current && !ok) toast("Couldn't save to the server — try again");
    });
  };

  /** A rail item opens its view; Data is the Sources view, Settings its own window, and the old InfoPanel item is a link. */
  const onRail = (item: RailItem) =>
    item === "theme"
      ? openThemeView()
      : item === "settings" || item === "infopanel"
        ? navigateTo({ view: item })
        : setMode(item === "data" ? "sources" : item);

  /** A palette entry or link for the Design left panel: Add widget or Layers. */
  const openDrawer = (target: Drawer) => {
    setMode("design");
    setLeftTab(target);
    setOpenNow(true);
  };

  /** The left panel's toggle (its own header, the page tabs' row on a narrow window). */
  const toggleLeft = () => {
    setOpenNow(false);
    setStoredOpen(!leftOpen);
  };
  /** The closed panel's strip: open it on a tab. */
  const openLeft = (tab: LeftTab) => {
    setLeftTab(tab);
    setOpenNow(true);
  };

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
      case "widgets":
      case "gauges":
        setMode(target.view);
        break;
      // The old InfoPanel view (one-editor SPEC §4.1): a profile opens in Edit, else Screens shows the InfoPanel ones.
      case "infopanel":
        if (target.profileId) {
          setEditRequest((r) => ({ id: target.profileId!, seq: (r?.seq ?? 0) + 1 }));
          setMode("design");
        } else {
          setScreensFilter((r) => ({ filter: "infopanel", seq: (r?.seq ?? 0) + 1 }));
          setMode("screens");
        }
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
    showWidgets,
    showGauges,
    showTheme,
    showAlerts,
    showScreens,
    themeScope,
    themeOpened,
    themeProfileId,
    themePageId,
    openTheme,
    fullPage,
    leftOpen,
    openLeft,
    leftStrip,
    leftTab,
    setLeftTab,
    leftWidth,
    alertsTab,
    setAlertsTab,
    libraryRequest,
    openLibrary,
    screenRequest,
    clearScreenRequest: () => setScreenRequest(undefined),
    screensFilter,
    editRequest,
    liveOpen,
    setLiveOpen,
    dataApiOpen,
    setDataApiOpen,
    windowWidth,
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

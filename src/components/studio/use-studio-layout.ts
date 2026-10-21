import { useCallback, useEffect, useMemo, useState } from "react";
import { SCROLL_ROW_H, type ProfileView } from "@/lib/layout";
import { profileGap, profilePadding } from "@/lib/profile-grid";
import {
  computeLayout,
  inspectorMode,
  leftPanelFits,
  sheetHeight,
  type PageSize,
  type SheetSnap,
  type StudioLayout,
} from "./studio-layout";

/** localStorage key: whether the docked inspector is collapsed (the key predates the floating mode). */
const COLLAPSED_KEY = "studio.dockCollapsed";

/** Width of the inspector, docked or floating. */
export const INSPECTOR_WIDTH = 320;
/** Width of the rail: 72 px labelled, 48 px icon-only under 960 px (the left panel's width is the viewer's). */
export const railWidth = (windowWidth: number) => (windowWidth < 960 ? 48 : 72);

/**
 * The profile's page for fitting the canvas: its design size, the screen, in
 * both fit modes. A scroll page also reports the height of its grid at the
 * natural row size; the part past the screen is drawn below a fold.
 */
export function pageSize(profile: ProfileView): PageSize {
  const fill = profile.fit === "fill" && profile.height > 0;
  const gap = profileGap(profile);
  return {
    width: profile.width,
    height: profile.height > 0 ? profile.height : 0,
    naturalHeight: fill
      ? undefined
      : 2 * profilePadding(profile, true) + profile.rows * SCROLL_ROW_H + (profile.rows - 1) * gap,
  };
}

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

interface StudioLayoutOptions {
  page: PageSize;
  /** Width of the rail. */
  rail: number;
  /** Width of the open left panel. */
  drawer: number;
  /** The quick bar preference is on. */
  quickBar: boolean;
}

/**
 * The studio's layout: measures the body (below the top bar) through the
 * `bodyRef` callback ref; its width picks the inspector's mode (docked,
 * floating or a sheet). The docked inspector can be collapsed (remembered
 * per viewer); the floating one opens on demand and starts closed.
 */
export function useStudioLayout({ page, rail, drawer, quickBar }: StudioLayoutOptions) {
  const [collapsed, setCollapsedState] = useState(loadCollapsed);
  const [floatOpen, setFloatOpen] = useState(false);
  /** The bottom sheet: its snap, its height while the handle is dragged, the tool its strip shows. */
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>("peek");
  const [sheetDrag, setSheetDrag] = useState<number | null>(null);
  const [sheetTool, setSheetTool] = useState("quick");
  /** Something is selected (the sheet's peek is taller then); set by the selection effect. */
  const [hasSelection, setHasSelection] = useState(false);
  const [bodyEl, setBodyEl] = useState<HTMLDivElement | null>(null);
  const [body, setBody] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!bodyEl) return;
    const measure = () => setBody({ width: bodyEl.clientWidth, height: bodyEl.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bodyEl);
    return () => observer.disconnect();
  }, [bodyEl]);

  const setCollapsed = useCallback((next: boolean) => {
    setCollapsedState(next);
    try {
      if (next) localStorage.setItem(COLLAPSED_KEY, "1");
      else localStorage.removeItem(COLLAPSED_KEY);
    } catch {
      // Storage unavailable (private mode, quota): keep the session state.
    }
  }, []);

  const mode = inspectorMode(body.width);
  const leftOverlay = !leftPanelFits(body.width, mode, {
    rail,
    drawer,
    // A collapsed docked inspector leaves its column to the canvas.
    inspector: collapsed ? 0 : INSPECTOR_WIDTH,
  });
  const { width: pageW, height: pageH, naturalHeight } = page;
  const sheet = sheetDrag ?? sheetHeight(sheetSnap, body.height, hasSelection);
  const layout: StudioLayout = useMemo(
    () =>
      computeLayout({
        body,
        page: { width: pageW, height: pageH, naturalHeight },
        rail,
        // An overlaid left panel takes no width from the canvas.
        drawer: leftOverlay ? 0 : drawer,
        inspector: INSPECTOR_WIDTH,
        collapsed,
        floatOpen,
        quickBar,
        sheet,
      }),
    [body, pageW, pageH, naturalHeight, rail, drawer, leftOverlay, collapsed, floatOpen, quickBar, sheet]
  );

  /** The inspector is out of sight: a collapsed docked column, a closed floating card, a sheet at its peek. */
  const hidden = mode === "docked" ? collapsed : mode === "floating" ? !floatOpen : sheetSnap === "peek";
  /** Show the inspector (a request for a tab or a section, a double-click on a zone): the sheet goes to half. */
  const showInspector = useCallback(() => {
    if (mode === "docked") setCollapsed(false);
    else if (mode === "floating") setFloatOpen(true);
    else setSheetSnap((snap) => (snap === "peek" ? "half" : snap));
  }, [mode, setCollapsed]);
  /** Ctrl+\: collapse / expand the docked inspector, close / open the floating one, peek / half the sheet. */
  const toggleInspector = useCallback(() => {
    if (mode === "docked") setCollapsed(!collapsed);
    else if (mode === "floating") setFloatOpen((open) => !open);
    else setSheetSnap((snap) => (snap === "peek" ? "half" : "peek"));
  }, [mode, collapsed, setCollapsed]);
  /** Put the inspector away (an empty-canvas click): close the floating card, the sheet back to its peek. */
  const dismissInspector = useCallback(() => {
    setFloatOpen(false);
    setSheetSnap("peek");
  }, []);

  return {
    bodyRef: setBodyEl,
    body,
    layout,
    mode: layout.mode,
    /** The left panel does not fit beside the canvas: the shell lays it over the canvas. */
    leftOverlay,
    /** The docked inspector is collapsed to a strip at the window's edge. */
    collapsed,
    floatOpen,
    setFloatOpen,
    hidden,
    showInspector,
    toggleInspector,
    dismissInspector,
    sheet: {
      snap: sheetSnap,
      setSnap: setSheetSnap,
      /** The sheet's height now (the dragged one while the handle moves). */
      height: sheet,
      /** The canvas area's height (the snaps are relative to it). */
      area: body.height,
      drag: sheetDrag,
      setDrag: setSheetDrag,
      tool: sheetTool,
      setTool: setSheetTool,
      hasSelection,
    },
    setHasSelection,
  };
}

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Wrench } from "lucide-react";
import { useSensorsConnected, useSensorsTimestamp } from "@/hooks/useSensors";
import { Badge } from "@/components/ui/badge";
import { PlacementFrame } from "@/components/studio/placement-frame";
import { LivePlacement } from "@/components/studio/placement-content";
import { PageBackground } from "@/components/page-background";
import { PackStage, packBackground, usePack } from "@/looks/pack";
import { connectorZones } from "@/looks/connector-zones";
import { startKioskPull } from "@/lib/kiosk-config-pull";
import { KioskConnecting } from "@/components/ui/kiosk-connecting";
import { KioskOfflinePill } from "@/components/ui/kiosk-offline";
import { KioskWaitingForData } from "@/components/ui/kiosk-waiting";
import { AlertLayer, useShownAlerts, ZoneHighlights } from "@/components/alerts/alert-layer";
import { DynamicIsland } from "@/components/island/dynamic-island";
import { AgentPromptHost } from "@/components/agent-prompt-host";
import { pageSkinOf } from "@/components/island/island-look";
import { islandReserve, withPackEdge } from "@/components/island/island-model";
import { splitIslandAlerts } from "@/lib/island/from-alerts";
import { ISLAND_DEFAULTS } from "@/lib/island/config";
import { islandFeeds } from "@/lib/island/sources";
import { modules } from "@/modules";
import { useLoadedProfile, useWidgetPreload } from "@/widgets/preload";
import { PageDots, pageDotsStripPx } from "@/components/page-dots";
import { leadsPage, PinnedItems } from "@/components/pinned-layer";
import { isEdgePin, isGridPin, pinnedOnPage, pinnedPlacement, pinnedRoom, type TouchAction, type TouchGesture } from "@/lib/pinned";
import { RailHostContext, type RailHost } from "@/components/rail-host";
import { runTouchAction } from "@/lib/touch-actions";
import { resolveBackground } from "@/lib/appearance";
import { appearanceOf, zoneResolver } from "@/lib/style-resolve";
import { applyTheme, resolveTheme } from "@/lib/theme";
import { msUntilNextRefresh, REFRESH_JITTER_MS } from "@/lib/kiosk-refresh";
import { fontStack, formatClock, resolveFont, resolveGeneral } from "@/lib/general";
import { barRowTemplate, profileGap, profilePadding } from "@/lib/profile-grid";
import { GeneralProvider, useGeneral } from "@/hooks/use-general";
import { PageIslandProvider } from "@/hooks/use-page-island";
import { PerformanceProvider } from "@/hooks/use-performance";
import { performanceFromSearch } from "@/lib/performance";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { holdApiBase, releaseApiBase, setApiBase } from "@/lib/data-api";
import { useStudioFocusThrottle } from "@/lib/studio-focus";
import { wakeTicker } from "@/lib/ticker";
import { closeWindow, flushDone, isTauri, kioskWindow, logFrontend, onKioskLeft, onStudioFlush, openKioskPopup } from "@/lib/desktop";
import { KioskStrip } from "@/components/kiosk-strip";
import type { Fixture } from "@/dev/fixtures/types";
import { editedProfileId, readPin, writePin } from "@/components/studio/pinned-profile";
import { trackEventSource } from "@/lib/sensor-store";
import type { AdoptChange } from "@/hooks/use-config-history";
import { type SettingsPatch, withSettingsPatch } from "@/lib/settings-patch";
import { onStudioMessage } from "@/lib/studio-channel";
import { updateFrom } from "@/lib/config-update";
import {
  CONFIG_EVENTS_URL,
  fetchConfig,
  fetchSettingsPatches,
  isRemoteEditRefusal,
  isUnreachable,
  knownSettingsRev,
  NewerConfigError,
  noteSettingsRev,
  pushConfig,
} from "@/lib/dashboard-server";
import {
  hasStoredConfig,
  loadConfig,
  readConfig,
  resolveProfile,
  saveConfig,
  SCROLL_ROW_H,
  type DashboardConfig,
} from "@/lib/layout";
import { pageOf, profileWithPage } from "@/lib/pages";
import { withItemLayers } from "@/lib/page-model/items-layer";
import {
  kioskPageId,
  kioskProfileId,
  islandEffective,
  neighbourPage,
  postControl,
  useControl,
  useKioskReload,
  withControlPage,
} from "@/lib/control";
import { useKioskThemePreview } from "@/lib/theme-preview-kiosk";
import { isDisplayName } from "@/lib/screens/display-name";
import { DRAG_SETTLE_MS, dragAxis, dragSettle, startsOnPinned, swipeDirection } from "@/lib/swipe";
import { cn } from "@/lib/utils";

/** ?profile=<id> pins a profile (kiosk shortcuts, testing). */
function withPinnedProfile(config: DashboardConfig): DashboardConfig {
  const pinned = new URLSearchParams(window.location.search).get("profile");
  return pinned && config.profiles.some((p) => p.id === pinned)
    ? { ...config, activeProfile: pinned }
    : config;
}

/** ?page=<id> pins a page of the shown profile (the first page without it). */
const pagePin = new URLSearchParams(window.location.search).get("page") ?? undefined;

/** The ?profile= pin, if any: it wins over the control channel's profile. */
const profilePin = new URLSearchParams(window.location.search).get("profile");

/** ?touch=<panel id> (experimental touch): this kiosk shows that touch panel and takes its touches from Studio. */
const touchPanel = new URLSearchParams(window.location.search).get("touch");

/**
 * The ?display= name, if valid: the studio can assign this kiosk a screen by it. A touch panel's kiosk without one is
 * the display named after the panel (`panelDisplayName`, not imported: it would pull the touch words into the entry), so
 * the studio picks its screen and its link never needs a `&profile=`.
 */
const displayParam = new URLSearchParams(window.location.search).get("display");
const displayName = isDisplayName(displayParam) ? displayParam : isDisplayName(touchPanel) ? touchPanel : undefined;

const NO_ALERTS: readonly never[] = [];

/** A touch tells the server to hold auto-rotation (it holds 30 s); at most this often. */
const TOUCH_THROTTLE_MS = 5000;

// The studio is an editing tool; kiosk pages never download it.
const StudioView = lazy(() =>
  import("@/components/studio/studio-view").then((m) => ({ default: m.StudioView }))
);
/** Widgets pinned in place (config v21): loaded by a screen that has one. */
const PinnedGrid = lazy(() => import("@/components/pinned-grid"));
const ConfigUpdateDialog = lazy(() => import("@/components/studio/config-update-dialog").then((m) => ({ default: m.ConfigUpdateDialog })));
// Experimental touch: only a kiosk with ?touch= loads it.
const TouchLayer = lazy(() => import("@/components/touch-layer").then((m) => ({ default: m.TouchLayer })));
// The hold-to-confirm card and the run notes (pinned layer P7): loaded with the first action that needs one.
const ActionLayer = lazy(() => import("@/components/action-confirm"));

interface AppProps {
  /** A dev fixture (`?fixture=`, src/dev/fixtures): its config replaces the saved one, nothing is read from or saved to the server. */
  fixture?: Fixture;
}

export default function App({ fixture }: AppProps = {}) {

  // Kiosk mode (?kiosk=1, e.g. an InfoPanel web page profile): display
  // only — no header, no studio chrome, and the layout comes from the
  // server's shared config instead of this page's own storage.
  const kiosk = useMemo(
    () => new URLSearchParams(window.location.search).get("kiosk") === "1",
    []
  );

  const [config, setConfig] = useState<DashboardConfig>(() => {
    const loaded = fixture?.config ?? loadConfig();
    setApiBase(loaded.dataApiUrl); // before the first sensor connection
    // A studio reads its Data API address from the server's config: requests wait for it (released below, read or not).
    if (!fixture && !kiosk) holdApiBase();
    return withPinnedProfile(loaded);
  });
  // An animation that settled under the old settings moves again (src/lib/ticker.ts).
  useEffect(() => wakeTicker(), [config]);
  // First run (SPEC §10.5): this browser had no config when the page opened, and the server has none either.
  const [freshBrowser] = useState(() => !hasStoredConfig());
  const [serverEmpty, setServerEmpty] = useState(false);
  const [studio, setStudio] = useState(
    () => fixture !== undefined || new URLSearchParams(window.location.search).has("studio")
  );
  // The studio slows down a minute after it loses focus; a kiosk never does.
  useStudioFocusThrottle(studio && !kiosk);
  const [windowSize, setWindowSize] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));

  // The page the studio edits (view state); the kiosk shows the pinned one.
  const [studioPage, setStudioPage] = useState(fixture?.route.pageId ?? pagePin);
  // Kiosk: the control channel decides the profile (unless ?profile= pins one)
  // and the page. The stream also tells the server which profile this kiosk shows.
  const [shownId, setShownId] = useState<string>();
  const control = useControl(shownId, kiosk && shownId !== undefined, pagePin, false, displayName ? { name: displayName, pinned: !!profilePin } : undefined);
  // Kiosk: a theme the studio previews here draws over the saved config (never saved; see theme-preview-kiosk).
  const drawnConfig = useKioskThemePreview(config, kiosk ? control?.themePreview : undefined);
  // A tap or swipe switches at once; the server's state takes over when it arrives.
  const [optimistic, setOptimistic] = useState<{ profile: string; page: string } | null>(null);
  // Kiosk: studio saves pulled since load (the island's "Layout updated").
  const [layoutVersion, setLayoutVersion] = useState(0);
  useEffect(() => setOptimistic(null), [control]);
  // Studio only: the profile selected in the Profiles panel, which the studio edits (view state, never in the
  // config; stored as the old "pin"). Displays follow `config.activeProfile`; an unknown selection is ignored.
  const [pin, setPin] = useState(() => fixture?.route.profileId ?? readPin());
  const pinnedId = pin && config.profiles.some((p) => p.id === pin) ? pin : undefined;
  const pinProfile = useCallback((id: string | undefined) => {
    setPin(id);
    writePin(id);
  }, []);
  // Desktop Kiosk view: the profile the studio was editing, kept as it is (Auto doesn't re-resolve on resize).
  const [viewProfile, setViewProfile] = useState<string>();
  const forcedProfile = kiosk
    ? kioskProfileId({ pin: profilePin, control, config, display: displayName })
    : studio
      ? editedProfileId(config, pinnedId, windowSize.w, windowSize.h)
      : viewProfile;
  // Kiosk: the server's config has been asked for once. Until then the profile is the local copy's (the defaults in
  // a fresh browser), which is neither reported as shown nor rendered.
  const [kioskPulled, setKioskPulled] = useState(false);
  // A kiosk keeps its screen up until the next screen's widgets are in (`src/widgets/preload.ts`).
  const stored = useLoadedProfile(
    resolveProfile(forcedProfile ? { ...drawnConfig, activeProfile: forcedProfile } : drawnConfig, windowSize.w, windowSize.h),
    modules,
    kiosk && kioskPulled
  );
  useEffect(() => {
    if (kiosk && kioskPulled) setShownId(stored.id);
  }, [kiosk, kioskPulled, stored.id]);
  const kioskPage = kiosk
    ? kioskPageId({
        pin: pagePin,
        control: optimistic ? withControlPage(control, optimistic.profile, optimistic.page) : control,
        profile: stored,
      })
    : pagePin;
  const profile = useMemo(
    () => profileWithPage(stored, studio ? studioPage : kioskPage),
    [stored, studio, studioPage, kioskPage]
  );
  // The zones in z-order with the page's InfoPanel items (v15 item placements) drawn between them.
  const drawn = useMemo(() => withItemLayers(profile, pageOf(stored, profile.pageId), profile.placements), [profile, stored]);
  // The shown page's widget kinds load together once the profile is known; its other pages' follow when idle.
  useWidgetPreload(stored, profile.pageId, modules, !kiosk || kioskPulled);
  // The page can vanish (delete, undo, another profile): the view fell back to the first one.
  useEffect(() => {
    if (studio && profile.pageId !== studioPage) setStudioPage(profile.pageId);
  }, [studio, profile.pageId, studioPage]);
  const { shown: shownAlerts, ack: ackAlert } = useShownAlerts(control, stored.id);
  // Alerts go to the profile's island or the alert layer, one at a time (`splitIslandAlerts`).
  // The control channel can show or hide it (Stream Deck); the layout space it reserves stays either way.
  const savedIsland = profile.island?.enabled === true;
  const islandShown = kiosk ? islandEffective(control, profile) : savedIsland;
  const islandConfig = useMemo(
    () =>
      islandShown || savedIsland ? { ...(profile.island ?? { ...ISLAND_DEFAULTS, tint: "black" as const }), enabled: true } : undefined,
    [profile.island, islandShown, savedIsland]
  );
  const island = islandShown ? islandConfig : undefined;
  useKioskReload(control, stored.id, kiosk);
  const splitAlerts = useMemo(() => splitIslandAlerts(shownAlerts, island !== undefined), [shownAlerts, island]);
  // On the kiosk the island also gets the Data API warning and the widgets sent to it (every page).
  const quietHours = config.alerts?.quietHours;
  const pageName = stored.pages.find((p) => p.id === profile.pageId)?.name ?? "";
  const islandLive = useMemo(
    () =>
      kiosk && island
        ? {
            // every page's widgets and the pinned layer's: a pinned widget sent to the island feeds it too (QUESTIONS P1 6)
            feeds: islandFeeds([...stored.pages.flatMap((p) => p.placements), ...(stored.pinned?.items ?? []).map(pinnedPlacement)], modules, zoneResolver(config, stored, (z) => modules.find((m) => m.id === z.module)?.settings)),
            quietHours,
            page: pageName,
            layoutVersion,
          }
        : undefined,
    [kiosk, island, stored, config, quietHours, pageName, layoutVersion]
  );
  // The kiosk sizes the island by the window it is in; the studio by the screen's design size.
  const islandPage = useMemo(
    () => (kiosk ? { width: windowSize.w, height: windowSize.h } : { width: profile.width, height: profile.height }),
    [kiosk, windowSize.w, windowSize.h, profile.width, profile.height]
  );
  const reserve = islandReserve(islandConfig, islandPage);
  // The pinned layer (config v20): its items on this page, and the room the "make room" ones take off the page's edges.
  const pinned = useMemo(() => pinnedOnPage(stored.pinned, profile.pageId, pageOf(stored, profile.pageId).hidePinned), [stored, profile.pageId]);
  const room = pinnedRoom(pinned);
  const edgePins = useMemo(() => pinned.filter(isEdgePin), [pinned]);
  // Widgets pinned in place (config v21): on the page grid's cells, over it, outside it so a page change keeps them mounted.
  const gridPins = useMemo(() => pinned.filter(isGridPin), [pinned]);
  const pageIsland = useMemo(() => ({ island, page: islandPage }), [island, islandPage]);
  const fill = profile.fit === "fill";
  const background = resolveBackground(profile);
  const appearance = appearanceOf(drawnConfig, profile);
  // The skin the widgets of this screen wear, for an island that is part of it.
  const pageSkin = useMemo(() => pageSkinOf(appearanceOf(drawnConfig, profile)), [drawnConfig, profile]);
  // A pack Look's page layers (its stage) count as a page background.
  const pack = usePack(pageSkin.lookId);
  // The island's edge: the screen's own, else the pack's default, else the top (D21).
  const packEdge = pack?.statusBar?.edge;
  const shownIsland = useMemo(() => island && withPackEdge(island, packEdge), [island, packEdge]);
  const bottomIsland = (islandConfig?.edge ?? packEdge) === "bottom";
  // A pack that draws connectors reads the page's zones (and the kiosk then writes their ids); any other page's markup is as it was.
  const linked = !!pack?.connectors;
  const zones = useMemo(() => (linked ? connectorZones(drawn, profile) : undefined), [linked, drawn, profile]);
  // The app settings under the shown screen's page font and performance.
  const general = useMemo(() => resolveGeneral(drawnConfig, stored), [drawnConfig, stored]);
  // Max FPS and motion: the ?fps= / ?animations= / ?motion= overrides (kiosk pages) over the shown profile's.
  const perfOverride = useMemo(
    () => ({ ...stored.performance, ...(kiosk ? performanceFromSearch(window.location.search) : undefined) }),
    [stored.performance, kiosk]
  );

  // Page dots and swipe: only with the setting on, 2+ pages, and no ?page= pin.
  const pageNav =
    kiosk &&
    general.kioskPageNav &&
    stored.pages.length >= 2 &&
    kioskPageId({ pin: pagePin, control: null, profile: stored }) === undefined;
  const goToPage = (page: string) => {
    setOptimistic({ profile: stored.id, page });
    void postControl("page", { profile: stored.id, page });
  };
  const gesture = useRef<{ x: number; y: number; t: number } | null>(null);
  const lastTouch = useRef(0);
  // Drag-follow (the `swipe` fixture): on a page that fills the screen, the page moves with the finger and its neighbour
  // comes in beside it, under the still pinned layer; a release settles on the neighbour or springs back. With reduced
  // motion, or a page that scrolls, a swipe switches at once as before.
  const reducedMotion = useReducedMotion();
  const dragFollow = pageNav && fill && !reducedMotion;
  const mainEl = useRef<HTMLElement>(null);
  const gridEl = useRef<HTMLDivElement>(null);
  const peekEl = useRef<HTMLDivElement>(null);
  // `area`: the page area's left and right edges (inside the pinned items' room); `step`: its width, one page along
  const drag = useRef<{ axis: "x" | "y" | null; dx: number; side: 0 | 1 | -1; area: [number, number]; step: number; box?: DOMRect; peek?: string } | null>(null);
  const [peek, setPeek] = useState<{ page: string; side: 1 | -1; box: DOMRect; step: number } | null>(null);
  // the page a swipe brought in: it arrives in place, without the page fade
  const [swiped, setSwiped] = useState<string>();
  const peekView = useMemo(() => (peek ? profileWithPage(stored, peek.page) : undefined), [peek, stored]);
  const peekDrawn = useMemo(() => (peekView ? withItemLayers(peekView, pageOf(stored, peekView.pageId), peekView.placements) : []), [peekView, stored]);
  const slide = (dx: number, animate: boolean) => {
    const d = drag.current;
    if (!d?.box) return;
    for (const [el, at] of [
      [gridEl.current, dx],
      [peekEl.current, dx + d.side * d.step],
    ] as const) {
      if (!el) continue;
      const left = d.box.left + at;
      el.style.transition = animate ? `transform ${DRAG_SETTLE_MS}ms ease-out, clip-path ${DRAG_SETTLE_MS}ms ease-out` : "";
      el.style.transform = `translateX(${at}px)`;
      // past the page area's edges a page goes under the pinned layer, out of sight (the cards' shadows keep their room above and below)
      el.style.clipPath = `inset(-64px ${left + d.box.width - d.area[1]}px -64px ${d.area[0] - left}px)`;
    }
  };
  const settle = (dir: "next" | "prev" | null) => {
    const d = drag.current;
    if (d?.axis !== "x") return;
    const to = dir && d.peek && (dir === "next" ? 1 : -1) === d.side ? d.peek : undefined;
    slide(to ? -d.side * d.step : 0, true);
    window.setTimeout(() => {
      drag.current = null;
      if (gridEl.current) Object.assign(gridEl.current.style, { transform: "", transition: "", clipPath: "" });
      if (mainEl.current) mainEl.current.style.userSelect = "";
      setPeek(null);
      if (to) {
        setSwiped(to);
        goToPage(to);
      }
    }, DRAG_SETTLE_MS);
  };
  const onKioskPointerDown = (e: React.PointerEvent) => {
    if (!kiosk) return;
    gesture.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    // a drag that starts on the pinned layer (the rail, a grid pin that takes touch) is its own, never a page drag
    if (dragFollow && !drag.current && !startsOnPinned(e.target)) drag.current = { axis: null, dx: 0, side: 0, area: [room.left, windowSize.w - room.right], step: windowSize.w - room.left - room.right };
    const now = Date.now();
    if (control?.profiles[stored.id]?.rotating && now - lastTouch.current >= TOUCH_THROTTLE_MS) {
      lastTouch.current = now;
      void postControl("touch", { profile: stored.id });
    }
  };
  const onKioskPointerMove = (e: React.PointerEvent) => {
    const start = gesture.current;
    const d = drag.current;
    if (!start || !d || d.axis === "y") return;
    const dx = e.clientX - start.x;
    if (d.axis === null) {
      d.axis = dragAxis(dx, e.clientY - start.y);
      if (d.axis !== "x") return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      // a mouse drag selects no text on its way
      if (mainEl.current) mainEl.current.style.userSelect = "none";
      window.getSelection()?.removeAllRanges();
      // the page's box before it moves: the neighbour takes the same one
      d.box = gridEl.current?.getBoundingClientRect();
    }
    d.dx = dx;
    const side = dx < 0 ? 1 : -1;
    if (side !== d.side) {
      d.side = side;
      d.peek = neighbourPage(
        stored.pages.map((p) => p.id),
        profile.pageId ?? stored.pages[0].id,
        side
      );
      setPeek(d.peek && d.box ? { page: d.peek, side, box: d.box, step: d.step } : null);
    }
    slide(dx, false);
  };
  const onKioskPointerUp = (e: React.PointerEvent) => {
    const start = gesture.current;
    gesture.current = null;
    if (!pageNav || !start) return;
    if (drag.current?.axis === "x") {
      // the lift after a page drag is no click on what is under the finger
      const swallow = (ev: Event) => ev.stopPropagation();
      window.addEventListener("click", swallow, { capture: true, once: true });
      window.setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), DRAG_SETTLE_MS);
      return settle(dragSettle({ dx: e.clientX - start.x, ms: e.timeStamp - start.t, width: drag.current.step }));
    }
    drag.current = null;
    const dir = swipeDirection({ dx: e.clientX - start.x, dy: e.clientY - start.y, ms: e.timeStamp - start.t });
    if (!dir) return;
    const next = neighbourPage(
      stored.pages.map((p) => p.id),
      profile.pageId ?? stored.pages[0].id,
      dir === "next" ? 1 : -1
    );
    if (next) goToPage(next);
  };
  const onKioskPointerCancel = () => {
    gesture.current = null;
    if (drag.current?.axis === "x") settle(null);
    else drag.current = null;
  };
  // A touch gesture's page action: like a swipe, but not tied to the page dots setting; a ?page= pin still holds.
  const touchPage = (to: "next" | "prev") => {
    if (stored.pages.length < 2 || kioskPageId({ pin: pagePin, control: null, profile: stored }) !== undefined) return;
    const next = neighbourPage(
      stored.pages.map((p) => p.id),
      profile.pageId ?? stored.pages[0].id,
      to === "next" ? 1 : -1
    );
    if (next) goToPage(next);
  };
  // The page rail's screen (`rail-host.ts`): the pages, the page shown, the page lock, the alerts shown and the actions it runs.
  const rotateSaved = stored.rotate?.enabled === true;
  // The profile picker (P4): a kiosk only, and not one whose link or display pins its profile (the override can't move it).
  const [pickerOpen, setPickerOpen] = useState(false);
  // P7: an action waiting for its hold to confirm, and what the last command came to when it did not start
  const [confirming, setConfirming] = useState<{ action: TouchAction; go: () => void } | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const assignedScreen = control?.displays?.find((d) => d.name === displayName)?.screen;
  const switchable = kiosk && ![profilePin, assignedScreen].some((id) => id && config.profiles.some((p) => p.id === id));
  const railHost: RailHost = {
    pages: stored.pages,
    current: profile.pageId ?? stored.pages[0].id,
    profile: { id: stored.id, name: stored.name, index: config.profiles.findIndex((p) => p.id === stored.id) },
    lock: rotateSaved ? (control?.profiles[stored.id]?.rotating === false ? "locked" : "auto") : null,
    alerts: kiosk ? shownAlerts : NO_ALERTS,
    run: (a: TouchAction, g?: TouchGesture) =>
      runTouchAction(
        a,
        {
        page: (to) => (to === "next" || to === "prev" ? touchPage(to) : stored.pages.some((p) => p.id === to) && goToPage(to)),
        toggleRotate: () => void postControl("rotate", { profile: stored.id, state: "toggle" }),
        // the write routes load with their first use, so the kiosk entry carries none of them
        audio: (body) => import("@/lib/audio-control").then((m) => m.audioAct(body)),
        obs: (body) =>
          body.op === "stream"
            ? import("@/lib/action-runner").then((m) => m.obsStream(body.state).then((r) => setActionNote(m.resultNote(r))))
            : import("@/lib/obs-control").then((m) => m.obsAct(body)),
        media: (key) => import("@/lib/media-control").then((m) => m.mediaKey(key)),
        picker: switchable ? () => setPickerOpen(true) : undefined,
        // the action runner (ips-server's actions.rs): off by default, approved commands only, this PC unless remote editing is on
        run: (command) => import("@/lib/action-runner").then((m) => m.runCommand(command).then((r) => setActionNote(m.resultNote(r)))),
        confirm: (action, go) => setConfirming({ action, go }),
        },
        g === "hold"
      ),
    zone: (placement, style) => (
      <LivePlacement placement={placement} appearance={appearance}>
        {({ content, scope }) => <div style={{ ...style, ...scope }}>{content}</div>}
      </LivePlacement>
    ),
    profiles: switchable
      ? {
          open: pickerOpen,
          close: () => setPickerOpen(false),
          all: config.profiles,
          defaultId: resolveProfile(config, windowSize.w, windowSize.h).id,
          front: control?.front,
          paused: control?.autoPaused === true,
          pick: (id) => void postControl("profile", { profile: id }),
          auto: (on, lock) => void postControl("auto", { state: on ? "on" : "off", ...(lock ? { profile: lock } : {}) }),
        }
      : undefined,
  };

  // Persist the config (layout, profiles, theme) on every change.
  useEffect(() => (fixture ? undefined : saveConfig(config)), [config, fixture]);

  // Editing pages start from the server's copy: until it has been read, this
  // page's own storage (or the defaults, in a fresh browser) must not be
  // pushed over it. If the server can't be read, only Save pushes.
  const [synced, setSynced] = useState(false);
  // The one-time update of a config an older version saved (the studio's message): nothing is pushed until it is saved.
  const [update, setUpdate] = useState<{ from: number; saved: boolean }>();
  const updating = update !== undefined && !update.saved;
  const updatingRef = useRef(updating);
  updatingRef.current = updating;
  useEffect(() => {
    if (kiosk || fixture) return;
    let alive = true;
    fetchConfig()
      .then(async (server) => {
        if (!alive) return;
        if (server) {
          const log: string[] = [];
          const merged = withPinnedProfile(await readConfig(server, log));
          if (!alive) return;
          logMigration(log);
          // A config an older version saved is updated on disk once the user says so (the studio's message).
          const from = updateFrom(server);
          if (from !== undefined) setUpdate({ from, saved: false });
          // Before the render that mounts its widgets: their effects run before ours.
          setApiBase(merged.dataApiUrl);
          saveConfig(merged);
          setConfig(merged);
        } else {
          setServerEmpty(true);
        }
        setSynced(true);
      })
      .catch(() => {
        // Server offline — keep the local copy and don't auto-push.
      })
      // (a cleaned-up run leaves it to the run that replaced it)
      .finally(() => alive && releaseApiBase());
    return () => {
      alive = false;
    };
  }, [kiosk, fixture]);
  // Once the server's copy is read, a selection of a profile that is not in it is dropped.
  useEffect(() => {
    if (synced && pin && !pinnedId) pinProfile(undefined);
  }, [synced, pin, pinnedId, pinProfile]);

  // Push the full config (profiles with placements, theme) to the server.
  // Kiosk pages (InfoPanel's WebView2) keep their own isolated storage, so
  // this shared copy is how they reflect the studio's latest state.
  // `pushPending` is true from an edit until its push lands (the studio's
  // Save dot); a newer edit supersedes an older push still in flight.
  const [pushPending, setPushPending] = useState(false);
  // The last push failed because the server couldn't be reached; cleared by the next one that lands.
  const [offline, setOffline] = useState(false);
  // The newest config, to tell whether a finished push is still the latest state.
  // A newer dashboard version saved the server copy: stop pushing until a reload.
  const [refused, setRefused] = useState(false);
  // The server takes edits from its own computer only (Settings › Server): a notice shows until a push lands.
  const [readOnly, setReadOnly] = useState(false);
  const latestConfig = useRef(config);
  latestConfig.current = config;
  const pendingRef = useRef(pushPending);
  pendingRef.current = pushPending;
  const syncedRef = useRef(synced);
  syncedRef.current = synced;
  // The last config taken from the Settings window: the server holds it already.
  const adopted = useRef<DashboardConfig | null>(null);
  const studioAdopt = useRef<AdoptChange | null>(null);
  // Before the server copy is read nothing is pushed, but an edit is still unpushed.
  const firstConfig = useRef(config);
  useEffect(() => {
    if (!kiosk && !synced && config !== firstConfig.current) setPushPending(true);
  }, [config, kiosk, synced]);
  useEffect(() => {
    if (kiosk || !synced || refused || updating) return; // kiosk pages only read; don't push from them
    // A Settings change needs no push, unless an edit of the studio's own still waits for one (it then carries both).
    if (config === adopted.current && !pendingRef.current) return;
    let superseded = false;
    setPushPending(true);
    const t = window.setTimeout(() => {
      pushConfig(config)
        .then(() => {
          setOffline(false);
          setReadOnly(false);
          if (!superseded) setPushPending(false);
        })
        .catch((err) => {
          setOffline(isUnreachable(err));
          if (err instanceof NewerConfigError) setRefused(true);
          if (isRemoteEditRefusal(err)) setReadOnly(true);
          // Otherwise the server is offline — kiosk pages keep their last copy.
        });
    }, 400);
    return () => {
      superseded = true;
      window.clearTimeout(t);
    };
  }, [config, kiosk, synced, refused, updating]);

  // The Settings window's changes (PLAN decision 22): the server took them, so the studio applies the same patch to
  // its working copy, unsaved edits and all, and its next push carries them; Reset everything… replaced the saved
  // config, which is read back in full.
  useEffect(() => {
    if (kiosk) return;
    let alive = true;
    const adopt = (next: DashboardConfig) => {
      latestConfig.current = next;
      adopted.current = next;
      setConfig(next);
    };
    // The studio view puts a patch into its working copy and every undo snapshot, so undo never reverts it. One the
    // page already has (from both the channel and the stream, or in the config it read) is skipped.
    const applyPatch = (patch: SettingsPatch, rev: number) => {
      const known = knownSettingsRev();
      if (known !== null && rev <= known) return;
      noteSettingsRev(rev);
      const change = (c: DashboardConfig) => withSettingsPatch(c, patch);
      if (studioAdopt.current) {
        const next = studioAdopt.current(change);
        latestConfig.current = next;
        adopted.current = next;
      } else adopt(change(latestConfig.current));
    };
    // The channel reaches only pages in the same browser. A studio opened in another (Open the studio in › Edge or the
    // default browser) learns of a change from the config stream, which names the newest revision, and fetches it.
    const events = trackEventSource(new EventSource(CONFIG_EVENTS_URL));
    events.onmessage = (e) => {
      const rev = (JSON.parse(e.data) as { settingsRev?: number }).settingsRev;
      const known = knownSettingsRev();
      if (typeof rev !== "number" || known === null || rev <= known) return;
      void fetchSettingsPatches(known)
        .then((patches) => {
          if (alive) for (const p of patches) applyPatch(p.patch, p.rev);
        })
        .catch(() => {});
    };
    const off = onStudioMessage((message) => {
      if (message.type === "settings") applyPatch(message.patch, message.rev);
      if (message.type === "replaced") {
        void fetchConfig()
          .then(async (server) => {
            const merged = server && (await readConfig(server));
            if (alive && merged) adopt(withPinnedProfile(merged));
          })
          .catch(() => {});
      }
    });
    return () => {
      alive = false;
      events.close();
      off();
    };
  }, [kiosk]);

  // Kiosk: pull the shared config on load and again whenever the server
  // reports a newer version (a studio edit or Save), so the display updates
  // without a reload. The ?profile= pin still decides which profile shows.
  useEffect(() => {
    if (!kiosk) return;
    const pull = startKioskPull({
      fetchConfig,
      resolve: async (parsed) => withPinnedProfile(await readConfig(parsed as Parameters<typeof readConfig>[0])),
      apply: (merged) => {
        // Before the render that mounts its widgets: their effects run before ours.
        setApiBase(merged.dataApiUrl);
        saveConfig(merged); // also seed the local copy (offline fallback)
        setConfig(merged);
      },
      onChange: () => setLayoutVersion((v) => v + 1),
      settled: () => setKioskPulled(true),
    });
    const events = trackEventSource(new EventSource(CONFIG_EVENTS_URL));
    events.onmessage = pull.message;
    return () => {
      pull.stop();
      events.close();
    };
  }, [kiosk]);

  // Follow the Data API URL setting: the sensor stream and the Wave Link
  // client reconnect to the new base.
  useEffect(() => setApiBase(config.dataApiUrl), [config.dataApiUrl]);

  // Apply the theme as CSS variables on :root: the shown screen's. The
  // studio's chrome has its own ui-* tokens (:root keeps the built-in
  // theme); its canvas scopes the edited screen's.
  const shownTheme = studio ? undefined : profile;
  useEffect(() => {
    const { tokens, radius } = resolveTheme(shownTheme && { theme: shownTheme.theme, radius: shownTheme.radius });
    applyTheme(tokens, radius);
  }, [shownTheme?.theme, shownTheme?.radius]);

  // Track window size for automatic profile selection.
  useEffect(() => {
    const onResize = () =>
      setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const enterStudio = () => {
    if (isTauri()) {
      setViewProfile(undefined);
      void kioskWindow().catch(() => {});
    }
    setStudio(true);
    window.history.replaceState(null, "", "?studio=1");
  };
  // Desktop: Kiosk view takes the window to the shown profile's exact size, on the profile the studio was editing. A
  // browser opens it in a window of its own, so the studio's tab stays; in this tab only when the popup is blocked.
  const exitStudio = () => {
    if (isTauri()) {
      setViewProfile(stored.id);
      void kioskWindow({ width: stored.width, height: stored.height }).catch(() => {});
    } else if (openKioskPopup(stored.id)) {
      return;
    }
    setStudio(false);
    window.history.replaceState(null, "", window.location.pathname);
  };
  // The shell left Kiosk view itself (Alt+F4, tray close, a cancelled close warning): the page follows.
  useEffect(() => {
    if (kiosk) return;
    let gone = false;
    let off: (() => void) | undefined;
    void onKioskLeft(() => {
      setViewProfile(undefined);
      setStudio(true);
      window.history.replaceState(null, "", "?studio=1");
    }).then((unlisten) => (gone ? unlisten() : (off = unlisten)));
    return () => {
      gone = true;
      off?.();
    };
  }, [kiosk]);
  // Closing from Kiosk view goes back to the studio first, so a window shown again from the tray is the studio.
  const closeFromKiosk = () => {
    enterStudio();
    void closeWindow().catch(() => {});
  };

  // Studio "Save" button: flush the config to the server immediately (the
  // normal sync is debounced 400ms); open kiosk pages pick it up from the
  // config event stream.
  // Resolves to whether the server took it, so the button only says "Saved" when it did.
  const handleStudioSave = useCallback((cfg: DashboardConfig) => {
    if (fixture || updatingRef.current) return Promise.resolve(false); // a fixture never reaches the saved config
    saveConfig(cfg); // local copy first (offline fallback)
    return pushConfig(cfg)
      .then(() => {
        setOffline(false);
        setReadOnly(false);
        // An edit made since the click is still unpushed (its debounced push clears the dot).
        if (latestConfig.current === cfg) setPushPending(false);
        return true;
      })
      .catch((err) => {
        setOffline(isUnreachable(err));
        if (err instanceof NewerConfigError) setRefused(true);
        if (isRemoteEditRefusal(err)) setReadOnly(true);
        return false;
      }); // Server offline — kiosk pages keep their last copy; the dot stays.
  }, [fixture]);

  // Desktop shell: before it hides or quits it asks for the same flush as Save, and waits for flush_done.
  useEffect(() => {
    if (kiosk) return;
    let off: (() => void) | undefined;
    let gone = false;
    void onStudioFlush(() => {
      const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, 1200));
      void Promise.race([handleStudioSave(latestConfig.current), timeout])
        .catch(() => {})
        .finally(() => void flushDone().catch(() => {}));
    }).then((unlisten) => (gone ? unlisten() : (off = unlisten)));
    return () => {
      gone = true;
      off?.();
    };
  }, [kiosk, handleStudioSave]);

  // A browser has no shell to ask for that flush: the studio saves as soon as its tab is hidden (the page still runs
  // then, so a normal push completes), and asks before leaving only while a change is still unsaved. Not keepalive
  // or sendBeacon: their 64 KiB body limit is far under the config's.
  useEffect(() => {
    if (kiosk || isTauri()) return;
    const onHidden = () => {
      if (document.visibilityState === "hidden" && pendingRef.current && syncedRef.current) void handleStudioSave(latestConfig.current);
    };
    const onLeave = (e: BeforeUnloadEvent) => {
      if (!pendingRef.current) return;
      e.preventDefault();
      // Older Chromium shows the prompt only with a return value.
      e.returnValue = "";
    };
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("beforeunload", onLeave);
    return () => {
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("beforeunload", onLeave);
    };
  }, [kiosk, handleStudioSave]);

  // Kiosk pages run for weeks and their native memory creeps: reload daily at 04:00 (settings are saved, nothing is lost).
  const kioskRefresh = general.kioskRefresh;
  useEffect(() => {
    if (!kiosk || kioskRefresh !== "daily") return;
    const timer = window.setTimeout(() => window.location.reload(), msUntilNextRefresh(new Date(), Math.random() * REFRESH_JITTER_MS));
    return () => window.clearTimeout(timer);
  }, [kiosk, kioskRefresh]);

  // Desktop shell: WebView2 updated itself in the background; the running window keeps the old one until a restart.
  const [runtimeUpdated, setRuntimeUpdated] = useState(false);
  useEffect(() => {
    if (kiosk || !studio || !isTauri()) return;
    let off: (() => void) | undefined;
    let gone = false;
    void import("@tauri-apps/api/event")
      .then(({ listen }) => listen("webview-runtime-updated", () => setRuntimeUpdated(true)))
      .then((unlisten) => (gone ? unlisten() : (off = unlisten)))
      .catch(() => {});
    return () => {
      gone = true;
      off?.();
    };
  }, [kiosk, studio]);

  // The dedicated studio replaces the whole view.
  if (studio) {
    return (
      <GeneralProvider value={general}>
      <PerformanceProvider value={perfOverride}>
        {refused && (
          <div
            role="alert"
            className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 border-b border-ui-menu bg-ui-raised px-4 py-2 font-ui text-caption text-ui-1"
          >
            A newer dashboard version saved this config. Reload to keep editing.
            <button
              type="button"
              className="rounded-md border border-ui-default px-2 py-0.5 hover:bg-ui-hover"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        )}
        {runtimeUpdated && (
          <div
            role="status"
            className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 border-b border-ui-menu bg-ui-raised px-4 py-2 font-ui text-caption text-ui-1"
          >
            WebView2 was updated. Restart InfoPanel Studio to use it.
            <button type="button" onClick={() => setRuntimeUpdated(false)} className="rounded px-2 py-0.5 text-ui-2 hover:bg-ui-hover hover:text-ui-1">
              Dismiss
            </button>
          </div>
        )}
        {readOnly && !refused && (
          <div
            role="alert"
            className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 border-b border-ui-menu bg-ui-raised px-4 py-2 font-ui text-caption text-ui-1"
          >
            Editing from other devices is off, so changes here are not saved. Turn it on in Settings › Server on the PC running InfoPanel Studio.
          </div>
        )}
        <Suspense fallback={null}>
          <StudioView
            config={config}
            profile={profile}
            onSelectProfile={pinProfile}
            onPageChange={setStudioPage}
            setConfig={setConfig}
            windowWidth={windowSize.w}
            windowHeight={windowSize.h}
            onExitStudio={exitStudio}
            onSave={handleStudioSave}
            pushPending={pushPending}
            offline={offline}
            refused={refused}
            readOnly={readOnly}
            firstRun={freshBrowser && serverEmpty}
            adoptRef={studioAdopt}
            fixture={fixture}
          />
        </Suspense>
        {update && !refused && (
          <Suspense fallback={null}>
            <ConfigUpdateDialog
              from={update.from}
              config={config}
              onSaved={(saved) => {
                setOffline(false);
                setUpdate({ from: update.from, saved: true });
                if (latestConfig.current === saved) setPushPending(false);
              }}
              onFailed={(err) => {
                setOffline(isUnreachable(err));
                if (err instanceof NewerConfigError) setRefused(true);
              }}
              onClose={() => setUpdate(undefined)}
            />
          </Suspense>
        )}
      </PerformanceProvider>
    </GeneralProvider>
    );
  }

  // A page's row template: explicit uniform rows, mirroring the studio canvas (a bar's rows fitted on the kiosk).
  const rowsOf = (view: typeof profile, list: typeof drawn) =>
    fill
      ? (kiosk && barRowTemplate(view, list, windowSize.h - profilePadding(view, kiosk) - (pageNav ? Math.max(profilePadding(view, kiosk), pageDotsStripPx()) : profilePadding(view, kiosk)) - reserve - room.top - room.bottom, windowSize.h)) ||
        `repeat(${view.rows}, minmax(0, 1fr))`
      : `repeat(${view.rows}, ${SCROLL_ROW_H}px)`;
  // A page's zones, each drawn as the kiosk draws a widget.
  const zonesOf = (view: typeof profile, list: typeof drawn, zoneId: boolean) =>
    list
      .filter((p) => p.visible)
      .map((p) => (
        <LivePlacement key={p.id} placement={p} appearance={appearance}>
          {({ content, hasData, title, scope }) => (
            <PlacementFrame
              placement={p}
              profile={view}
              studio={false}
              zoneId={zoneId}
              hasData={hasData}
              title={title}
              scope={scope}
            >
              {content}
            </PlacementFrame>
          )}
        </LivePlacement>
      ));

  // Kiosk: nothing until the server's config has been read (or failed to), so the local copy's layout (the
  // defaults in a fresh browser) never mounts widgets that open sensor streams to its Data API.
  if (kiosk && !kioskPulled) return <KioskConnecting />;

  return (
    <GeneralProvider value={general}>
      <PerformanceProvider value={perfOverride}>
      <PageIslandProvider value={pageIsland}>
      <RailHostContext.Provider value={railHost}>
      <main
        ref={mainEl}
        aria-label={pageName || undefined}
        className={cn(
          // A page background replaces the theme's page color (it sits
          // behind the grid, under this element's own paint).
          "flex flex-col text-foreground",
          !background && !packBackground(pack) && "bg-background",
          kiosk && "kiosk",
          kiosk && !fill && "kiosk-scroll",
          kiosk && general.hideCursor && "kiosk-hide-cursor",
          // the grid pins' grid is placed in it (absolute); a page without grid pins is as it was
          gridPins.length > 0 && "relative",
          fill
            ? kiosk
              ? "h-screen overflow-hidden"
              : "h-screen overflow-hidden gap-3"
            : "min-h-screen gap-4"
        )}
        style={{
          padding: profilePadding(profile, kiosk),
          // "Reserve space": the zones start under the island instead of beneath it. Always set, so
          // React never removes it from under the `padding` shorthand.
          paddingTop: profilePadding(profile, kiosk) + (bottomIsland ? 0 : reserve) + room.top,
          // The dots' strip: they sit in the bottom padding, so no zone is under them. Always set, like paddingTop.
          paddingBottom: Math.max(profilePadding(profile, kiosk), pageNav ? pageDotsStripPx() : 0) + (bottomIsland ? reserve : 0) + room.bottom,
          // The pinned items that make room on the sides. Always set, like paddingTop.
          paddingLeft: profilePadding(profile, kiosk) + room.left,
          paddingRight: profilePadding(profile, kiosk) + room.right,
          // Vertical scrolling stays with the browser; horizontal moves reach the swipe.
          ...(pageNav && { touchAction: "pan-y" }),
          fontFamily: fontStack(resolveFont(profile)),
        }}
        onPointerDown={onKioskPointerDown}
        onPointerMove={dragFollow ? onKioskPointerMove : undefined}
        onPointerUp={onKioskPointerUp}
        onPointerCancel={onKioskPointerCancel}
      >
        {background && <PageBackground background={background} className="fixed inset-0 -z-10" />}
        <PackStage pack={pack} page={islandPage} className="fixed inset-0 -z-10" overlayClassName="fixed inset-0 z-10" zones={zones} accent={pageSkin.accent} />

        {/* Header (hidden in kiosk mode) */}
        {!kiosk && (
          <div className={cn("flex items-center justify-between", fill && "shrink-0")} style={pack?.chrome?.page}>
            <div className="flex items-baseline gap-3">
              <h1
                className={cn(
                  "font-semibold tracking-tight",
                  fill ? "text-base" : "text-2xl"
                )}
              >
                System Dashboard
              </h1>
              {!fill && (
                <p className="text-sm text-muted-foreground">
                  Live data from the InfoPanel Data API
                </p>
              )}
            </div>
            <ConnectionStatus />
          </div>
        )}

        <PinnedItems all={pinned} items={edgePins.filter(leadsPage)} profile={profile} appearance={appearance} padding={profilePadding(profile, kiosk)} />

        {/* Kiosk grid of zones (read-only) */}
        <PageGrid
          key={profile.pageId}
          ref={gridEl}
          fade={swiped !== profile.pageId}
          className={cn("grid", fill && "min-h-0 flex-1")}
          style={{
            gap: profileGap(profile),
            gridTemplateColumns: `repeat(${profile.cols}, minmax(0, 1fr))`,
            // Explicit uniform rows, mirroring the studio canvas.
            gridTemplateRows: rowsOf(profile, drawn),
          }}
        >
          {zonesOf(profile, drawn, linked)}
          {kiosk && <ZoneHighlights alerts={shownAlerts} profile={profile} />}
        </PageGrid>

        {/* The neighbour page while a drag follows the finger: the same box, one page width along */}
        {peek && peekView && (
          <div
            ref={peekEl}
            aria-hidden
            inert
            className="fixed"
            data-page-peek={peek.page}
            style={{
              left: peek.box.left,
              top: peek.box.top,
              width: peek.box.width,
              height: peek.box.height,
              display: "grid",
              gap: profileGap(peekView),
              gridTemplateColumns: `repeat(${peekView.cols}, minmax(0, 1fr))`,
              gridTemplateRows: rowsOf(peekView, peekDrawn),
              transform: `translateX(${(drag.current?.dx ?? 0) + peek.side * peek.step}px)`,
              // it comes in under the pinned layer, clipped to the page area until the next move clips it again (`slide`)
              clipPath: `inset(-64px ${peek.side > 0 ? 0 : peek.box.width}px -64px ${peek.side > 0 ? peek.box.width : 0}px)`,
              // a shadow on the edge it leads with, as the `swipe` fixture draws it
              boxShadow: `${-peek.side * 16}px 0 32px -16px hsl(var(--foreground) / 0.25)`,
            }}
          >
            {zonesOf(peekView, peekDrawn, false)}
          </div>
        )}

        {/* The widgets pinned in place, on the page grid's cells over its zones */}
        {gridPins.length > 0 && (
          <Suspense fallback={null}>
            <PinnedGrid
              items={gridPins}
              profile={profile}
              appearance={appearance}
              grid={gridEl}
              main={mainEl}
              tracks={{ gap: profileGap(profile), gridTemplateColumns: `repeat(${profile.cols}, minmax(0, 1fr))`, gridTemplateRows: rowsOf(profile, drawn) }}
            />
          </Suspense>
        )}

        {/* The pinned items on the right and bottom edges, and the ones floating over the page (drawn over its zones) */}
        <PinnedItems all={pinned} items={edgePins.filter((it) => !leadsPage(it))} profile={profile} appearance={appearance} padding={profilePadding(profile, kiosk)} />

        {kiosk && <KioskWaitingForData />}

        {kiosk && <KioskOfflinePill island={!!island} />}

        {kiosk && <DimOverlay level={control?.profiles[stored.id]?.dim ?? 0} />}

        {kiosk && <AlertLayer alerts={splitAlerts.layer} onAck={ackAlert} lookId={pageSkin.lookId} />}

        {(confirming || actionNote) && (
          <Suspense fallback={null}>
            <ActionLayer confirm={confirming} note={actionNote} room={room} onCancel={() => setConfirming(null)} onNoteDone={() => setActionNote(null)} />
          </Suspense>
        )}

        {/* An agent's permission request, answered here (P8): this PC's kiosk only, which the server decides */}
        {kiosk && <AgentPromptHost stored={stored} room={room} />}

        {/* Alerts reach the island on the kiosk only; the plain page shows its idle pill. */}
        {shownIsland && (
          <DynamicIsland
            config={shownIsland}
            alerts={kiosk ? splitAlerts.island : NO_ALERTS}
            onAck={kiosk ? ackAlert : undefined}
            placement="fixed"
            page={islandPage}
            skin={pageSkin}
            live={islandLive}
          />
        )}

        <PageDots
          enabled={pageNav}
          scroll={!fill}
          pages={stored.pages}
          current={profile.pageId ?? stored.pages[0].id}
          rotateOn={stored.rotate?.enabled === true}
          paused={stored.rotate?.enabled === true && control?.profiles[stored.id]?.rotating === false}
          onSelect={goToPage}
          onToggleRotate={() => void postControl("rotate", { profile: stored.id, state: "toggle" })}
          lift={(shownIsland && bottomIsland ? reserve : 0) + room.bottom}
        />

        {kiosk && touchPanel && (
          <Suspense fallback={null}>
            <TouchLayer panel={touchPanel} onPage={touchPage} />
          </Suspense>
        )}

        {/* Desktop Kiosk view has no title bar: the top edge brings a strip with Back, Minimize and Close */}
        {!kiosk && isTauri() && <KioskStrip onBack={enterStudio} onClose={closeFromKiosk} />}

        {/* Floating entry to the studio (not on display-only kiosk pages) */}
        {!kiosk && (
          <button
            onClick={enterStudio}
            className="fixed bottom-4 right-4 z-50 rounded-full border bg-popover p-2.5 text-muted-foreground shadow-lg opacity-70 transition-opacity hover:opacity-100 focus-visible:opacity-100 kiosk-focus"
            title="Open dashboard studio"
            aria-label="Open InfoPanel Studio"
          >
            <Wrench className="h-4 w-4" />
          </button>
        )}
      </main>
      </RailHostContext.Provider>
      </PageIslandProvider>
    </PerformanceProvider>
    </GeneralProvider>
  );
}

/** The migration log (the upgrade's v15 step, `config-upgrade.ts`): each conversion, in the console and the desktop app's log. */
function logMigration(lines: readonly string[]) {
  if (lines.length === 0) return;
  const text = `Screens updated for this version:\n${lines.join("\n")}`;
  console.warn(text);
  void logFrontend("warn", text).catch(() => {});
}

/** Kiosk dim (Stream Deck): a black veil over the page and island, under the alerts. Stays mounted at opacity 0 so it fades both ways. */
function DimOverlay({ level }: { level: number }) {
  const reduced = useReducedMotion();
  return (
    <div
      className="pointer-events-none fixed inset-0 z-[58] bg-black"
      style={{ opacity: Math.max(0, level), transition: reduced ? undefined : "opacity 300ms" }}
      data-dim-overlay
    />
  );
}

/** The zone grid; a new page (the caller keys it by page id) fades in, instantly with reduced motion, and a page a swipe brought in is already in place. */
function PageGrid({ className, style, children, ref, fade = true }: { className: string; style: React.CSSProperties; children: React.ReactNode; ref?: React.Ref<HTMLDivElement>; fade?: boolean }) {
  const reduced = useReducedMotion();
  return (
    <div ref={ref} className={cn(className, fade && !reduced && "page-fade-in")} style={style} data-page-grid="">
      {children}
    </div>
  );
}

/** Header badge: stream status and the time of the last sensor message. */
function ConnectionStatus() {
  const connected = useSensorsConnected();
  const timestamp = useSensorsTimestamp();
  const general = useGeneral();
  return (
    <div className="flex items-center gap-3">
      <Badge variant={connected ? "default" : "destructive"} className="gap-1.5">
        <span
          className={`h-2 w-2 rounded-full ${connected ? "bg-emerald-400" : "bg-red-400"}`}
        />
        {connected ? "Connected" : "Disconnected"}
      </Badge>
      {timestamp > 0 && (
        <span className="text-xs text-muted-foreground">
          {formatClock(new Date(timestamp), { ...general, showSeconds: true }).time}
        </span>
      )}
    </div>
  );
}

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Wrench } from "lucide-react";
import { useSensorsConnected, useSensorsTimestamp } from "@/hooks/useSensors";
import { Badge } from "@/components/ui/badge";
import { PlacementFrame } from "@/components/studio/placement-frame";
import { LivePlacement } from "@/components/studio/placement-content";
import { PageBackground } from "@/components/page-background";
import { AlertLayer, useShownAlerts, ZoneHighlights } from "@/components/alerts/alert-layer";
import { DynamicIsland } from "@/components/island/dynamic-island";
import { islandReserve } from "@/components/island/island-model";
import { splitIslandAlerts } from "@/lib/island/from-alerts";
import { ISLAND_DEFAULTS } from "@/lib/island/config";
import { islandFeeds } from "@/lib/island/sources";
import { modules } from "@/modules";
import { PageDots, PAGE_DOTS_STRIP_PX } from "@/components/page-dots";
import { resolveBackground } from "@/lib/appearance";
import { appearanceOf, zoneResolver } from "@/lib/style-resolve";
import { applyTheme, resolveTheme } from "@/lib/theme";
import { msUntilNextRefresh, REFRESH_JITTER_MS } from "@/lib/kiosk-refresh";
import { fontStack, formatClock, resolveFont, resolveGeneral } from "@/lib/general";
import { profileGap, profilePadding } from "@/lib/profile-grid";
import { GeneralProvider, useGeneral } from "@/hooks/use-general";
import { PageIslandProvider } from "@/hooks/use-page-island";
import { PerformanceProvider } from "@/hooks/use-performance";
import { performanceFromSearch } from "@/lib/performance";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { setApiBase } from "@/lib/data-api";
import { closeWindow, flushDone, isTauri, kioskWindow, onKioskLeft, onStudioFlush } from "@/lib/desktop";
import { KioskStrip } from "@/components/kiosk-strip";
import { editedProfileId, readPin, writePin } from "@/components/studio/pinned-profile";
import { trackEventSource } from "@/lib/sensor-store";
import type { AdoptChange } from "@/hooks/use-config-history";
import { withSettingsPatch } from "@/lib/settings-patch";
import { onStudioMessage } from "@/lib/studio-channel";
import {
  CONFIG_EVENTS_URL,
  fetchConfig,
  isRemoteEditRefusal,
  isUnreachable,
  NewerConfigError,
  noteSettingsRev,
  pushConfig,
} from "@/lib/dashboard-server";
import {
  hasStoredConfig,
  loadConfig,
  mergeConfig,
  resolveProfile,
  saveConfig,
  SCROLL_ROW_H,
  type DashboardConfig,
} from "@/lib/layout";
import { profileWithPage } from "@/lib/pages";
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
import { swipeDirection } from "@/lib/swipe";
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

const NO_ALERTS: readonly never[] = [];

/** A touch tells the server to hold auto-rotation (it holds 30 s); at most this often. */
const TOUCH_THROTTLE_MS = 5000;

// The studio is an editing tool; kiosk pages never download it.
const StudioView = lazy(() =>
  import("@/components/studio/studio-view").then((m) => ({ default: m.StudioView }))
);

export default function App() {

  // Kiosk mode (?kiosk=1, e.g. an InfoPanel web page profile): display
  // only — no header, no studio chrome, and the layout comes from the
  // server's shared config instead of this page's own storage.
  const kiosk = useMemo(
    () => new URLSearchParams(window.location.search).get("kiosk") === "1",
    []
  );

  const [config, setConfig] = useState<DashboardConfig>(() => {
    const loaded = loadConfig();
    setApiBase(loaded.dataApiUrl); // before the first sensor connection
    return withPinnedProfile(loaded);
  });
  // First run (SPEC §10.5): this browser had no config when the page opened, and the server has none either.
  const [freshBrowser] = useState(() => !hasStoredConfig());
  const [serverEmpty, setServerEmpty] = useState(false);
  const [studio, setStudio] = useState(
    () => new URLSearchParams(window.location.search).has("studio")
  );
  const [windowSize, setWindowSize] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));

  // The page the studio edits (view state); the kiosk shows the pinned one.
  const [studioPage, setStudioPage] = useState(pagePin);
  // Kiosk: the control channel decides the profile (unless ?profile= pins one)
  // and the page. The stream also tells the server which profile this kiosk shows.
  const [shownId, setShownId] = useState<string>();
  const control = useControl(shownId, kiosk && shownId !== undefined, pagePin);
  // A tap or swipe switches at once; the server's state takes over when it arrives.
  const [optimistic, setOptimistic] = useState<{ profile: string; page: string } | null>(null);
  // Kiosk: studio saves pulled since load (the island's "Layout updated").
  const [layoutVersion, setLayoutVersion] = useState(0);
  useEffect(() => setOptimistic(null), [control]);
  // Studio only: the profile selected in the Profiles panel, which the studio edits (view state, never in the
  // config; stored as the old "pin"). Displays follow `config.activeProfile`; an unknown selection is ignored.
  const [pin, setPin] = useState(readPin);
  const pinnedId = pin && config.profiles.some((p) => p.id === pin) ? pin : undefined;
  const pinProfile = useCallback((id: string | undefined) => {
    setPin(id);
    writePin(id);
  }, []);
  // Desktop Kiosk view: the profile the studio was editing, kept as it is (Auto doesn't re-resolve on resize).
  const [viewProfile, setViewProfile] = useState<string>();
  const forcedProfile = kiosk
    ? kioskProfileId({ pin: profilePin, control, config })
    : studio
      ? editedProfileId(config, pinnedId, windowSize.w, windowSize.h)
      : viewProfile;
  const stored = resolveProfile(
    forcedProfile ? { ...config, activeProfile: forcedProfile } : config,
    windowSize.w,
    windowSize.h
  );
  // Kiosk: the server's config has been asked for once. Until then the profile is the local copy's (the defaults in
  // a fresh browser), which must not be reported as shown.
  const [kioskPulled, setKioskPulled] = useState(false);
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
  // The page can vanish (delete, undo, another profile): the view fell back to the first one.
  useEffect(() => {
    if (studio && profile.pageId !== studioPage) setStudioPage(profile.pageId);
  }, [studio, profile.pageId, studioPage]);
  const { shown: shownAlerts, ack: ackAlert } = useShownAlerts(control, stored.id);
  // Island-style alerts go to the profile's island; without one they show as a top toast.
  // The control channel can show or hide it (Stream Deck); the layout space it reserves stays either way.
  const savedIsland = profile.island?.enabled === true;
  const islandShown = kiosk ? islandEffective(control, profile) : savedIsland;
  const islandConfig = useMemo(
    () =>
      islandShown || savedIsland ? { ...(profile.island ?? ISLAND_DEFAULTS), enabled: true } : undefined,
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
        ? { feeds: islandFeeds(stored.pages.flatMap((p) => p.placements), modules, zoneResolver(config, stored, (z) => modules.find((m) => m.id === z.module)?.settings)), quietHours, page: pageName, layoutVersion }
        : undefined,
    [kiosk, island, stored, config, quietHours, pageName, layoutVersion]
  );
  const islandPage = useMemo(() => ({ width: profile.width, height: profile.height }), [profile.width, profile.height]);
  const reserve = islandReserve(islandConfig, islandPage);
  const pageIsland = useMemo(() => ({ island, page: islandPage }), [island, islandPage]);
  const fill = profile.fit === "fill";
  const background = resolveBackground(config, profile);
  const appearance = appearanceOf(config, profile);
  const general = useMemo(() => resolveGeneral({ general: config.general, style: config.style }), [config.general, config.style]);
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
  const onKioskPointerDown = (e: React.PointerEvent) => {
    if (!kiosk) return;
    gesture.current = { x: e.clientX, y: e.clientY, t: e.timeStamp };
    const now = Date.now();
    if (control?.profiles[stored.id]?.rotating && now - lastTouch.current >= TOUCH_THROTTLE_MS) {
      lastTouch.current = now;
      void postControl("touch", { profile: stored.id });
    }
  };
  const onKioskPointerUp = (e: React.PointerEvent) => {
    const start = gesture.current;
    gesture.current = null;
    if (!pageNav || !start) return;
    const dir = swipeDirection({ dx: e.clientX - start.x, dy: e.clientY - start.y, ms: e.timeStamp - start.t });
    if (!dir) return;
    const next = neighbourPage(
      stored.pages.map((p) => p.id),
      profile.pageId ?? stored.pages[0].id,
      dir === "next" ? 1 : -1
    );
    if (next) goToPage(next);
  };

  // Persist the config (layout, profiles, theme) on every change.
  useEffect(() => saveConfig(config), [config]);

  // Editing pages start from the server's copy: until it has been read, this
  // page's own storage (or the defaults, in a fresh browser) must not be
  // pushed over it. If the server can't be read, only Save pushes.
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    if (kiosk) return;
    let alive = true;
    fetchConfig()
      .then((server) => {
        if (!alive) return;
        if (server) {
          const merged = withPinnedProfile(mergeConfig(server));
          saveConfig(merged);
          setConfig(merged);
        } else {
          setServerEmpty(true);
        }
        setSynced(true);
      })
      .catch(() => {
        // Server offline — keep the local copy and don't auto-push.
      });
    return () => {
      alive = false;
    };
  }, [kiosk]);
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
  // The last config taken from the Settings window: the server holds it already.
  const adopted = useRef<DashboardConfig | null>(null);
  const studioAdopt = useRef<AdoptChange | null>(null);
  // Before the server copy is read nothing is pushed, but an edit is still unpushed.
  const firstConfig = useRef(config);
  useEffect(() => {
    if (!kiosk && !synced && config !== firstConfig.current) setPushPending(true);
  }, [config, kiosk, synced]);
  useEffect(() => {
    if (kiosk || !synced || refused) return; // kiosk pages only read; don't push from them
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
  }, [config, kiosk, synced, refused]);

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
    const off = onStudioMessage((message) => {
      if (message.type === "settings") {
        // The studio view puts it into its working copy and every undo snapshot, so undo never reverts it.
        const { patch } = message;
        noteSettingsRev(message.rev);
        const change = (c: DashboardConfig) => withSettingsPatch(c, patch);
        if (studioAdopt.current) {
          const next = studioAdopt.current(change);
          latestConfig.current = next;
          adopted.current = next;
        } else adopt(change(latestConfig.current));
      }
      if (message.type === "replaced") {
        void fetchConfig()
          .then((server) => alive && server && adopt(withPinnedProfile(mergeConfig(server))))
          .catch(() => {});
      }
    });
    return () => {
      alive = false;
      off();
    };
  }, [kiosk]);

  // Kiosk: pull the shared config on load and again whenever the server
  // reports a newer version (a studio edit or Save), so the display updates
  // without a reload. The ?profile= pin still decides which profile shows.
  useEffect(() => {
    if (!kiosk) return;
    let alive = true;
    // The last config pulled, so a reconnect (the same version again) is not counted as an update.
    let last: string | null = null;
    const pull = async () => {
      try {
        const parsed = await fetchConfig();
        if (!alive) return;
        if (parsed) {
          const text = JSON.stringify(parsed);
          if (last !== null && text !== last) setLayoutVersion((v) => v + 1);
          last = text;
          const merged = withPinnedProfile(mergeConfig(parsed));
          saveConfig(merged); // also seed the local copy (offline fallback)
          setConfig(merged);
        }
        // Nothing saved yet: the local copy stands.
      } catch {
        // Server offline — the local fallback (loadConfig) stands.
      }
      if (alive) setKioskPulled(true);
    };
    // The stream sends the current version on connect (and on every
    // reconnect), then one event per save — each one triggers a pull.
    const events = trackEventSource(new EventSource(CONFIG_EVENTS_URL));
    events.onmessage = () => void pull();
    return () => {
      alive = false;
      events.close();
    };
  }, [kiosk]);

  // Follow the Data API URL setting: the sensor stream and the Wave Link
  // client reconnect to the new base.
  useEffect(() => setApiBase(config.dataApiUrl), [config.dataApiUrl]);

  // Apply the theme as CSS variables on :root: the shown profile's (its
  // own colours over the dashboard's). The studio's chrome keeps the
  // dashboard theme; its canvas scopes the edited profile's.
  const shownTheme = studio ? undefined : profile;
  useEffect(() => {
    const { tokens, radius } = resolveTheme(
      { theme: config.theme, radius: config.radius },
      shownTheme && { theme: shownTheme.theme, radius: shownTheme.radius }
    );
    applyTheme(tokens, radius);
  }, [config.theme, config.radius, shownTheme?.theme, shownTheme?.radius]);

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
  // Desktop: Kiosk view takes the window to the shown profile's exact size, on the profile the studio was editing.
  const exitStudio = () => {
    if (isTauri()) {
      setViewProfile(stored.id);
      void kioskWindow({ width: stored.width, height: stored.height }).catch(() => {});
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
  }, []);

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
            className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 border-b border-ui-menu bg-ui-raised px-4 py-2 font-ui text-[12px] text-ui-1"
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
            className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 border-b border-ui-menu bg-ui-raised px-4 py-2 font-ui text-[12px] text-ui-1"
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
            className="fixed inset-x-0 top-0 z-50 flex items-center justify-center gap-3 border-b border-ui-menu bg-ui-raised px-4 py-2 font-ui text-[12px] text-ui-1"
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
            firstRun={freshBrowser && serverEmpty}
            adoptRef={studioAdopt}
          />
        </Suspense>
      </PerformanceProvider>
    </GeneralProvider>
    );
  }

  return (
    <GeneralProvider value={general}>
      <PerformanceProvider value={perfOverride}>
      <PageIslandProvider value={pageIsland}>
      <div
        className={cn(
          // A page background replaces the theme's page color (it sits
          // behind the grid, under this element's own paint).
          "flex flex-col text-foreground",
          !background && "bg-background",
          kiosk && "kiosk",
          kiosk && general.hideCursor && "kiosk-hide-cursor",
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
          paddingTop: profilePadding(profile, kiosk) + reserve,
          // The dots' strip: they sit in the bottom padding, so no zone is under them.
          ...(pageNav && { paddingBottom: Math.max(profilePadding(profile, kiosk), PAGE_DOTS_STRIP_PX) }),
          // Vertical scrolling stays with the browser; horizontal moves reach the swipe.
          ...(pageNav && { touchAction: "pan-y" }),
          fontFamily: fontStack(resolveFont(general, profile)),
        }}
        onPointerDown={onKioskPointerDown}
        onPointerUp={onKioskPointerUp}
        onPointerCancel={() => (gesture.current = null)}
      >
        {background && <PageBackground background={background} className="fixed inset-0 -z-10" />}

        {/* Header (hidden in kiosk mode) */}
        {!kiosk && (
          <div className={cn("flex items-center justify-between", fill && "shrink-0")}>
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

        {/* Kiosk grid of zones (read-only) */}
        <PageGrid
          key={profile.pageId}
          className={cn("grid", fill && "min-h-0 flex-1")}
          style={{
            gap: profileGap(profile),
            gridTemplateColumns: `repeat(${profile.cols}, minmax(0, 1fr))`,
            // Explicit uniform rows, mirroring the studio canvas.
            gridTemplateRows: fill
              ? `repeat(${profile.rows}, minmax(0, 1fr))`
              : `repeat(${profile.rows}, ${SCROLL_ROW_H}px)`,
          }}
        >
          {profile.placements
            .filter((p) => p.visible)
            .map((p) => (
              <LivePlacement key={p.id} placement={p} appearance={appearance}>
                {({ content, hasData, title, scope }) => (
                  <PlacementFrame
                    placement={p}
                    profile={profile}
                    studio={false}
                    hasData={hasData}
                    title={title}
                    scope={scope}
                  >
                    {content}
                  </PlacementFrame>
                )}
              </LivePlacement>
            ))}
          {kiosk && <ZoneHighlights alerts={shownAlerts} profile={profile} />}
        </PageGrid>

        {kiosk && <DimOverlay level={control?.profiles[stored.id]?.dim ?? 0} />}

        {kiosk && <AlertLayer alerts={splitAlerts.layer} onAck={ackAlert} />}

        {/* Alerts reach the island on the kiosk only; the plain page shows its idle pill. */}
        {island && (
          <DynamicIsland
            config={island}
            alerts={kiosk ? splitAlerts.island : NO_ALERTS}
            onAck={kiosk ? ackAlert : undefined}
            placement="fixed"
            page={islandPage}
            live={islandLive}
          />
        )}

        <PageDots
          enabled={pageNav}
          pages={stored.pages}
          current={profile.pageId ?? stored.pages[0].id}
          paused={stored.rotate?.enabled === true && control?.profiles[stored.id]?.rotating === false}
          onSelect={goToPage}
          onToggleRotate={() => void postControl("rotate", { profile: stored.id, state: "toggle" })}
        />

        {/* Desktop Kiosk view has no title bar: the top edge brings a strip with Back, Minimize and Close */}
        {!kiosk && isTauri() && <KioskStrip onBack={enterStudio} onClose={closeFromKiosk} />}

        {/* Floating entry to the studio (not on display-only kiosk pages) */}
        {!kiosk && (
          <button
            onClick={enterStudio}
            className="fixed bottom-4 right-4 z-50 rounded-full border bg-popover p-2.5 text-muted-foreground shadow-lg opacity-50 transition-opacity hover:opacity-100"
            title="Open dashboard studio"
          >
            <Wrench className="h-4 w-4" />
          </button>
        )}
      </div>
      </PageIslandProvider>
    </PerformanceProvider>
    </GeneralProvider>
  );
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

/** The zone grid; a new page (the caller keys it by page id) fades in, instantly with reduced motion. */
function PageGrid({ className, style, children }: { className: string; style: React.CSSProperties; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <div className={cn(className, !reduced && "page-fade-in")} style={style}>
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

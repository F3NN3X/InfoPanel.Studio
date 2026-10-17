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
import { islandFeeds } from "@/lib/island/sources";
import { modules } from "@/modules";
import { PageDots, PAGE_DOTS_STRIP_PX } from "@/components/page-dots";
import { resolveBackground } from "@/lib/appearance";
import { appearanceOf } from "@/lib/style-resolve";
import { applyTheme, resolveTheme } from "@/lib/theme";
import { fontStack, formatClock, resolveGeneral } from "@/lib/general";
import { profileGap, profilePadding } from "@/lib/profile-grid";
import { GeneralProvider, useGeneral } from "@/hooks/use-general";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { setApiBase } from "@/lib/data-api";
import { flushDone, onStudioFlush } from "@/lib/desktop";
import { trackEventSource } from "@/lib/sensor-store";
import {
  CONFIG_EVENTS_URL,
  fetchConfig,
  isUnreachable,
  NewerConfigError,
  pushConfig,
} from "@/lib/dashboard-server";
import {
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
  neighbourPage,
  postControl,
  useControl,
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
  const control = useControl(shownId, kiosk && shownId !== undefined);
  // A tap or swipe switches at once; the server's state takes over when it arrives.
  const [optimistic, setOptimistic] = useState<{ profile: string; page: string } | null>(null);
  // Kiosk: studio saves pulled since load (the island's "Layout updated").
  const [layoutVersion, setLayoutVersion] = useState(0);
  useEffect(() => setOptimistic(null), [control]);
  const forcedProfile = kiosk ? kioskProfileId({ pin: profilePin, control, config }) : undefined;
  const stored = resolveProfile(
    forcedProfile ? { ...config, activeProfile: forcedProfile } : config,
    windowSize.w,
    windowSize.h
  );
  useEffect(() => {
    if (kiosk) setShownId(stored.id);
  }, [kiosk, stored.id]);
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
  const island = profile.island?.enabled ? profile.island : undefined;
  const splitAlerts = useMemo(() => splitIslandAlerts(shownAlerts, island !== undefined), [shownAlerts, island]);
  // On the kiosk the island also gets the Data API warning and the widgets sent to it (every page).
  const quietHours = config.alerts?.quietHours;
  const pageName = stored.pages.find((p) => p.id === profile.pageId)?.name ?? "";
  const islandLive = useMemo(
    () =>
      kiosk && island
        ? { feeds: islandFeeds(stored.pages.flatMap((p) => p.placements), modules), quietHours, page: pageName, layoutVersion }
        : undefined,
    [kiosk, island, stored.pages, quietHours, pageName, layoutVersion]
  );
  const islandPage = useMemo(() => ({ width: profile.width, height: profile.height }), [profile.width, profile.height]);
  const reserve = islandReserve(island, islandPage);
  const fill = profile.fit === "fill";
  const background = resolveBackground(config, profile);
  const appearance = appearanceOf(config, profile);
  const general = useMemo(() => resolveGeneral({ general: config.general }), [config.general]);

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
  const latestConfig = useRef(config);
  latestConfig.current = config;
  // Before the server copy is read nothing is pushed, but an edit is still unpushed.
  const firstConfig = useRef(config);
  useEffect(() => {
    if (!kiosk && !synced && config !== firstConfig.current) setPushPending(true);
  }, [config, kiosk, synced]);
  useEffect(() => {
    if (kiosk || !synced || refused) return; // kiosk pages only read; don't push from them
    let superseded = false;
    setPushPending(true);
    const t = window.setTimeout(() => {
      pushConfig(config)
        .then(() => {
          setOffline(false);
          if (!superseded) setPushPending(false);
        })
        .catch((err) => {
          setOffline(isUnreachable(err));
          if (err instanceof NewerConfigError) setRefused(true);
          // Otherwise the server is offline — kiosk pages keep their last copy.
        });
    }, 400);
    return () => {
      superseded = true;
      window.clearTimeout(t);
    };
  }, [config, kiosk, synced, refused]);

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
        if (!alive || !parsed) return; // nothing saved yet — the local copy stands
        const text = JSON.stringify(parsed);
        if (last !== null && text !== last) setLayoutVersion((v) => v + 1);
        last = text;
        const merged = withPinnedProfile(mergeConfig(parsed));
        saveConfig(merged); // also seed the local copy (offline fallback)
        setConfig(merged);
      } catch {
        // Server offline — the local fallback (loadConfig) stands.
      }
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
    setStudio(true);
    window.history.replaceState(null, "", "?studio=1");
  };
  const exitStudio = () => {
    setStudio(false);
    window.history.replaceState(null, "", window.location.pathname);
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
        // An edit made since the click is still unpushed (its debounced push clears the dot).
        if (latestConfig.current === cfg) setPushPending(false);
        return true;
      })
      .catch((err) => {
        setOffline(isUnreachable(err));
        if (err instanceof NewerConfigError) setRefused(true);
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

  // The dedicated studio replaces the whole view.
  if (studio) {
    return (
      <GeneralProvider value={general}>
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
        <Suspense fallback={null}>
          <StudioView
            config={config}
            profile={profile}
            onPageChange={setStudioPage}
            setConfig={setConfig}
            windowWidth={windowSize.w}
            windowHeight={windowSize.h}
            onExitStudio={exitStudio}
            onSave={handleStudioSave}
            pushPending={pushPending}
            offline={offline}
          />
        </Suspense>
      </GeneralProvider>
    );
  }

  return (
    <GeneralProvider value={general}>
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
          fontFamily: fontStack(general.font),
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
    </GeneralProvider>
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

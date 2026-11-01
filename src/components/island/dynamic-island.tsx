import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { PulseDot } from "@/components/pulse-dot";
import { Info, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ActiveAlert, QuietHours, Severity } from "@/lib/alerts";
import { statLevel, type IslandConfig, type IslandSize, type IslandStat } from "@/lib/island/config";
import { islandBus, useIsland, type IslandBus } from "@/lib/island/bus";
import { ALERTS_SOURCE, noticeFromAlert } from "@/lib/island/from-alerts";
import { startsIn } from "@/lib/island/dashboard-notices";
import { quietGate } from "@/lib/island/quiet";
import { motionScale } from "@/lib/island/spring";
import type { IslandFeed } from "@/lib/island/sources";
import type { IslandActivity, IslandItem, IslandSnapshot } from "@/lib/island/types";
import { useDashboardNotices } from "@/lib/island/use-dashboard-notices";
import { useConnectionNotice, useIslandSources } from "@/lib/island/use-island-sources";
import { extras, type CalendarEvent } from "@/lib/extras";
import { formatReading } from "@/lib/data-points";
import { formatClock } from "@/lib/general";
import { sensorAt } from "@/lib/sensors";
import { useGeneral } from "@/hooks/use-general";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useSensors } from "@/hooks/useSensors";
import { useNow } from "@/components/widgets/hooks";
import { severityColor } from "@/components/alerts/alert-model";
import { cn } from "@/lib/utils";
import { islandClock, islandSkin, motionVars, shadowTransition, shapeSpring, springTransition, type IslandSkin } from "./island-look";
import { fitIslandSize, idleViews, islandBox, islandFontPx, islandMode, islandTop, type IdleView, type IslandMode } from "./island-model";

const ICONS: Record<Severity, LucideIcon> = { info: Info, warning: TriangleAlert, critical: OctagonAlert };
/** How long a tap on the badge or the activity opens the island, ms. */
export const PEEK_MS = 6000;
/** The bus source a tapped activity opens as. */
const ACTIVITY_PEEK = "activity";
const NO_KEYS: readonly string[] = [];
/** The colours a value turns past its thresholds. */
const LEVEL_COLOR = { warn: severityColor("warning"), crit: severityColor("critical") } as const;
/** The cue beside a coloured value, so the level does not rest on colour alone. */
const LEVEL_CUE = { warn: { Icon: TriangleAlert, word: "warning" }, crit: { Icon: OctagonAlert, word: "critical" } } as const;
/** The notch's concave corners, px at scale 100: small closed, larger open (L4 NotchBar). */
const EAR = { closed: 6, open: 14 } as const;
const SLOW = typeof location === "undefined" ? 1 : motionScale(location.search);

interface DynamicIslandProps {
  config: IslandConfig;
  /** The server alerts it shows (already filtered to this profile and to the island style). */
  alerts: readonly ActiveAlert[];
  /** Acknowledge a server alert (a tap); unset = taps do nothing (the studio canvas, the plain page). */
  onAck?: (id: string) => void;
  /** "fixed" over the kiosk window, "absolute" inside the studio's page box. */
  placement: "fixed" | "absolute";
  /** The profile's design size: a short strip or a small screen gets a smaller island. */
  page: { width: number; height: number };
  /**
   * The kiosk's own notices: the Data API warning, the widgets that send to the island, the
   * dashboard notices switched on (`config.notices`: the shown page's name, a layout update counted
   * by `layoutVersion`, plugins, OBS, the calendar), and the alerts' quiet hours for all of them.
   * Unset = server alerts only.
   */
  live?: { feeds: readonly IslandFeed[]; quietHours?: QuietHours; page: string; layoutVersion: number };
  bus?: IslandBus;
}

/**
 * The Dynamic Island: a pill (or a notch on the top edge) at the top centre of the page. Idle it
 * shows the time (and the date, live values or the next event, side by side or in turn); a live
 * activity sits beside the time; it springs open for the strongest notice on the bus, then shrinks
 * to the time with a severity badge while notices remain. Width, height and radius spring between
 * fixed boxes (`islandBox`, `shapeTransition`) while the content cross-fades; reduced motion or
 * motion off swaps them at once. On the kiosk a tap acknowledges the open alert, opens the next held
 * notice again (the badge), or opens the activity.
 */
export function DynamicIsland({ config, alerts, onAck, placement, page, live, bus = islandBus }: DynamicIslandProps) {
  const snap = useIsland(bus);
  const size = fitIslandSize(config.size, page, config.scale);

  useEffect(() => bus.setSticky(config.collapseAfter > 0 ? config.collapseAfter * 1000 : Infinity), [bus, config.collapseAfter]);
  useEffect(() => bus.setGrouping(config.group), [bus, config.group]);
  useEffect(() => bus.syncSource(ALERTS_SOURCE, alerts.map(noticeFromAlert)), [bus, alerts]);
  useEffect(() => () => bus.syncSource(ALERTS_SOURCE, []), [bus]);

  const mode = islandMode(snap, config.idle);
  return (
    <>
      {/* The sources stay mounted in one place whatever the mode, so their baseline survives. */}
      {live && <LiveSources bus={bus} config={config} live={live} />}
      {mode !== "none" && (
        <IslandPill mode={mode} snap={snap} config={config} size={size} placement={placement} onAck={onAck} bus={bus} />
      )}
    </>
  );
}

interface IslandPillProps {
  mode: Exclude<IslandMode, "none">;
  snap: IslandSnapshot;
  config: IslandConfig;
  size: IslandSize;
  placement: "fixed" | "absolute";
  onAck?: (id: string) => void;
  bus: IslandBus;
}

/** The mode before the last change, for the spring that change takes (open, close or morph). */
function usePreviousMode(mode: string): string | null {
  const ref = useRef<{ mode: string; from: string | null }>({ mode, from: null });
  if (ref.current.mode !== mode) ref.current = { mode, from: ref.current.mode };
  return ref.current.from;
}

/**
 * The content that was showing before the last change, kept for its exit (fade, blur, lift) while the
 * new content enters. Null when nothing is leaving.
 */
function useExiting(key: string, node: ReactNode, width: number, animate: boolean) {
  const shown = useRef<{ key: string; node: ReactNode; width: number } | null>(null);
  const [lastKey, setLastKey] = useState(key);
  const [exiting, setExiting] = useState<{ key: string; node: ReactNode; width: number } | null>(null);
  if (key !== lastKey) {
    setLastKey(key);
    setExiting(animate ? shown.current : null);
  }
  shown.current = { key, node, width };
  useEffect(() => {
    if (!exiting) return;
    const t = setTimeout(() => setExiting(null), Math.round(140 * SLOW));
    return () => clearTimeout(t);
  }, [exiting]);
  return exiting;
}

function IslandPill({ mode, snap, config, size, placement, onAck, bus }: IslandPillProps) {
  const reduced = useReducedMotion();
  const peekAt = useRef(0);
  const box = islandBox(mode, size, config, mode === "compact" && snap.activity !== null);
  const item = snap.expanded;
  const strongest = item ?? snap.pending[0];
  const accent = strongest ? severityColor(strongest.severity) : undefined;
  const interactive = onAck !== undefined;
  const tappable = interactive && mode !== "idle" && mode !== "line";
  const skin = islandSkin(config);
  const notch = config.shape === "notch";
  const animate = config.motion !== "off" && !reduced;
  const spring = shapeSpring(usePreviousMode(mode), mode, config.motion, reduced, SLOW);
  const shape = springTransition(spring, ["width", "height", "border-radius"]);
  const k = config.scale / 100;

  const tap = () => {
    if (item) {
      if (item.onTap === "ack" && item.alertId) onAck?.(item.alertId);
      else bus.dismiss(item.source, item.id);
    } else if (snap.pending.length > 0) {
      // Each tap opens the next held notice, strongest first.
      const next = snap.pending[peekAt.current++ % snap.pending.length];
      bus.peek(next.source, next.id, PEEK_MS);
    } else if (snap.activity) {
      const a = snap.activity;
      bus.notify({ source: ACTIVITY_PEEK, id: `${a.source}:${a.id}`, severity: "info", title: a.title, body: a.subtitle, image: a.image, ttl: PEEK_MS });
    }
  };

  const key = item ? `x:${item.key}` : mode === "compact" && snap.activity ? `c:${snap.activity.source}:${snap.activity.id}` : mode === "activity" && snap.activity ? `a:${snap.activity.source}:${snap.activity.id}` : mode;
  const content =
    mode === "line" ? null : item ? (
      <Expanded item={item} />
    ) : mode === "activity" && snap.activity ? (
      <Activity activity={snap.activity} config={config} />
    ) : mode === "compact" && snap.activity ? (
      <Activity activity={snap.activity} config={config} pending={snap.pending.length} accent={accent} />
    ) : (
      <Idle config={config} pending={snap.pending.length} accent={accent} animate={animate} />
    );
  const exiting = useExiting(key, content, box.width, animate);

  const radius = mode === "expanded" ? Math.round(box.height * 0.42) : box.height / 2;
  const notchRadius = mode === "expanded" ? Math.round(30 * k) : Math.round((mode === "line" ? 2.5 : 10) * k);
  const shapeRadius = notch ? `0 0 ${notchRadius}px ${notchRadius}px` : radius;
  const ear = Math.round((mode === "expanded" ? EAR.open : EAR.closed) * k);

  return (
    <div
      className={cn(placement, "pointer-events-none inset-x-0 z-[55] flex justify-center px-2")}
      style={{ top: islandTop(config) }}
      data-island={mode}
    >
      <div
        className={cn("relative max-w-full", animate && item?.severity === "critical" && "island-glow")}
        style={{ borderRadius: shapeRadius, transition: shape && springTransition(spring, ["border-radius"]), "--island-accent": accent } as CSSProperties}
      >
        <div
          role={item ? (item.severity === "info" ? "status" : "alert") : tappable ? "button" : undefined}
          aria-label={tappable && !item ? (snap.pending.length > 0 ? "Show next notice" : "Show details") : undefined}
          tabIndex={tappable ? 0 : undefined}
          onClick={tappable ? tap : undefined}
          onKeyDown={
            tappable
              ? (e) => {
                  if (e.target !== e.currentTarget || (e.key !== "Enter" && e.key !== " ")) return;
                  e.preventDefault();
                  tap();
                }
              : undefined
          }
          className={cn(
            "island relative flex max-w-full items-center overflow-hidden",
            tappable && "pointer-events-auto cursor-pointer select-none kiosk-focus",
            animate && "island-motion"
          )}
          style={
            {
              width: box.width,
              height: box.height,
              borderRadius: shapeRadius,
              fontSize: islandFontPx(size, config.scale),
              transition: shape && `${shape}, ${shadowTransition(SLOW)}`,
              ...skinStyle(skin, notch),
              ...(animate ? motionVars(SLOW) : {}),
              "--island-accent": accent,
            } as CSSProperties
          }
          data-shape={config.shape}
        >
          {exiting && (
            <div
              key={`exit:${exiting.key}`}
              aria-hidden
              className="island-exit pointer-events-none absolute inset-y-0 left-1/2 flex -translate-x-1/2 items-center"
              style={{ width: exiting.width }}
            >
              {exiting.node}
            </div>
          )}
          {content && (
            <div key={key} className={cn("flex h-full w-full min-w-0 items-center", animate && "island-enter")}>
              {content}
            </div>
          )}
        </div>
        {/* After the pill, so its shadow does not darken them. */}
        {notch && mode !== "line" && <Ears size={ear} color={skin.background} transition={springTransition(spring, ["width", "height", "left", "right"])} />}
      </div>
    </div>
  );
}

/** The fill, text, border, shadow and type; the notch has no top border (it sits on the edge). */
function skinStyle(skin: IslandSkin, notch: boolean): CSSProperties {
  return {
    background: skin.background,
    color: skin.color,
    border: skin.border,
    borderTop: notch && skin.border ? "none" : undefined,
    boxShadow: skin.boxShadow,
    backdropFilter: skin.backdropFilter,
    WebkitBackdropFilter: skin.backdropFilter,
    fontFamily: skin.fontFamily,
    "--island-weight": skin.fontWeight,
  } as CSSProperties;
}

/** The notch's concave top corners: the fill curving into the page edge on each side. */
function Ears({ size, color, transition }: { size: number; color: string; transition?: string }) {
  const ear = (side: "left" | "right"): CSSProperties => ({
    position: "absolute",
    top: 0,
    [side]: -size,
    width: size,
    height: size,
    background: `radial-gradient(circle farthest-side at ${side === "left" ? "0%" : "100%"} 100%, transparent calc(100% - 0.75px), ${color} 100%)`,
    transition,
  });
  return (
    <>
      <span aria-hidden style={ear("left")} />
      <span aria-hidden style={ear("right")} />
    </>
  );
}

/**
 * The kiosk's own notices, mounted only there (no stream opens on the canvas): the Data API warning,
 * the widgets' sources, and quiet hours for both.
 */
function LiveSources({ bus, config, live }: { bus: IslandBus; config: IslandConfig; live: NonNullable<DynamicIslandProps["live"]> }) {
  const { feeds, quietHours } = live;
  useEffect(() => {
    // Server alerts were filtered on the server; a tapped activity was asked for.
    bus.setGate(quietGate(quietHours, [ALERTS_SOURCE, ACTIVITY_PEEK]));
    return () => bus.setGate(null);
  }, [bus, quietHours]);
  useConnectionNotice(bus, true);
  useIslandSources(bus, feeds, true);
  useDashboardNotices(bus, { notices: config.notices, page: live.page, layoutVersion: live.layoutVersion, calendarLead: config.calendarLead });
  return null;
}

const subscribeExtras = (fn: () => void) => extras.subscribe(fn);
const noExtras = () => () => {};

/** The next calendar event still to start, while the calendar notice is on (no stream opens otherwise). */
function useNextEvent(on: boolean): CalendarEvent | null {
  const state = useSyncExternalStore(on ? subscribeExtras : noExtras, extras.getState, extras.getState);
  const now = useNow(30_000).getTime();
  if (!on) return null;
  return state.calendar.events.find((e) => !e.allDay && e.start > now) ?? null;
}

function Idle({ config, pending, accent, animate }: { config: IslandConfig; pending: number; accent?: string; animate: boolean }) {
  const event = useNextEvent(config.notices.calendar && config.rotate > 0);
  const views = idleViews(config, event !== null);
  const rotating = config.rotate > 0 && views.length > 0;
  const now = useNow(rotating ? config.rotate * 1000 : 3_600_000);
  const view = rotating ? views[Math.floor(now.getTime() / (config.rotate * 1000)) % views.length] : null;
  return (
    <div className="flex w-full min-w-0 items-center justify-center gap-[0.7em] px-[1em]">
      <IslandClock config={config} date={!rotating && config.idle === "time-date"} />
      {rotating && view ? (
        <span key={viewKey(view)} className={cn("flex min-w-0 items-center", animate && "island-enter")}>
          <IdleSlot view={view} config={config} event={event} />
        </span>
      ) : (
        config.idle === "sensor" && <IslandStats stats={config.stats} />
      )}
      <Badge pending={pending} accent={accent} />
    </div>
  );
}

/** The count of held notices beside the time, in the strongest one's colour; never shrinks or truncates. */
function Badge({ pending, accent }: { pending: number; accent?: string }) {
  if (pending <= 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-[0.35em] font-semibold tabular-nums">
      <span aria-hidden="true" className="h-[0.6em] w-[0.6em] rounded-full" style={{ background: accent }} />
      <span aria-hidden="true">{pending}</span>
      <span className="sr-only">{pending} active alerts</span>
    </span>
  );
}

const viewKey = (v: IdleView) => (v.kind === "stat" ? `stat:${v.index}` : v.kind);

function IdleSlot({ view, config, event }: { view: IdleView; config: IslandConfig; event: CalendarEvent | null }) {
  if (view.kind === "stat") return <IslandStats stats={config.stats.slice(view.index, view.index + 1)} />;
  if (view.kind === "event" && event) return <NextEvent event={event} />;
  return <IslandDate />;
}

/** The time (and date), its own component so the once-a-second tick re-renders only it. */
function IslandClock({ config, date }: { config: IslandConfig; date: boolean }) {
  const general = islandClock(useGeneral(), config);
  const now = formatClock(useNow(1000), general);
  return (
    <span className="min-w-0 truncate tabular-nums [font-weight:var(--island-weight)]">
      {now.time}
      {date && <span className="ml-[0.6em] font-normal opacity-75">{now.date}</span>}
    </span>
  );
}

function IslandDate() {
  const now = formatClock(useNow(60_000), useGeneral());
  return <span className="min-w-0 truncate opacity-75">{now.date}</span>;
}

function NextEvent({ event }: { event: CalendarEvent }) {
  const now = useNow(30_000).getTime();
  return (
    <span className="min-w-0 truncate">
      <span className="mr-[0.35em] inline-block h-[0.5em] w-[0.5em] rounded-full bg-[#3b82f6]" aria-hidden />
      <span className="opacity-80">{event.title}</span>
      <span className="ml-[0.35em] opacity-75">{startsIn(event.start - now)}</span>
    </span>
  );
}

/** Live values beside the time from the shared streams ("–" before they report), coloured past their thresholds. */
function IslandStats({ stats }: { stats: readonly IslandStat[] }) {
  const keys = useMemo(() => {
    const k = stats.map((s) => s.key).filter(Boolean);
    return k.length > 0 ? k : NO_KEYS;
  }, [stats.map((s) => s.key).join()]);
  const live = useSensors(keys);
  const shown = stats.length > 0 ? stats : [{ key: "", label: "" }];
  return (
    <>
      {shown.map((stat, i) => {
        const reading = stat.key ? sensorAt(live, stat.key) : undefined;
        const value = reading && typeof reading.value === "number" && Number.isFinite(reading.value) ? reading.value : undefined;
        const text = value !== undefined ? formatReading(value, reading?.unit) : reading?.text?.trim() || "–";
        const level = statLevel(stat, value);
        return (
          <span
            key={i}
            className={cn("min-w-0 truncate tabular-nums", !level && "opacity-80")}
            style={level ? { color: LEVEL_COLOR[level], transition: "color 300ms" } : { transition: "color 300ms" }}
            data-level={level ?? undefined}
          >
            {stat.label && <span className="mr-[0.35em] opacity-75">{stat.label}</span>}
            {level && <LevelCue level={level} />}
            {text}
          </span>
        );
      })}
    </>
  );
}

function LevelCue({ level }: { level: "warn" | "crit" }) {
  const { Icon, word } = LEVEL_CUE[level];
  return (
    <>
      <Icon className="mr-[0.25em] inline-block h-[0.85em] w-[0.85em] align-[-0.1em]" aria-hidden />
      <span className="sr-only">{word}: </span>
    </>
  );
}

/** The activity beside the time; with held notices the badge follows it, and the activity text gives way first. */
function Activity({ activity, config, pending = 0, accent }: { activity: IslandActivity; config: IslandConfig; pending?: number; accent?: string }) {
  return (
    <div className={cn("flex w-full min-w-0 items-center gap-[0.7em] pl-[1em]", pending > 0 ? "pr-[1em]" : "pr-[0.45em]")}>
      <span className="flex shrink-0">
        <IslandClock config={config} date={false} />
      </span>
      <div className="flex min-w-0 flex-1 items-center justify-end gap-[0.5em]">
        <span className="min-w-0 truncate text-right">
          <span className="[font-weight:var(--island-weight)]">{activity.title}</span>
          {activity.subtitle && <span className="ml-[0.4em] opacity-75">{activity.subtitle}</span>}
        </span>
        {activity.image ? (
          <img src={activity.image} alt="" className="h-[1.9em] w-[1.9em] shrink-0 rounded-[0.45em] object-cover" />
        ) : (
          <PulseDot color={activity.color ?? "currentColor"} pulse={activity.pulse} className="mr-[0.5em] h-[0.6em] w-[0.6em] shrink-0 rounded-full" />
        )}
      </div>
      <Badge pending={pending} accent={accent} />
      {activity.progress !== undefined && (
        <span className="absolute inset-x-[1.2em] bottom-[0.18em] h-[2px] overflow-hidden rounded-full bg-current/15" aria-hidden>
          <span className="block h-full bg-current/70" style={{ width: `${Math.round(activity.progress * 100)}%` }} />
        </span>
      )}
    </div>
  );
}

function Expanded({ item }: { item: IslandItem }) {
  const Icon = ICONS[item.severity];
  const color = severityColor(item.severity);
  return (
    <div className="flex w-full min-w-0 items-center gap-[0.8em] px-[1.1em]">
      {item.image ? (
        <img src={item.image} alt="" className="h-[2.6em] w-[2.6em] shrink-0 rounded-[0.6em] object-cover" />
      ) : (
        <span
          className="flex h-[2.4em] w-[2.4em] shrink-0 items-center justify-center rounded-full"
          style={{ background: `color-mix(in srgb, ${color} 22%, transparent)`, color }}
        >
          <Icon className="h-[1.3em] w-[1.3em]" aria-hidden />
        </span>
      )}
      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex min-w-0 items-baseline gap-[0.4em]">
          <span className="truncate [font-weight:var(--island-weight)]" title={item.title}>{item.title}</span>
          {item.count > 1 && (
            <span className="shrink-0 rounded-full bg-current/15 px-[0.45em] text-[0.78em] tabular-nums">
              <span aria-hidden="true">×{item.count}</span>
              <span className="sr-only">{item.count} notices</span>
            </span>
          )}
        </div>
        {item.body && <div className="line-clamp-2 break-words text-[0.86em] opacity-75" title={item.body}>{item.body}</div>}
        {item.progress !== undefined && (
          <div className="mt-[0.35em] h-[0.3em] overflow-hidden rounded-full bg-current/20" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(item.progress * 100)}>
            <div className="island-level h-full rounded-full" style={{ width: `${Math.round(item.progress * 100)}%`, background: color }} />
          </div>
        )}
      </div>
    </div>
  );
}

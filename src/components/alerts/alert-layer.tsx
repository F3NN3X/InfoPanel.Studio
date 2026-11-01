import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Info, OctagonAlert, TriangleAlert, type LucideIcon } from "lucide-react";
import type { ActiveAlert, Severity } from "@/lib/alerts";
import type { ControlState } from "@/lib/control";
import { postControl } from "@/lib/control";
import type { ProfileView } from "@/lib/layout";
import { modules } from "@/modules";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cn } from "@/lib/utils";
import {
  ageLabel,
  backdropOf,
  cardClasses,
  countdownFraction,
  enterFrom,
  gridCell,
  groupBySlot,
  highlightZones,
  severityColor,
  visibleAlerts,
  type Slot,
} from "./alert-model";

const ICONS: Record<Severity, LucideIcon> = { info: Info, warning: TriangleAlert, critical: OctagonAlert };

/** How long a leaving alert stays mounted for its exit animation. */
const EXIT_MS = 220;

/**
 * The alerts a kiosk shows (see `visibleAlerts`) minus the ones just tapped, which hide at once
 * while the server's acknowledgement is on its way.
 */
export function useShownAlerts(control: ControlState | null, profileId: string | undefined) {
  const [acked, setAcked] = useState<ReadonlySet<string>>(new Set());
  const alerts = control?.alerts;
  const shown = useMemo(
    () => visibleAlerts(alerts ?? [], profileId).filter((a) => !acked.has(a.id)),
    [alerts, profileId, acked]
  );
  const ack = useCallback((id: string) => {
    setAcked((s) => new Set(s).add(id));
    void postControl("alert", { id, action: "ack" }).then((res) => {
      if (res === null) {
        setAcked((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
      }
    });
  }, []);
  return { shown, ack };
}

/** Alerts plus the ones still animating out. */
function useWithExiting(shown: readonly ActiveAlert[], animate: boolean) {
  const [leaving, setLeaving] = useState<ActiveAlert[]>([]);
  const [last, setLast] = useState<readonly ActiveAlert[]>(shown);
  if (last !== shown) {
    setLast(shown);
    if (animate) {
      const ids = new Set(shown.map((a) => a.id));
      const gone = last.filter((a) => !ids.has(a.id) && !leaving.some((l) => l.id === a.id));
      if (gone.length > 0) setLeaving([...leaving.filter((l) => !ids.has(l.id)), ...gone]);
    }
  }
  useEffect(() => {
    if (leaving.length === 0) return;
    const t = window.setTimeout(() => setLeaving([]), EXIT_MS);
    return () => window.clearTimeout(t);
  }, [leaving]);
  return { items: [...shown, ...leaving], leavingIds: new Set(leaving.map((a) => a.id)) };
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [active]);
  return now;
}

interface AlertLayerProps {
  alerts: readonly ActiveAlert[];
  onAck: (id: string) => void;
}

/** The kiosk's alert display: toasts, banners and overlays over the grid, with an optional backdrop. */
export function AlertLayer({ alerts, onAck }: AlertLayerProps) {
  const reduced = useReducedMotion();
  const { items, leavingIds } = useWithExiting(alerts, !reduced);
  const now = useNow(items.length > 0);
  const slots = useMemo(() => groupBySlot(items), [items]);
  const backdrop = backdropOf(alerts);
  if (items.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60]" data-alert-layer>
      {backdrop !== "none" && (
        // Swallows touches so the dashboard under it is not interactive.
        <div
          className={cn(
            "pointer-events-auto absolute inset-0",
            backdrop === "dim" ? "bg-background/55" : "bg-background/25 backdrop-blur-[8px]"
          )}
        />
      )}
      <div className="absolute inset-0 grid grid-cols-3 grid-rows-3 gap-4 p-4">
        {slots
          .filter((s) => s.key !== "banner-top" && s.key !== "banner-bottom")
          .map((slot) => (
            <SlotStack key={slot.key} slot={slot} now={now} leavingIds={leavingIds} reduced={reduced} onAck={onAck} />
          ))}
      </div>
      {slots
        .filter((s) => s.key === "banner-top" || s.key === "banner-bottom")
        .map((slot) => (
          <SlotStack key={slot.key} slot={slot} now={now} leavingIds={leavingIds} reduced={reduced} onAck={onAck} />
        ))}
    </div>
  );
}

interface SlotStackProps {
  slot: Slot;
  now: number;
  leavingIds: ReadonlySet<string>;
  reduced: boolean;
  onAck: (id: string) => void;
}

function SlotStack({ slot, now, leavingIds, reduced, onAck }: SlotStackProps) {
  const edge = slot.key === "banner-top" || slot.key === "banner-bottom";
  const cell = edge ? null : gridCell(slot.key as Parameters<typeof gridCell>[0]);
  const col = cell?.col ?? 2;
  const style: CSSProperties = cell ? { gridColumn: cell.col, gridRow: cell.row } : {};
  const from = enterFrom(slot.key);
  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-col gap-2",
        edge && "absolute inset-x-0",
        slot.key === "banner-top" && "top-0",
        slot.key === "banner-bottom" && "bottom-0",
        !edge && cell?.row === 1 && "justify-start",
        !edge && cell?.row === 2 && "justify-center",
        !edge && cell?.row === 3 && "justify-end",
        !edge && col === 1 && "items-start",
        !edge && col === 2 && "items-center",
        !edge && col === 3 && "items-end"
      )}
      style={style}
    >
      {slot.shown.map((a) => (
        <AlertCard
          key={a.id}
          alert={a}
          now={now}
          from={from}
          leaving={leavingIds.has(a.id)}
          reduced={reduced}
          onAck={onAck}
        />
      ))}
      {slot.more > 0 && (
        <div className="pointer-events-auto rounded-full bg-card/90 px-3 py-1 text-xs font-medium text-muted-foreground shadow">
          +{slot.more} more
        </div>
      )}
    </div>
  );
}

interface AlertCardProps {
  alert: ActiveAlert;
  now: number;
  from: ReturnType<typeof enterFrom>;
  leaving: boolean;
  reduced: boolean;
  onAck: (id: string) => void;
}

function AlertCard({ alert, now, from, leaving, reduced, onAck }: AlertCardProps) {
  const Icon = ICONS[alert.severity];
  const color = severityColor(alert.severity);
  const fraction = countdownFraction(alert, now);
  const overlay = alert.display.style === "overlay";
  return (
    <div
      data-alert-id={alert.id}
      onClick={() => onAck(alert.id)}
      className={cn(
        "pointer-events-auto relative cursor-pointer select-none overflow-hidden border bg-card text-card-foreground shadow-xl",
        cardClasses(alert),
        !reduced && (leaving ? "alert-out" : `alert-in-${from}`)
      )}
      style={{ borderColor: color, boxShadow: `0 8px 30px -8px ${color}` }}
    >
      <div className={cn("flex items-start gap-3", overlay && "gap-5")}>
        <Icon className={cn("mt-0.5 shrink-0", overlay ? "h-10 w-10" : "h-[1.4em] w-[1.4em]")} style={{ color }} aria-hidden />
        {/* The live region holds the title and text; the age label ticks every minute and stays out of it. */}
        <div role={alert.severity === "info" ? "status" : "alert"} className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <div className="line-clamp-2 break-words font-semibold">{alert.title ?? alert.name}</div>
            <div aria-hidden className="shrink-0 text-[0.75em] text-muted-foreground">{ageLabel(alert, now)}</div>
          </div>
          {alert.text && <div className="mt-0.5 whitespace-pre-line text-[0.9em] text-muted-foreground">{alert.text}</div>}
        </div>
      </div>
      {/* Keyboard path for the whole-card tap: shown on focus only. The click reaches the card's handler. */}
      <button
        type="button"
        aria-label={`Dismiss ${alert.title ?? alert.name}`}
        className="alert-dismiss kiosk-focus sr-only"
      >
        Dismiss
      </button>
      {fraction !== null && (
        <div
          className="absolute inset-x-0 bottom-0 h-1 origin-left"
          style={{
            background: color,
            transform: `scaleX(${fraction})`,
            transition: reduced ? undefined : "transform 1s linear",
          }}
        />
      )}
    </div>
  );
}

interface ZoneHighlightsProps {
  alerts: readonly ActiveAlert[];
  profile: ProfileView;
}

/**
 * A severity ring over each zone a shown alert points at. Drawn as grid items on top of the
 * zones (the zone frames live in the studio), so it never changes a zone's layout.
 */
export function ZoneHighlights({ alerts, profile }: ZoneHighlightsProps) {
  const reduced = useReducedMotion();
  const zones = useMemo(() => highlightZones(alerts, profile, modules), [alerts, profile]);
  if (zones.size === 0) return null;
  return (
    <>
      {profile.placements
        .filter((p) => zones.has(p.id))
        .map((p) => (
          <div
            key={p.id}
            aria-hidden
            data-alert-ring={p.id}
            className={cn("pointer-events-none z-20 rounded-lg alert-ring", !reduced && "alert-ring-pulse")}
            style={{
              gridColumn: `${p.colStart} / span ${Math.max(1, Math.min(profile.cols, p.colSpan))}`,
              gridRow: `${p.rowStart} / span ${Math.max(1, p.rowSpan)}`,
              ["--alert-ring" as string]: severityColor(zones.get(p.id) as Severity),
            }}
          />
        ))}
    </>
  );
}

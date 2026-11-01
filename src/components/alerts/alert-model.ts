import type { ActiveAlert, AlertBackdrop, AlertPosition, AlertSize, Severity } from "@/lib/alerts";
import { computeUsage, type ModuleInfo } from "@/lib/data-usage";
import type { ProfileView } from "@/lib/layout";

/** Most alerts a slot shows at once; the rest collapse into "+N more". */
export const MAX_PER_SLOT = 3;

/** Alerts a kiosk showing `profileId` displays: not acknowledged, not quiet, for this profile. */
export function visibleAlerts(alerts: readonly ActiveAlert[], profileId: string | undefined): ActiveAlert[] {
  return alerts.filter(
    (a) =>
      !a.acknowledged &&
      !a.quiet &&
      (!a.profiles || a.profiles.length === 0 || (profileId !== undefined && a.profiles.includes(profileId)))
  );
}

export type EdgeSlot = "banner-top" | "banner-bottom";
export type SlotKey = AlertPosition | EdgeSlot;

/** Banners are full-width strips: the top row sits at the top, every other row at the bottom. */
export function slotOf(alert: ActiveAlert): SlotKey {
  const { style, position } = alert.display;
  if (style !== "banner") return position;
  return position.startsWith("bottom") ? "banner-bottom" : "banner-top";
}

export interface Slot {
  key: SlotKey;
  /** Newest first, at most MAX_PER_SLOT. */
  shown: ActiveAlert[];
  more: number;
}

/** Group alerts by anchor slot: newest first, `MAX_PER_SLOT` visible, the rest counted. */
export function groupBySlot(alerts: readonly ActiveAlert[]): Slot[] {
  const groups = new Map<SlotKey, ActiveAlert[]>();
  for (const a of [...alerts].sort((x, y) => y.startedAt - x.startedAt)) {
    const key = slotOf(a);
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  return [...groups].map(([key, list]) => ({
    key,
    shown: list.slice(0, MAX_PER_SLOT),
    more: Math.max(0, list.length - MAX_PER_SLOT),
  }));
}

/** The strongest backdrop any of the alerts asks for. */
export function backdropOf(alerts: readonly ActiveAlert[]): AlertBackdrop {
  if (alerts.some((a) => a.display.backdrop === "blur")) return "blur";
  return alerts.some((a) => a.display.backdrop === "dim") ? "dim" : "none";
}

const TOAST_WIDTH: Record<AlertSize, string> = { s: "w-[260px]", m: "w-[320px]", l: "w-[360px]" };
const BANNER_TEXT: Record<AlertSize, string> = { s: "text-sm", m: "text-base", l: "text-xl" };
const OVERLAY_WIDTH: Record<AlertSize, string> = { s: "w-[420px]", m: "w-[560px]", l: "w-[760px]" };
const OVERLAY_TEXT: Record<AlertSize, string> = { s: "text-lg", m: "text-2xl", l: "text-4xl" };
const TOAST_TEXT: Record<AlertSize, string> = { s: "text-xs", m: "text-sm", l: "text-base" };

/** Classes for the alert's card by style and size. */
export function cardClasses(alert: ActiveAlert): string {
  const { style, size } = alert.display;
  if (style === "banner") return `w-full rounded-none px-6 py-3 ${BANNER_TEXT[size]}`;
  if (style === "overlay") return `max-w-[92vw] rounded-2xl p-8 ${OVERLAY_WIDTH[size]} ${OVERLAY_TEXT[size]}`;
  return `max-w-[92vw] rounded-xl p-3.5 ${TOAST_WIDTH[size]} ${TOAST_TEXT[size]}`;
}

/** The slot's place in the 3x3 layer grid (column, row; 1-based). Edge slots are not in the grid. */
export function gridCell(position: AlertPosition): { col: number; row: number } {
  const row = position.startsWith("top") ? 1 : position.startsWith("bottom") ? 3 : 2;
  const col = position.endsWith("left") || position === "left" ? 1 : position.endsWith("right") || position === "right" ? 3 : 2;
  return { col, row };
}

/** Which side an alert slides in from (fades for the centre). */
export function enterFrom(key: SlotKey): "top" | "bottom" | "left" | "right" | "none" {
  if (key === "banner-top") return "top";
  if (key === "banner-bottom") return "bottom";
  if (key === "center") return "none";
  if (key === "left" || key === "top-left" || key === "bottom-left") return "left";
  if (key === "right" || key === "top-right" || key === "bottom-right") return "right";
  return key === "top" ? "top" : "bottom";
}

/** Share of the display time left, 1 -> 0; null when it stays until acknowledged. */
export function countdownFraction(alert: ActiveAlert, now: number): number | null {
  const seconds = alert.display.seconds;
  if (!(seconds > 0)) return null;
  return Math.max(0, Math.min(1, 1 - (now - alert.startedAt) / (seconds * 1000)));
}

/** "now", "2 min", "3 h". */
export function ageLabel(alert: ActiveAlert, now: number): string {
  const minutes = Math.floor((now - alert.startedAt) / 60_000);
  if (minutes < 1) return "now";
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h`;
}

export const WARNING_COLOR = "hsl(38 92% 50%)";

/** The severity accent: info = primary, warning = amber, critical = --alert-critical (destructive is a fill, too dark as a line). */
export function severityColor(severity: Severity): string {
  if (severity === "warning") return WARNING_COLOR;
  return severity === "critical" ? "var(--alert-critical)" : "hsl(var(--primary))";
}

const RANK: Record<Severity, number> = { info: 0, warning: 1, critical: 2 };

/**
 * Zones to ring on the shown page, with the strongest severity asking for each: the alert's own
 * `highlight.zones`, else the zones that read `highlight.key`.
 */
export function highlightZones(
  alerts: readonly ActiveAlert[],
  profile: ProfileView,
  mods: readonly ModuleInfo[]
): Map<string, Severity> {
  const onPage = new Set(profile.placements.filter((p) => p.visible).map((p) => p.id));
  const out = new Map<string, Severity>();
  for (const a of alerts) {
    if (!a.highlight) continue;
    const zones =
      a.highlight.zones && a.highlight.zones.length > 0
        ? a.highlight.zones
        : a.highlight.key
          ? [...computeUsage(profile, [a.highlight.key], mods).byZone.keys()]
          : [];
    for (const id of zones) {
      if (!onPage.has(id)) continue;
      const prev = out.get(id);
      if (prev === undefined || RANK[a.severity] > RANK[prev]) out.set(id, a.severity);
    }
  }
  return out;
}

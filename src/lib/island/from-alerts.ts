import type { ActiveAlert } from "@/lib/alerts";
import type { IslandNotice } from "./types";

/** The bus source server alerts sync into. */
export const ALERTS_SOURCE = "alerts";

/** Alerts whose rule picked the island display. */
export const isIslandAlert = (a: ActiveAlert) => a.display.style === "island";

/**
 * Split the alerts a kiosk shows between the island and the alert layer. Without an island on the
 * profile, island alerts show in the layer as a top toast, so every alert still shows once.
 */
export function splitIslandAlerts(
  alerts: readonly ActiveAlert[],
  islandOn: boolean
): { island: ActiveAlert[]; layer: ActiveAlert[] } {
  const island = islandOn ? alerts.filter(isIslandAlert) : [];
  const layer = alerts
    .filter((a) => !islandOn || !isIslandAlert(a))
    .map((a) => (isIslandAlert(a) ? { ...a, display: { ...a.display, style: "toast" as const, position: "top" as const } } : a));
  return { island, layer };
}

/** A server alert as an island notice: open for the rule's display seconds (0 = until tapped), a tap acknowledges. */
export const noticeFromAlert = (a: ActiveAlert): IslandNotice => ({
  source: ALERTS_SOURCE,
  id: a.id,
  severity: a.severity,
  title: a.title ?? a.name,
  ...(a.text ? { body: a.text } : {}),
  ttl: Math.max(0, a.display.seconds) * 1000,
  onTap: "ack",
  alertId: a.id,
  badge: true,
});

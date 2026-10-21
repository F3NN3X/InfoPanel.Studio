// What Weather and Notifications send to the Dynamic Island (`src/lib/island/sources.ts`): rain or
// snow starting, and Windows notifications from the apps on an allow-list. Each `derive` is pure;
// `prev` null is the baseline and raises nothing.
import type { DataSourceDef } from "@/lib/island/sources";
import type { Data } from "../core/types";
import { get, has, num } from "../core/data";
import { boolSetting, textSetting } from "../registry/settings-kit";

const YR = "plugins.yr-weather-plugin.";

/** The Yr location the widget shows: its chosen one, else the first. */
function yrBase(d: Data, location: unknown): string | undefined {
  const slug = typeof location === "string" && location ? location : Object.keys(d).map((k) => k.match(/^plugins\.yr-weather-plugin\.([^.]+)\.temp$/)?.[1]).find(Boolean);
  return slug ? `${YR}${slug}.` : undefined;
}

/** Rain or snow starting at the widget's location (the next hour's amount turning above 0). */
export const weatherIsland: DataSourceDef = {
  from: "data",
  hint: "Rain or snow starting (Yr)",
  defaultOn: false,
  group: "Current conditions",
  derive(prev, next, settings) {
    const base = yrBase(next, settings.location);
    if (!prev || !base) return {};
    const place = get(next, `${base}name`);
    for (const kind of ["snow", "rain"] as const) {
      const now = num(get(next, `${base}${kind}`));
      const was = num(get(prev, `${base}${kind}`));
      if (Number.isFinite(was) && was <= 0 && now > 0) {
        return {
          notices: [{ id: kind, severity: "info", title: kind === "snow" ? "Snow starting" : "Rain starting", body: `${now} mm/h${has(place) ? ` · ${place}` : ""}`, ttl: 6000, cooldownMs: 3_600_000 }],
        };
      }
    }
    return {};
  },
};

/** The Notifications plugin (2.0+) publishes the newest Windows notification here as JSON. */
export const NOTIFICATION_LATEST = "plugins.InfoPanel.Notifications.windows.latest";
/** The app names it has seen (a JSON array). */
export const NOTIFICATION_APPS = "plugins.InfoPanel.Notifications.windows.apps";

interface WindowsNotification {
  id: string;
  app: string;
  title: string;
  body: string;
}

/** The newest notification, or null when there is none or it does not parse. */
export function latestNotification(d: Data): WindowsNotification | null {
  try {
    const raw: unknown = JSON.parse(get(d, NOTIFICATION_LATEST));
    if (typeof raw !== "object" || raw === null) return null;
    const r = raw as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "");
    return str(r.id) ? { id: str(r.id), app: str(r.app), title: str(r.title), body: str(r.body) } : null;
  } catch {
    return null;
  }
}

/** A Windows notification from an app on the list; an empty list lets none through. */
export const notificationsIsland: DataSourceDef = {
  from: "data",
  hint: "Windows notifications from the apps you list (Notifications plugin 2.0+)",
  defaultOn: false,
  group: "Content",
  options: [
    textSetting("islandApps", "Apps", "", { suggestKey: NOTIFICATION_APPS, hint: "Only these apps reach the island; none until you add one" }),
    boolSetting("islandBody", "Show the message", true, { hint: "Off shows only the app and title, for privacy" }),
  ],
  derive(prev, next, settings) {
    const now = latestNotification(next);
    const was = prev && latestNotification(prev);
    // No notification before (or its key had not come yet) is no baseline.
    if (!was || !now || now.id === was.id) return {};
    const apps = String(settings.islandApps ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (!apps.includes(now.app.toLowerCase())) return {};
    const body = [now.title, settings.islandBody === false ? "" : now.body].filter(Boolean).join("\n");
    return {
      notices: [{ id: `toast:${now.id}`, group: now.app, severity: "info", title: now.app, ...(body ? { body } : {}), ttl: 6000 }],
    };
  },
};

import { useEffect, useRef, useState } from "react";
import { trackEventSource } from "@/lib/sensor-store";
import type { ActiveAlert, AlertAction } from "./alerts";
import type { DashboardConfig, MonitorProfile } from "./layout";

/**
 * The control channel — runtime state the server holds (server/control.mjs):
 * the page each profile shows, a profile override, page auto-rotation, the alert mute and the
 * kiosk's reload, dim and island controls.
 * Kiosks and the studio read it over one SSE stream and write it with POSTs;
 * none of it is config, so none of it enters the undo history.
 */

export const CONTROL_URL = "/api/control";
export const CONTROL_EVENTS_URL = "/events/control";

/** What the server publishes (`publicState`). */
export interface ControlState {
  /** The profile override; null = no override. */
  profile: string | null;
  /** The profile a kiosk last reported showing. */
  shown: string | null;
  profiles: Record<string, ControlProfile>;
  /** The alerts the server holds right now (see alerts.ts). */
  alerts?: ActiveAlert[];
  /** Alerts are muted until this time (epoch ms); null = not muted. */
  mutedUntil: number | null;
  /** The global reload counter; a kiosk reloads when it, or its profile's, grows. */
  reload: number;
  /** Client only: which connection delivered this state (changes on every reconnect). */
  link?: number;
}

/** One profile in the control state. */
export interface ControlProfile {
  page: string | null;
  rotating: boolean;
  override: "on" | "off" | null;
  /** The dim level: 0 = off, else the black overlay's opacity. */
  dim: number;
  /** Whether the island shows: the override, else the saved `island.enabled`. */
  island: boolean;
  islandOverride: "on" | "off" | null;
  reload: number;
}

export type ControlAction = "page" | "profile" | "rotate" | "touch" | "alert" | "kiosk";

/** A kiosk action: reload, dim or the island. `profile` unset = the usual target (every kiosk for reload). */
export type KioskAction =
  | { action: "reload"; profile?: string }
  | { action: "dim"; profile?: string; state?: "on" | "off" | "toggle"; level?: number }
  | { action: "island"; profile?: string; state?: "on" | "off" | "toggle" | "saved" };

/**
 * Send a control action. Resolves to the new state, or null when the server
 * is offline or refuses — callers never have to catch.
 */
export async function postControl(
  action: "alert",
  body: AlertAction | { action: "mute"; minutes: number },
): Promise<{ alerts: ActiveAlert[]; mutedUntil: number | null } | null>;
export async function postControl(action: "kiosk", body: KioskAction): Promise<ControlState | null>;
export async function postControl(action: ControlAction, body: object): Promise<ControlState | null>;
export async function postControl(action: ControlAction, body: object): Promise<unknown> {
  try {
    const res = await fetch(`${CONTROL_URL}/${action}`, {
      method: "POST",
      // The custom header makes a cross-site POST preflight (see server.mjs).
      headers: { "Content-Type": "application/json", "X-Dashboard-Control": "1" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

let connections = 0;

/**
 * The latest control state, or null until the first message (and while the
 * server is unreachable). `shownProfile` tells the server which profile this
 * kiosk shows. One subscription per page — never per zone. `enabled` off
 * opens nothing.
 */
export function useControl(shownProfile?: string, enabled = true): ControlState | null {
  const [state, setState] = useState<ControlState | null>(null);
  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;
    const url = shownProfile ? `${CONTROL_EVENTS_URL}?profile=${encodeURIComponent(shownProfile)}` : CONTROL_EVENTS_URL;
    const events = trackEventSource(new EventSource(url));
    let link = 0;
    events.onopen = () => {
      link = ++connections;
    };
    events.onmessage = (e) => {
      try {
        setState({ ...(JSON.parse(e.data) as ControlState), link });
      } catch {
        // A malformed message: keep the last state.
      }
    };
    return () => events.close();
  }, [shownProfile, enabled]);
  return state;
}

/**
 * The page a kiosk shows: the `?page=` pin when the profile has it, else the
 * control channel's page for the profile when it still exists, else undefined
 * (the first page).
 */
export function kioskPageId(args: {
  pin: string | undefined;
  control: ControlState | null;
  profile: Pick<MonitorProfile, "id" | "pages">;
}): string | undefined {
  const has = (id: string | null | undefined): id is string =>
    id != null && args.profile.pages.some((p) => p.id === id);
  if (has(args.pin)) return args.pin;
  const page = args.control?.profiles[args.profile.id]?.page;
  return has(page) ? page : undefined;
}

/**
 * The profile a kiosk shows when something forces it: the `?profile=` pin
 * (each kiosk window keeps its own), then the control channel's override.
 * Undefined = resolve as usual (the config's pin, or by window size).
 */
export function kioskProfileId(args: {
  pin: string | null | undefined;
  control: ControlState | null;
  config: Pick<DashboardConfig, "profiles">;
}): string | undefined {
  const has = (id: string | null | undefined): id is string =>
    id != null && args.config.profiles.some((p) => p.id === id);
  if (has(args.pin)) return args.pin;
  return has(args.control?.profile) ? args.control.profile : undefined;
}

/** The state with one profile's page set (a local, optimistic switch). */
export function withControlPage(control: ControlState | null, profileId: string, page: string): ControlState {
  const base = control ?? { profile: null, shown: null, profiles: {}, mutedUntil: null, reload: 0 };
  const was = base.profiles[profileId] ?? {
    page: null, rotating: false, override: null, dim: 0, island: false, islandOverride: null, reload: 0,
  };
  return { ...base, profiles: { ...base.profiles, [profileId]: { ...was, page } } };
}

/** The page before or after `current`, wrapping; undefined with fewer than two pages. */
export function neighbourPage(pageIds: string[], current: string, delta: 1 | -1): string | undefined {
  if (pageIds.length < 2) return undefined;
  const i = Math.max(0, pageIds.indexOf(current));
  return pageIds[(i + delta + pageIds.length) % pageIds.length];
}

/** Whether the island shows on a profile: the control state's word, else the saved config. */
export function islandEffective(control: ControlState | null, profile: Pick<MonitorProfile, "id" | "island">): boolean {
  return control?.profiles[profile.id]?.island ?? profile.island?.enabled === true;
}

/** What a kiosk compares to decide on a reload: the larger of the global and the profile's counter. */
export function reloadStamp(control: ControlState, profileId: string): number {
  return Math.max(control.reload, control.profiles[profileId]?.reload ?? 0);
}

export interface ReloadBaseline {
  link: number | undefined;
  profile: string;
  stamp: number;
}

/**
 * The reload decision for one control message. The first message of a connection (or for another profile)
 * only sets the baseline, so a fresh load or a reconnect never reloads by itself; a later, larger counter does.
 */
export function reloadCheck(
  baseline: ReloadBaseline | null,
  control: ControlState,
  profileId: string,
): { baseline: ReloadBaseline; reload: boolean } {
  const stamp = reloadStamp(control, profileId);
  const next = { link: control.link, profile: profileId, stamp };
  if (!baseline || baseline.link !== control.link || baseline.profile !== profileId) {
    return { baseline: next, reload: false };
  }
  return { baseline: stamp > baseline.stamp ? next : baseline, reload: stamp > baseline.stamp };
}

/** Kiosk only: reload the page when the server's reload counter grows (Stream Deck "reload kiosk"). */
export function useKioskReload(control: ControlState | null, profileId: string, enabled: boolean): void {
  const baseline = useRef<ReloadBaseline | null>(null);
  useEffect(() => {
    if (!enabled || !control) return;
    const check = reloadCheck(baseline.current, control, profileId);
    baseline.current = check.baseline;
    if (check.reload) window.location.reload();
  }, [control, profileId, enabled]);
}

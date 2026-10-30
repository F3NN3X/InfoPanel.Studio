/**
 * The server's extras: what the dashboard server learns from OBS and the calendar links
 * (ips-server's extras.rs). Kiosks read only this state; the OBS password and the calendar URLs stay on
 * the server (`/api/integrations`). One shared EventSource, opened on the first subscriber.
 */

import { trackEventSource } from "@/lib/sensor-store";
import { EMPTY_AGENTS, parseAgents, type Agents } from "./agents";

export interface ObsState {
  /** An OBS connection is set up (host and port saved). */
  configured: boolean;
  connected: boolean;
  streaming: boolean;
  recording: boolean;
}

/** One OBS scene: `id` is its uuid (its name on an OBS that sends none); `sub` and `icon` are the look saved for it. */
export interface ObsScene {
  id: string;
  name: string;
  sub: string;
  icon: string;
}

/** What the connection knows besides the on-air flags; sent only while OBS is connected (`parseExtras` fills the rest). */
export interface ObsLive {
  /** As OBS's own panel shows them, top to bottom. */
  scenes: ObsScene[];
  /** The program scene's id. */
  currentScene: string;
  /** Seconds on air. */
  uptime: number;
  kbps: number;
  fps: number;
  /** The configured mic input; null when none is set. */
  mic: { name: string; muted: boolean; level: number } | null;
  /** null when OBS has no replay buffer. */
  replay: { active: boolean } | null;
  /** The audio inputs, for the settings' mic picker. */
  inputs: string[];
}

export interface CalendarEvent {
  /** Stable per occurrence (uid and start). */
  id: string;
  title: string;
  /** Unix ms. */
  start: number;
  end: number;
  allDay: boolean;
  location?: string;
}

export interface CalendarState {
  configured: boolean;
  /** The upcoming occurrences, soonest first (the next 36 hours). */
  events: CalendarEvent[];
  /** The last fetch error, for the studio. */
  error?: string;
}

export interface Extras {
  obs: ObsState & ObsLive;
  calendar: CalendarState;
  /** The coding agents' sessions, plan use and token history (`src/lib/agents.ts`). */
  agents: Agents;
  /** Viewers on the stream, once a Twitch or YouTube connection reports them. */
  twitch?: { viewers: number };
  youtube?: { viewers: number };
}

export const EMPTY_OBS_LIVE: ObsLive = { scenes: [], currentScene: "", uptime: 0, kbps: 0, fps: 0, mic: null, replay: null, inputs: [] };

export const EMPTY_EXTRAS: Extras = {
  obs: { configured: false, connected: false, streaming: false, recording: false, ...EMPTY_OBS_LIVE },
  calendar: { configured: false, events: [] },
  agents: EMPTY_AGENTS,
};

export const EXTRAS_EVENTS_URL = "/events/extras";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
const text = (v: unknown): string => (typeof v === "string" ? v : "");

/** Tolerant read of the OBS fields the server adds while connected. */
function parseObsLive(o: Record<string, unknown>): ObsLive {
  const scenes = (Array.isArray(o.scenes) ? o.scenes : []).flatMap((s): ObsScene[] =>
    isObject(s) && text(s.id) ? [{ id: text(s.id), name: text(s.name) || text(s.id), sub: text(s.sub), icon: text(s.icon) }] : []
  );
  const mic = isObject(o.mic) && text(o.mic.name) ? { name: text(o.mic.name), muted: o.mic.muted === true, level: Math.min(100, count(o.mic.level)) } : null;
  return {
    scenes,
    currentScene: text(o.currentScene),
    uptime: count(o.uptime),
    kbps: count(o.kbps),
    fps: count(o.fps),
    mic,
    replay: isObject(o.replay) ? { active: o.replay.active === true } : null,
    inputs: (Array.isArray(o.inputs) ? o.inputs : []).filter((n): n is string => typeof n === "string" && n !== ""),
  };
}

/** A platform's viewer count, when the server reports one. */
const viewers = (v: unknown): { viewers: number } | undefined => (isObject(v) && typeof v.viewers === "number" && Number.isFinite(v.viewers) ? { viewers: Math.max(0, v.viewers) } : undefined);

/** Tolerant read of the server's message. */
export function parseExtras(raw: unknown): Extras {
  if (!isObject(raw)) return EMPTY_EXTRAS;
  const o = isObject(raw.obs) ? raw.obs : {};
  const c = isObject(raw.calendar) ? raw.calendar : {};
  const events = (Array.isArray(c.events) ? c.events : []).flatMap((e): CalendarEvent[] => {
    if (!isObject(e) || typeof e.id !== "string" || typeof e.start !== "number" || typeof e.end !== "number") return [];
    return [
      {
        id: e.id,
        title: typeof e.title === "string" && e.title ? e.title : "Event",
        start: e.start,
        end: e.end,
        allDay: e.allDay === true,
        ...(typeof e.location === "string" && e.location ? { location: e.location } : {}),
      },
    ];
  });
  return {
    obs: { configured: o.configured === true, connected: o.connected === true, streaming: o.streaming === true, recording: o.recording === true, ...parseObsLive(o) },
    calendar: { configured: c.configured === true, events, ...(typeof c.error === "string" && c.error ? { error: c.error } : {}) },
    agents: parseAgents(raw.agents),
    ...(viewers(raw.twitch) ? { twitch: viewers(raw.twitch) } : {}),
    ...(viewers(raw.youtube) ? { youtube: viewers(raw.youtube) } : {}),
  };
}

type Listener = (state: Extras) => void;

/** The shared extras client: `getState` / `subscribe` (an `IslandStore`). */
function createExtrasClient(url: string) {
  let state = EMPTY_EXTRAS;
  let source: EventSource | null = null;
  const listeners = new Set<Listener>();
  const open = () => {
    if (source || typeof EventSource === "undefined") return;
    source = trackEventSource(new EventSource(url));
    source.onmessage = (e) => {
      try {
        state = parseExtras(JSON.parse(String(e.data)));
      } catch {
        return;
      }
      for (const l of listeners) l(state);
    };
  };
  return {
    getState: (): Extras => state,
    subscribe(fn: Listener): () => void {
      listeners.add(fn);
      open();
      return () => {
        listeners.delete(fn);
        if (listeners.size === 0) {
          source?.close();
          source = null;
        }
      };
    },
  };
}

export const extras = createExtrasClient(EXTRAS_EVENTS_URL);
